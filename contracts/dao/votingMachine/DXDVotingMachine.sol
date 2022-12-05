// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import {RealMath} from "../../utils/RealMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./IDXDVotingMachineCallbacks.sol";
import "./ProposalExecuteInterface.sol";

/**
 * @title Fork of Genesis Protocol Voting Machine for DXdao
 *
 * @dev A voting machine is used to to determine the outcome of a dao proposal.
 * The proposals are submitted through schemes.
 * Each scheme has voting parameters and a staking token balance and ETH balance.
 * The proposals can be executed in two final states, Queue or Boost.
 * A boosted proposal is a proposal that received a favorable stake on an option.
 * An stake is deposit done in the staking token, this adds a financial incentive
 * and risk on a proposal to be executed faster.
 * A proposal in queue needs at least 50% (or more) of votes in favour in order to
 * be executed.
 * A proposal in boost state might need a % of votes in favour in order to be executed.
 * If a proposal ended and it has staked tokens on it the tokens can be redeemed by
 * the stakers.
 * If a staker staked on the winning option it receives a reward.
 * If a staker staked on a loosing option it lose his stake.
 */
contract DXDVotingMachine {
    using ECDSA for bytes32;
    using Math for uint256;
    using RealMath for uint216;
    using RealMath for uint256;
    using Address for address;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    enum ProposalState {
        None,
        Expired,
        ExecutedInQueue,
        ExecutedInBoost,
        Queued,
        PreBoosted,
        Boosted,
        QuietEndingPeriod
    }
    enum ExecutionState {
        None,
        Failed,
        QueueBarCrossed,
        QueueTimeOut,
        PreBoostedBarCrossed,
        BoostedTimeOut,
        BoostedBarCrossed
    }

    // Scheme voting parameters
    struct Parameters {
        uint256 queuedVoteRequiredPercentage; // The absolute vote percentages bar. 5000 = 50%
        uint256 queuedVotePeriodLimit; // The time limit for a proposal to be in an absolute voting mode.
        uint256 boostedVotePeriodLimit; // The time limit for a proposal to be in boost mode.
        uint256 preBoostedVotePeriodLimit; // The time limit for a proposal to be in an preparation state (stable) before boosted.
        uint256 thresholdConst; // Constant for threshold calculation.
        // threshold =thresholdConst ** (numberOfBoostedProposals)
        uint256 limitExponentValue; // An upper limit for numberOfBoostedProposals
        // in the threshold calculation to prevent overflow
        uint256 quietEndingPeriod; // Quite ending period
        uint256 minimumDaoBounty;
        uint256 daoBountyConst; // The DAO downstake for each proposal is calculate according to the formula
        // (daoBountyConst * averageBoostDownstakes)/100 .
        uint256 boostedVoteRequiredPercentage; // The required % of votes needed in a boosted proposal to be
        // executed on that scheme
    }

    struct Voter {
        uint256 vote; // NO(1), YES(2)
        uint256 reputation; // amount of voter's reputation
        bool preBoosted;
    }

    struct Staker {
        uint256 vote; // NO(1), YES(2)
        uint256 amount; // Amount of staker's stake
        uint256 amount4Bounty; // Amount of staker's stake used for bounty reward calculation.
    }

    struct Proposal {
        bytes32 schemeId; // The scheme unique identifier the proposal is target to.
        address callbacks; // Should fulfill voting callbacks interface.
        ProposalState state;
        ExecutionState executionState;
        uint256 winningVote; // The winning vote.
        address proposer;
        // The proposal boosted period limit . it is updated for the case of quiteWindow mode.
        uint256 currentBoostedVotePeriodLimit;
        bytes32 paramsHash;
        uint256 daoBountyRemain; // Use for checking sum zero bounty claims.it is set at the proposing time.
        uint256 daoBounty;
        uint256 totalStakes; // Total number of tokens staked which can be redeemable by stakers.
        uint256 confidenceThreshold;
        uint256 secondsFromTimeOutTillExecuteBoosted;
        uint256[3] times;
        // times[0] - submittedTime
        // times[1] - boostedPhaseTime
        // times[2] - preBoostedPhaseTime;
        bool daoRedeemItsWinnings;
    }

    struct Scheme {
        address avatar;
        uint256 stakingTokenBalance;
        uint256 voteGasBalance;
        uint256 voteGas;
        uint256 maxGasPrice;
        uint256 averagesDownstakesOfBoosted;
        uint256 orgBoostedProposalsCnt;
    }

    struct VoteDecision {
        uint256 voteDecision;
        uint256 amount;
    }

    struct ExecuteFunctionParams {
        uint256 totalReputation;
        uint256 executionBar;
        uint256 boostedExecutionBar;
        uint256 averageDownstakesOfBoosted;
        uint256 confidenceThreshold;
    }

    event NewProposal(
        bytes32 indexed _proposalId,
        address indexed _avatar,
        uint256 _numOfChoices,
        address _proposer,
        bytes32 _paramsHash
    );

    event ExecuteProposal(
        bytes32 indexed _proposalId,
        address indexed _avatar,
        uint256 _decision,
        uint256 _totalReputation
    );

    event VoteProposal(
        bytes32 indexed _proposalId,
        address indexed _avatar,
        address indexed _voter,
        uint256 _vote,
        uint256 _reputation
    );

    event CancelProposal(bytes32 indexed _proposalId, address indexed _avatar);
    event CancelVoting(bytes32 indexed _proposalId, address indexed _avatar, address indexed _voter);

    event Stake(
        bytes32 indexed _proposalId,
        address indexed _avatar,
        address indexed _staker,
        uint256 _vote,
        uint256 _amount
    );

    event Redeem(bytes32 indexed _proposalId, address indexed _avatar, address indexed _beneficiary, uint256 _amount);

    event RedeemDaoBounty(
        bytes32 indexed _proposalId,
        address indexed _avatar,
        address indexed _beneficiary,
        uint256 _amount
    );

    event ActionSigned(
        bytes32 proposalId,
        address voter,
        uint256 voteDecision,
        uint256 amount,
        uint256 nonce,
        uint256 actionType,
        bytes signature
    );

    event StateChange(bytes32 indexed _proposalId, ProposalState _proposalState);
    event ExpirationCallBounty(bytes32 indexed _proposalId, address indexed _beneficiary, uint256 _amount);
    event ConfidenceLevelChange(bytes32 indexed _proposalId, uint256 _confidenceThreshold);
    event ProposalExecuteResult(string);

    /// @notice Event used to signal votes to be executed on chain
    event VoteSignaled(bytes32 proposalId, address voter, uint256 voteDecision, uint256 amount);

    error DXDVotingMachine__ProposalIsNotVotable();
    error DXDVotingMachine__WrongDecisionValue();
    error DXDVotingMachine__WrongStakingToken();
    error DXDVotingMachine__SetParametersError(string);

    /// @notice Emited when proposal is not in ExecutedInQueue, ExecutedInBoost or Expired status
    error DXDVotingMachine__WrongProposalStateToRedeem();
    error DXDVotingMachine__TransferFailed(address to, uint256 amount);

    /// @notice Emited when proposal is not in ExecutedInQueue or ExecutedInBoost status
    error DXDVotingMachine__WrongProposalStateToRedeemDaoBounty();
    error DXDVotingMachine__WrongSigner();
    error DXDVotingMachine__InvalidNonce();
    error DXDVotingMachine__OnlySchemeOrAvatarCanSetSchemeRefound();
    error DXDVotingMachine__AddressNotRegisteredInSchemeRefounds();
    error DXDVotingMachine__SchemeRefundBalanceIsZero();
    error DXDVotingMachine__ProposalAlreadyVoted();
    error DXDVotingMachine__VoterMustHaveReputation();
    error DXDVotingMachine__NotEnoughtReputation();
    error DXDVotingMachine__WrongVoteShared();
    error DXDVotingMachine__StakingAmountShouldBeBiggerThanZero();
    error DXDVotingMachine__TransferFromStakerFailed();
    error DXDVotingMachine__StakingAmountIsTooHight();
    error DXDVotingMachine__TotalStakesIsToHight();

    /// @notice Emited when _choicesAmount is less than NUM_OF_CHOICES
    error DXDVotingMachine__InvalidChoicesAmount();
    error DXDVotingMachine__InvalidParameters();

    /// @notice arg _start cannot be bigger than proposals list length
    error DXDVotingMachine__StartCannotBeBiggerThanListLength();
    /// @notice arg _end cannot be bigger than proposals list length
    error DXDVotingMachine__EndCannotBeBiggerThanListLength();

    /// @notice arg _start cannot be bigger than _end
    error DXDVotingMachine__StartCannotBeBiggerThanEnd();

    // Mappings of a proposal various properties

    ///      proposalId   =>      vote   =>    reputation
    mapping(bytes32 => mapping(uint256 => uint256)) proposalVotes;
    ///      proposalId   =>    vote   => reputation
    mapping(bytes32 => mapping(uint256 => uint256)) proposalPreBoostedVotes;
    ///      proposalId   =>    address => voter
    mapping(bytes32 => mapping(address => Voter)) proposalVoters;
    ///      proposalId  =>    address  => stakes
    mapping(bytes32 => mapping(uint256 => uint256)) proposalStakes;
    ///      proposalId    =>   address =>  staker
    mapping(bytes32 => mapping(address => Staker)) proposalStakers;

    /// A mapping from hashes to parameters
    mapping(bytes32 => Parameters) public parameters;
    /// Mapping from the ID of the proposal to the proposal itself.
    mapping(bytes32 => Proposal) public proposals;

    /// schemeId => scheme
    mapping(bytes32 => Scheme) public schemes;

    /// Store activeProposals for each avatar
    mapping(address => EnumerableSetUpgradeable.Bytes32Set) private activeProposals;
    /// Store inactiveProposals for each avatar
    mapping(address => EnumerableSetUpgradeable.Bytes32Set) private inactiveProposals;

    uint256 public constant NUM_OF_CHOICES = 2;
    uint256 public constant NO = 1;
    uint256 public constant YES = 2;
    uint256 public proposalsCnt;
    /// Total number of proposals
    IERC20 public stakingToken;
    uint256 private constant MAX_BOOSTED_PROPOSALS = 4096;

    /// Digest describing the data the user signs according EIP 712.
    /// Needs to match what is passed to Metamask.
    bytes32 public constant SIGNED_ACTION_HASH_EIP712 =
        keccak256(
            abi.encodePacked(
                "address DXDVotingMachineAddress",
                "bytes32 ProposalId",
                "address Signer",
                "uint256 Vote",
                "uint256 AmountToStake",
                "uint256 Nonce",
                "string Action"
            )
        );

    mapping(address => uint256) public stakesNonce;

    mapping(bytes32 => mapping(address => VoteDecision)) public votesSignaled;

    /// @notice The number of choices of each proposal
    mapping(bytes32 => uint256) internal numOfChoices;

    // When implementing this interface please do not only override function and modifier,
    // but also to keep the modifiers on the overridden functions.
    modifier onlyProposalOwner(bytes32 _proposalId) {
        revert();
        _;
    }

    /**
     * @dev Check that the proposal is votable.
     * A proposal is votable if it is in one of the following states:
     * PreBoosted, Boosted, QuietEndingPeriod or Queued
     */
    modifier votable(bytes32 _proposalId) {
        if (!_isVotable(_proposalId)) {
            revert DXDVotingMachine__ProposalIsNotVotable();
        }
        _;
    }

    modifier validDecision(bytes32 proposalId, uint256 decision) {
        if (decision > getNumberOfChoices(proposalId) || decision <= 0) {
            revert DXDVotingMachine__WrongDecisionValue();
        }
        _;
    }

    /**
     * @dev Constructor
     * @param _stakingToken ERC20 token used as staking token
     */
    constructor(IERC20 _stakingToken) {
        if (address(_stakingToken) == address(0)) {
            revert DXDVotingMachine__WrongStakingToken();
        }
        stakingToken = IERC20(_stakingToken);
    }

    /**
     * @dev Hash the parameters, save them if necessary, and return the hash value
     * @param _params A parameters array
     *    _params[0] - _queuedVoteRequiredPercentage,
     *    _params[1] - _queuedVotePeriodLimit, //the time limit for a proposal to be in an absolute voting mode.
     *    _params[2] - _boostedVotePeriodLimit, //the time limit for a proposal to be in an relative voting mode.
     *    _params[3] - _preBoostedVotePeriodLimit, //the time limit for a proposal to be in an preparation state (stable) before boosted.
     *    _params[4] -_thresholdConst
     *    _params[5] -_quietEndingPeriod
     *    _params[6] -_minimumDaoBounty
     *    _params[7] -_daoBountyConst
     *    _params[8] - _boostedVoteRequiredPercentage
     * @return paramsHash Hash of the given parameters
     */
    function setParameters(
        uint256[9] calldata _params //use array here due to stack too deep issue.
    ) external returns (bytes32 paramsHash) {
        if (_params[0] > 10000 || _params[0] < 5000) {
            revert DXDVotingMachine__SetParametersError("5000 <= queuedVoteRequiredPercentage <= 10000");
        }
        if (_params[4] > 16000 || _params[4] <= 1000) {
            revert DXDVotingMachine__SetParametersError("1000 < thresholdConst <= 16000");
        }
        if (_params[2] < _params[5]) {
            revert DXDVotingMachine__SetParametersError("boostedVotePeriodLimit >= quietEndingPeriod");
        }
        if (_params[6] <= 0) {
            revert DXDVotingMachine__SetParametersError("minimumDaoBounty should be > 0");
        }
        if (_params[7] <= 0) {
            revert DXDVotingMachine__SetParametersError("daoBountyConst should be > 0");
        }
        if (_params[0] <= _params[8]) {
            revert DXDVotingMachine__SetParametersError(
                "queuedVoteRequiredPercentage should eb higher than boostedVoteRequiredPercentage"
            );
        }

        bytes32 paramsHash = getParametersHash(_params);
        //set a limit for power for a given alpha to prevent overflow
        uint256 limitExponent = 172; //for alpha less or equal 2
        uint256 j = 2;
        for (uint256 i = 2000; i < 16000; i = i * 2) {
            if ((_params[4] > i) && (_params[4] <= i * 2)) {
                limitExponent = limitExponent / j;
                break;
            }
            j++;
        }

        parameters[paramsHash] = Parameters({
            queuedVoteRequiredPercentage: _params[0],
            queuedVotePeriodLimit: _params[1],
            boostedVotePeriodLimit: _params[2],
            preBoostedVotePeriodLimit: _params[3],
            thresholdConst: uint216(_params[4]).fraction(uint216(1000)),
            limitExponentValue: limitExponent,
            quietEndingPeriod: _params[5],
            minimumDaoBounty: _params[6],
            daoBountyConst: _params[7],
            boostedVoteRequiredPercentage: _params[8]
        });
        return paramsHash;
    }

    /**
     * @dev Redeem a reward for a successful stake, vote or proposing.
     *      The function use a beneficiary address as a parameter (and not msg.sender) to enable users to redeem on behalf of someone else.
     * @param _proposalId The ID of the proposal
     * @param _beneficiary The beneficiary address
     * @return reward The staking token reward
     */
    // solhint-disable-next-line function-max-lines,code-complexity
    function redeem(bytes32 _proposalId, address _beneficiary) public returns (uint256 reward) {
        Proposal storage proposal = proposals[_proposalId];
        if (
            (proposal.state != ProposalState.ExecutedInQueue) &&
            (proposal.state != ProposalState.ExecutedInBoost) &&
            (proposal.state != ProposalState.Expired)
        ) {
            revert DXDVotingMachine__WrongProposalStateToRedeem();
        }
        Parameters memory params = parameters[proposal.paramsHash];
        // as staker
        Staker storage staker = proposalStakers[_proposalId][_beneficiary];
        uint256 totalWinningStakes = proposalStakes[_proposalId][proposal.winningVote];
        uint256 totalStakesLeftAfterCallBounty = proposalStakes[_proposalId][NO] +
            proposalStakes[_proposalId][YES] -
            calcExecuteCallBounty(_proposalId);
        if (staker.amount > 0) {
            if (proposal.state == ProposalState.Expired) {
                // Stakes of a proposal that expires in Queue are sent back to stakers
                reward = staker.amount;
            } else if (staker.vote == proposal.winningVote) {
                if (staker.vote == YES) {
                    if (proposal.daoBounty < totalStakesLeftAfterCallBounty) {
                        uint256 _totalStakes = totalStakesLeftAfterCallBounty - proposal.daoBounty;
                        reward = (staker.amount * _totalStakes) / totalWinningStakes;
                    }
                } else {
                    reward = (staker.amount * totalStakesLeftAfterCallBounty) / totalWinningStakes;
                }
            }
            staker.amount = 0;
        }
        // dao redeem its winnings
        if (
            proposal.daoRedeemItsWinnings == false &&
            _beneficiary == schemes[proposal.schemeId].avatar &&
            proposal.state != ProposalState.Expired &&
            proposal.winningVote == NO
        ) {
            reward =
                reward +
                ((proposal.daoBounty * totalStakesLeftAfterCallBounty) / totalWinningStakes) -
                proposal.daoBounty;
            proposal.daoRedeemItsWinnings = true;
        }

        if (reward != 0) {
            proposal.totalStakes = proposal.totalStakes - reward;
            schemes[proposal.schemeId].stakingTokenBalance = schemes[proposal.schemeId].stakingTokenBalance - reward;

            bool transferSuccess = stakingToken.transfer(_beneficiary, reward);
            if (!transferSuccess) {
                revert DXDVotingMachine__TransferFailed(_beneficiary, reward);
            }
            emit Redeem(_proposalId, schemes[proposal.schemeId].avatar, _beneficiary, reward);
        }
    }

    /**
     * @dev redeemDaoBounty a reward for a successful stake.
     * The function use a beneficiary address as a parameter (and not msg.sender) to enable users to redeem on behalf of someone else.
     * @param _proposalId The ID of the proposal
     * @param _beneficiary The beneficiary address
     * @return redeemedAmount Redeem token amount
     * @return potentialAmount Potential redeem token amount (if there is enough tokens bounty at the dao owner of the scheme )
     */
    function redeemDaoBounty(
        bytes32 _proposalId,
        address _beneficiary
    ) public returns (uint256 redeemedAmount, uint256 potentialAmount) {
        Proposal storage proposal = proposals[_proposalId];
        if (proposal.state != ProposalState.ExecutedInQueue && proposal.state != ProposalState.ExecutedInBoost) {
            revert DXDVotingMachine__WrongProposalStateToRedeemDaoBounty();
        }
        uint256 totalWinningStakes = proposalStakes[_proposalId][proposal.winningVote];
        Staker storage staker = proposalStakers[_proposalId][_beneficiary];
        if (
            (staker.amount4Bounty > 0) &&
            (staker.vote == proposal.winningVote) &&
            (proposal.winningVote == YES) &&
            (totalWinningStakes != 0)
        ) {
            //as staker
            potentialAmount = (staker.amount4Bounty * proposal.daoBounty) / totalWinningStakes;
        }
        if ((potentialAmount != 0) && (schemes[proposal.schemeId].stakingTokenBalance >= potentialAmount)) {
            staker.amount4Bounty = 0;
            schemes[proposal.schemeId].stakingTokenBalance -= potentialAmount;
            proposal.daoBountyRemain = proposal.daoBountyRemain - potentialAmount;

            bool transferSuccess = stakingToken.transfer(_beneficiary, potentialAmount);
            if (!transferSuccess) {
                revert DXDVotingMachine__TransferFailed(_beneficiary, potentialAmount);
            }
            redeemedAmount = potentialAmount;
            emit RedeemDaoBounty(_proposalId, schemes[proposal.schemeId].avatar, _beneficiary, redeemedAmount);
        }
    }

    /**
     * @dev Calculate the execute boosted call bounty
     * @param _proposalId The ID of the proposal
     * @return executeCallBounty The execute boosted call bounty
     */
    function calcExecuteCallBounty(bytes32 _proposalId) public view returns (uint256 executeCallBounty) {
        uint256 maxRewardSeconds = 1500;
        uint256 rewardSeconds = uint256(maxRewardSeconds).min(
            proposals[_proposalId].secondsFromTimeOutTillExecuteBoosted
        );
        return (rewardSeconds * proposalStakes[_proposalId][YES]) / (maxRewardSeconds * 10);
    }

    /**
     * @dev Check if a proposal should be shifted to boosted phase.
     * @param _proposalId the ID of the proposal
     * @return shouldProposalBeBoosted True or false depending on whether the proposal should be boosted or not.
     */
    function shouldBoost(bytes32 _proposalId) public view returns (bool shouldProposalBeBoosted) {
        Proposal memory proposal = proposals[_proposalId];
        return (_score(_proposalId) > threshold(proposal.paramsHash, proposal.schemeId));
    }

    /**
     * @dev Returns the scheme's score threshold which is required by a proposal to shift to boosted state.
     * This threshold is dynamically set and it depend on the number of boosted proposal.
     * @param _schemeId The scheme identifier
     * @param _paramsHash The scheme parameters hash
     * @return schemeThreshold Scheme's score threshold as real number.
     */
    function threshold(bytes32 _paramsHash, bytes32 _schemeId) public view returns (uint256 schemeThreshold) {
        uint256 power = schemes[_schemeId].orgBoostedProposalsCnt;
        Parameters storage params = parameters[_paramsHash];

        if (power > params.limitExponentValue) {
            power = params.limitExponentValue;
        }

        return params.thresholdConst ** power;
    }

    /**
     * @dev Staking function
     * @param _proposalId id of the proposal
     * @param _vote  NO(1) or YES(2).
     * @param _amount The betting amount
     * @return proposalExecuted true if the proposal was executed, false otherwise.
     */
    function stake(bytes32 _proposalId, uint256 _vote, uint256 _amount) external returns (bool proposalExecuted) {
        return _stake(_proposalId, _vote, _amount, msg.sender);
    }

    /**
     * @dev stakeWithSignature function
     * @param proposalId Id of the proposal
     * @param staker Address of staker
     * @param stakeDecision  NO(1) or YES(2).
     * @param amount The betting amount
     * @param nonce Nonce value ,it is part of the signature to ensure that a signature can be received only once.
     * @param signature  Signed data by the staker
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    function stakeWithSignature(
        bytes32 proposalId,
        address staker,
        uint256 stakeDecision,
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external returns (bool proposalExecuted) {
        bytes32 stakeHashed = hashAction(proposalId, staker, stakeDecision, amount, nonce, 2);
        address staker = stakeHashed.recover(signature);

        if (staker != stakeHashed.toEthSignedMessageHash().recover(signature)) {
            revert DXDVotingMachine__WrongSigner();
        }

        if (stakesNonce[staker] != nonce) {
            revert DXDVotingMachine__InvalidNonce();
        }
        stakesNonce[staker] = stakesNonce[staker] + 1;
        return _stake(proposalId, stakeDecision, amount, staker);
    }

    /**
     * @dev Config the vote refund for each scheme
     * @notice Allows the voting machine to receive ether to be used to refund voting costs
     * @param avatar Avatar contract address
     * @param scheme Scheme contract address to set vote refund config
     * @param _voteGas The amount of gas that will be used as vote cost
     * @param _maxGasPrice The maximum amount of gas price to be paid, if the gas used is higher than this value only a portion of the total gas would be refunded
     */
    function setSchemeRefund(address avatar, address scheme, uint256 _voteGas, uint256 _maxGasPrice) external payable {
        bytes32 schemeId;
        if (msg.sender == scheme) {
            schemeId = keccak256(abi.encodePacked(msg.sender, avatar));
        } else if (msg.sender == avatar) {
            schemeId = keccak256(abi.encodePacked(scheme, msg.sender));
        }

        if (!(schemeId != bytes32(0))) {
            revert DXDVotingMachine__OnlySchemeOrAvatarCanSetSchemeRefound();
        }
        schemes[schemeId].voteGasBalance = schemes[schemeId].voteGasBalance + msg.value;
        schemes[schemeId].voteGas = _voteGas;
        schemes[schemeId].maxGasPrice = _maxGasPrice;
    }

    /**
     * @dev Withdraw scheme refund balance
     * @param scheme Scheme contract address to withdraw refund balance from
     */
    function withdrawRefundBalance(address scheme) public {
        bytes32 schemeId = keccak256(abi.encodePacked(msg.sender, scheme));

        if (schemes[schemeId].voteGas <= 0) {
            revert DXDVotingMachine__AddressNotRegisteredInSchemeRefounds();
        }

        if (schemes[schemeId].voteGasBalance <= 0) {
            revert DXDVotingMachine__SchemeRefundBalanceIsZero();
        }
        uint256 voteGasBalance = schemes[schemeId].voteGasBalance;
        schemes[schemeId].voteGasBalance = 0;
        payable(msg.sender).transfer(voteGasBalance);
    }

    /**
     * @dev Voting function from old voting machine changing only the logic to refund vote after vote done
     * @param _proposalId id of the proposal
     * @param _vote NO(1) or YES(2).
     * @param _amount The reputation amount to vote with, 0 will use all available REP
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    function vote(
        bytes32 _proposalId,
        uint256 _vote,
        uint256 _amount
    ) external votable(_proposalId) returns (bool proposalExecuted) {
        Proposal storage proposal = proposals[_proposalId];
        bool voteResult = internalVote(_proposalId, msg.sender, _vote, _amount);
        _refundVote(proposal.schemeId);
        return voteResult;
    }

    /**
     * @dev Check if the proposal has been decided, and if so, execute the proposal
     * @param _proposalId The id of the proposal
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    function execute(bytes32 _proposalId) external votable(_proposalId) returns (bool proposalExecuted) {
        return _execute(_proposalId);
    }

    /**
     * @dev Returns the vote and the amount of reputation of the user committed to this proposal
     * @param _proposalId the ID of the proposal
     * @param _voter The address of the voter
     * @return voterVote The voters vote
     * @return voterReputation Amount of reputation committed by _voter to _proposalId
     */
    function voteInfo(
        bytes32 _proposalId,
        address _voter
    ) external view returns (uint256 voterVote, uint256 voterReputation) {
        Voter memory voter = proposalVoters[_proposalId][_voter];
        return (voter.vote, voter.reputation);
    }

    /**
     * @dev Returns the reputation voted for a proposal for a specific voting choice.
     * @param _proposalId The ID of the proposal
     * @param _choice The index in the voting choice
     * @return voted Reputation for the given choice
     */
    function voteStatus(bytes32 _proposalId, uint256 _choice) external view returns (uint256 voted) {
        return proposalVotes[_proposalId][_choice];
    }

    /**
     * @dev Check if the proposal is votable
     * @param _proposalId The ID of the proposal
     * @return isProposalVotable True or false depending on whether the proposal is voteable
     */
    function isVotable(bytes32 _proposalId) external view returns (bool isProposalVotable) {
        return _isVotable(_proposalId);
    }

    /**
     * @dev Share the vote of a proposal for a voting machine on a event log
     * @param proposalId id of the proposal
     * @param voter Address of voter
     * @param voteDecision The vote decision, NO(1) or YES(2).
     * @param amount The reputation amount to vote with, 0 will use all available REP
     * @param nonce Nonce value ,it is part of the signature to ensure that a signature can be received only once.
     * @param actionType 1=vote, 2=stake
     * @param signature The encoded vote signature
     */
    function shareSignedAction(
        bytes32 proposalId,
        address voter,
        uint256 voteDecision,
        uint256 amount,
        uint256 nonce,
        uint256 actionType,
        bytes calldata signature
    ) external validDecision(proposalId, voteDecision) {
        bytes32 voteHashed = hashAction(proposalId, voter, voteDecision, amount, nonce, actionType);

        if (voter != voteHashed.toEthSignedMessageHash().recover(signature)) {
            revert DXDVotingMachine__WrongSigner();
        }
        emit ActionSigned(proposalId, voter, voteDecision, amount, nonce, actionType, signature);
    }

    /**
     * @dev Signal the vote of a proposal in this voting machine to be executed later
     * @param proposalId Id of the proposal to vote
     * @param voteDecision The vote decisions, NO(1) or YES(2).
     * @param amount The reputation amount to vote with, 0 will use all available REP
     */
    function signalVote(
        bytes32 proposalId,
        uint256 voteDecision,
        uint256 amount
    ) external validDecision(proposalId, voteDecision) {
        if (!_isVotable(proposalId)) {
            revert DXDVotingMachine__ProposalIsNotVotable();
        }

        if (votesSignaled[proposalId][msg.sender].voteDecision != 0) {
            revert DXDVotingMachine__ProposalAlreadyVoted();
        }
        votesSignaled[proposalId][msg.sender].voteDecision = voteDecision;
        votesSignaled[proposalId][msg.sender].amount = amount;
        emit VoteSignaled(proposalId, msg.sender, voteDecision, amount);
    }

    /**
     * @dev Execute a signed vote
     * @param proposalId Id of the proposal to execute the vote on
     * @param voter The signer of the vote
     * @param voteDecision The vote decision, NO(1) or YES(2).
     * @param amount The reputation amount to vote with, 0 will use all available REP
     * @param nonce Nonce value ,it is part of the signature to ensure that a signature can be received only once.
     * @param signature The signature of the hashed vote
     */
    function executeSignedVote(
        bytes32 proposalId,
        address voter,
        uint256 voteDecision,
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external {
        if (!_isVotable(proposalId)) {
            revert DXDVotingMachine__ProposalIsNotVotable();
        }
        bytes32 voteHashed = hashAction(proposalId, voter, voteDecision, amount, nonce, 1);

        if (voter != voteHashed.toEthSignedMessageHash().recover(signature)) {
            revert DXDVotingMachine__WrongSigner();
        }
        internalVote(proposalId, voter, voteDecision, amount);
        _refundVote(proposals[proposalId].schemeId);
    }

    /**
     * @dev Register a new proposal with the given parameters. Every proposal has a unique ID which is being generated by calculating keccak256 of a incremented counter.
     * @param _totalOptions The amount of options to be voted on
     * @param _paramsHash parameters hash
     * @param _proposer address
     * @param _avatar address
     * @return proposalId ID of the new proposal registered
     */
    function propose(
        uint256 _totalOptions,
        bytes32 _paramsHash,
        address _proposer,
        address _avatar
    ) external returns (bytes32 proposalId) {
        return _propose(NUM_OF_CHOICES, _paramsHash, _proposer, _avatar);
    }

    /**
     * @dev Vote for a proposal, if the voter already voted, cancel the last vote and set a new one instead
     * @param _proposalId id of the proposal
     * @param _voter used in case the vote is cast for someone else
     * @param _vote a value between 0 to and the proposal's number of choices.
     * @param _rep how many reputation the voter would like to stake for this vote. if  _rep==0 the voter full reputation will be use.
     * @return proposalExecuted true if the proposal was executed, false otherwise.
     * Throws if proposal is not open or if it has been executed
     * NB: executes the proposal if a decision has been reached
     */
    // solhint-disable-next-line function-max-lines,code-complexity
    function internalVote(
        bytes32 _proposalId,
        address _voter,
        uint256 _vote,
        uint256 _rep
    ) internal validDecision(_proposalId, _vote) returns (bool proposalExecuted) {
        if (_execute(_proposalId)) {
            return true;
        }

        Parameters memory params = parameters[proposals[_proposalId].paramsHash];
        Proposal storage proposal = proposals[_proposalId];

        // Check voter has enough reputation:
        uint256 reputation = IDXDVotingMachineCallbacks(proposal.callbacks).reputationOf(_voter, _proposalId);

        if (reputation <= 0) {
            revert DXDVotingMachine__VoterMustHaveReputation();
        }

        if (reputation < _rep) {
            revert DXDVotingMachine__NotEnoughtReputation();
        }
        uint256 rep = _rep;
        if (rep == 0) {
            rep = reputation;
        }
        // If this voter has already voted, return false.
        if (proposalVoters[_proposalId][_voter].reputation != 0) {
            return false;
        }
        // The voting itself:
        proposalVotes[_proposalId][_vote] = rep + proposalVotes[_proposalId][_vote];
        // check if the current winningVote changed or there is a tie.
        // for the case there is a tie the current winningVote set to NO.
        if (
            (proposalVotes[_proposalId][_vote] > proposalVotes[_proposalId][proposal.winningVote]) ||
            ((proposalVotes[_proposalId][NO] == proposalVotes[_proposalId][proposal.winningVote]) &&
                proposal.winningVote == YES)
        ) {
            if (
                (proposal.state == ProposalState.Boosted &&
                    ((block.timestamp - proposal.times[1]) >=
                        (params.boostedVotePeriodLimit - params.quietEndingPeriod))) ||
                // solhint-disable-next-line not-rely-on-time
                proposal.state == ProposalState.QuietEndingPeriod
            ) {
                // quietEndingPeriod
                if (proposal.state != ProposalState.QuietEndingPeriod) {
                    proposal.currentBoostedVotePeriodLimit = params.quietEndingPeriod;
                    proposal.state = ProposalState.QuietEndingPeriod;
                    emit StateChange(_proposalId, proposal.state);
                }
                // solhint-disable-next-line not-rely-on-time
                proposal.times[1] = block.timestamp;
            }
            proposal.winningVote = _vote;
        }
        proposalVoters[_proposalId][_voter] = Voter({
            reputation: rep,
            vote: _vote,
            preBoosted: ((proposal.state == ProposalState.PreBoosted) || (proposal.state == ProposalState.Queued))
        });
        if ((proposal.state == ProposalState.PreBoosted) || (proposal.state == ProposalState.Queued)) {
            proposalPreBoostedVotes[_proposalId][_vote] = rep + proposalPreBoostedVotes[_proposalId][_vote];
        }
        emit VoteProposal(_proposalId, schemes[proposal.schemeId].avatar, _voter, _vote, rep);
        return _execute(_proposalId);
    }

    /**
     * @dev Execute a signaled vote on a votable proposal
     * @param proposalId id of the proposal to vote
     * @param voter The signer of the vote
     */
    function executeSignaledVote(bytes32 proposalId, address voter) external {
        if (!_isVotable(proposalId)) {
            revert DXDVotingMachine__ProposalIsNotVotable();
        }

        if (votesSignaled[proposalId][voter].voteDecision <= 0) {
            revert DXDVotingMachine__WrongVoteShared();
        }
        internalVote(
            proposalId,
            voter,
            votesSignaled[proposalId][voter].voteDecision,
            votesSignaled[proposalId][voter].amount
        );
        delete votesSignaled[proposalId][voter];
        _refundVote(proposals[proposalId].schemeId);
    }

    /**
     * @dev Hash the vote data that is used for signatures
     * @param proposalId id of the proposal
     * @param signer The signer of the vote
     * @param option The vote decision, NO(1) or YES(2).
     * @param amount The reputation amount to vote with, 0 will use all available REP
     * @param nonce Nonce value, it is part of the signature to ensure that a signature can be received only once.
     * @param actionType The governance action type to hash
     * @return actionHash Hash of the action
     */
    function hashAction(
        bytes32 proposalId,
        address signer,
        uint256 option,
        uint256 amount,
        uint256 nonce,
        uint256 actionType
    ) public view returns (bytes32 actionHash) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    keccak256(
                        abi.encode(
                            keccak256(
                                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                            ),
                            keccak256(bytes("DXDVotingMachine")),
                            keccak256(bytes("1")),
                            chainId,
                            address(this)
                        )
                    ),
                    keccak256(
                        abi.encode(
                            keccak256(
                                "action(bytes32 proposalId,address signer,uint256 option,uint256 amount,uint256 nonce,uint256 actionType)"
                            ),
                            proposalId,
                            signer,
                            option,
                            amount,
                            nonce,
                            actionType
                        )
                    )
                )
            );
    }

    /**
     * @dev Returns the proposal score
     * @param _proposalId The ID of the proposal
     * @return proposalScore Proposal score as real number.
     */
    function score(bytes32 _proposalId) public view returns (uint256 proposalScore) {
        return _score(_proposalId);
    }

    /**
     * @dev Check if the proposal has been decided, and if so, execute the proposal
     * @param _proposalId The id of the proposal
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    // solhint-disable-next-line function-max-lines,code-complexity
    function _execute(bytes32 _proposalId) internal votable(_proposalId) returns (bool proposalExecuted) {
        Proposal storage proposal = proposals[_proposalId];
        Parameters memory params = parameters[proposal.paramsHash];
        Proposal memory tmpProposal = proposal;
        ExecuteFunctionParams memory executeParams;
        executeParams.totalReputation = IDXDVotingMachineCallbacks(proposal.callbacks).getTotalReputationSupply(
            _proposalId
        );
        // first divide by 10000 to prevent overflow
        executeParams.executionBar = (executeParams.totalReputation / 10000) * params.queuedVoteRequiredPercentage;
        executeParams.boostedExecutionBar =
            (executeParams.totalReputation / 10000) *
            params.boostedVoteRequiredPercentage;
        executeParams.averageDownstakesOfBoosted;
        executeParams.confidenceThreshold;

        if (proposalVotes[_proposalId][proposal.winningVote] > executeParams.executionBar) {
            // someone crossed the absolute vote execution bar.
            if (proposal.state == ProposalState.Queued) {
                proposal.executionState = ExecutionState.QueueBarCrossed;
            } else if (proposal.state == ProposalState.PreBoosted) {
                proposal.executionState = ExecutionState.PreBoostedBarCrossed;
            } else {
                proposal.executionState = ExecutionState.BoostedBarCrossed;
            }
            proposal.state = ProposalState.ExecutedInQueue;
        } else {
            if (proposal.state == ProposalState.Queued) {
                // solhint-disable-next-line not-rely-on-time
                if ((block.timestamp - proposal.times[0]) >= params.queuedVotePeriodLimit) {
                    proposal.state = ProposalState.Expired;
                    proposal.winningVote = NO;
                    proposal.executionState = ExecutionState.QueueTimeOut;
                } else {
                    executeParams.confidenceThreshold = threshold(proposal.paramsHash, proposal.schemeId);
                    if (_score(_proposalId) > executeParams.confidenceThreshold) {
                        // change proposal mode to PreBoosted mode.
                        proposal.state = ProposalState.PreBoosted;
                        // solhint-disable-next-line not-rely-on-time
                        proposal.times[2] = block.timestamp;
                        proposal.confidenceThreshold = executeParams.confidenceThreshold;
                    }
                }
            }

            if (proposal.state == ProposalState.PreBoosted) {
                executeParams.confidenceThreshold = threshold(proposal.paramsHash, proposal.schemeId);
                // solhint-disable-next-line not-rely-on-time
                if ((block.timestamp - proposal.times[2]) >= params.preBoostedVotePeriodLimit) {
                    if (_score(_proposalId) > executeParams.confidenceThreshold) {
                        if (schemes[proposal.schemeId].orgBoostedProposalsCnt < MAX_BOOSTED_PROPOSALS) {
                            // change proposal mode to Boosted mode.
                            proposal.state = ProposalState.Boosted;

                            proposal.times[1] = proposal.times[2] + params.preBoostedVotePeriodLimit;

                            schemes[proposal.schemeId].orgBoostedProposalsCnt++;
                            // add a value to average -> average = average + ((value - average) / nbValues)
                            executeParams.averageDownstakesOfBoosted = schemes[proposal.schemeId]
                                .averagesDownstakesOfBoosted;
                            // solium-disable-next-line indentation
                            schemes[proposal.schemeId].averagesDownstakesOfBoosted = uint256(
                                int256(executeParams.averageDownstakesOfBoosted) +
                                    ((int256(proposalStakes[_proposalId][NO]) -
                                        int256(executeParams.averageDownstakesOfBoosted)) /
                                        int256(schemes[proposal.schemeId].orgBoostedProposalsCnt))
                            );
                        }
                    } else {
                        proposal.state = ProposalState.Queued;
                    }
                } else {
                    // check the Confidence level is stable
                    uint256 proposalScore = _score(_proposalId);
                    if (proposalScore <= proposal.confidenceThreshold.min(executeParams.confidenceThreshold)) {
                        proposal.state = ProposalState.Queued;
                    } else if (proposal.confidenceThreshold > proposalScore) {
                        proposal.confidenceThreshold = executeParams.confidenceThreshold;
                        emit ConfidenceLevelChange(_proposalId, executeParams.confidenceThreshold);
                    }
                }
            }
        }

        if ((proposal.state == ProposalState.Boosted) || (proposal.state == ProposalState.QuietEndingPeriod)) {
            // solhint-disable-next-line not-rely-on-time
            if ((block.timestamp - proposal.times[1]) >= proposal.currentBoostedVotePeriodLimit) {
                if (proposalVotes[_proposalId][proposal.winningVote] >= executeParams.boostedExecutionBar) {
                    proposal.state = ProposalState.ExecutedInBoost;
                    proposal.executionState = ExecutionState.BoostedBarCrossed;
                } else {
                    proposal.state = ProposalState.Expired;
                    proposal.winningVote = NO;
                    proposal.executionState = ExecutionState.BoostedTimeOut;
                }
            }
        }

        if (proposal.executionState != ExecutionState.None) {
            if (
                (proposal.executionState == ExecutionState.BoostedTimeOut) ||
                (proposal.executionState == ExecutionState.BoostedBarCrossed)
            ) {
                schemes[proposal.schemeId].orgBoostedProposalsCnt--;
                // Remove a value from average = ((average * nbValues) - value) / (nbValues - 1);
                if (schemes[proposal.schemeId].orgBoostedProposalsCnt == 0) {
                    schemes[proposal.schemeId].averagesDownstakesOfBoosted = 0;
                } else {
                    executeParams.averageDownstakesOfBoosted = schemes[proposal.schemeId].averagesDownstakesOfBoosted;
                    schemes[proposal.schemeId].averagesDownstakesOfBoosted =
                        ((executeParams.averageDownstakesOfBoosted *
                            (schemes[proposal.schemeId].orgBoostedProposalsCnt + 1)) -
                            proposalStakes[_proposalId][NO]) /
                        schemes[proposal.schemeId].orgBoostedProposalsCnt;
                }
            }
            activeProposals[getProposalAvatar(_proposalId)].remove(_proposalId);
            inactiveProposals[getProposalAvatar(_proposalId)].add(_proposalId);
            emit ExecuteProposal(
                _proposalId,
                schemes[proposal.schemeId].avatar,
                proposal.winningVote,
                executeParams.totalReputation
            );
            proposal.daoBounty = proposal.daoBountyRemain;

            try ProposalExecuteInterface(proposal.callbacks).executeProposal(_proposalId, proposal.winningVote) {
                emit ProposalExecuteResult("");
            } catch Error(string memory errorMessage) {
                proposal.executionState = ExecutionState.Failed;
                emit ProposalExecuteResult(string(errorMessage));
            } catch Panic(uint256 errorMessage) {
                proposal.executionState = ExecutionState.Failed;
                emit ProposalExecuteResult(string(abi.encodePacked(errorMessage)));
            } catch (bytes memory errorMessage) {
                proposal.executionState = ExecutionState.Failed;
                emit ProposalExecuteResult(string(errorMessage));
            }
            ProposalExecuteInterface(proposal.callbacks).finishProposal(_proposalId, proposal.winningVote);
        }
        if (tmpProposal.state != proposal.state) {
            emit StateChange(_proposalId, proposal.state);
        }
        return (proposal.executionState != ExecutionState.None && proposal.executionState != ExecutionState.Failed);
    }

    /**
     * @dev Returns the proposal score (Confidence level)
     * For dual choice proposal S = (S+)/(S-)
     * @param _proposalId The ID of the proposal
     * @return proposalScore Proposal score as real number.
     */
    function _score(bytes32 _proposalId) internal view returns (uint256 proposalScore) {
        // proposal.stakes[NO] cannot be zero as the dao downstake > 0 for each proposal.
        return uint216(proposalStakes[_proposalId][YES]).fraction(uint216(proposalStakes[_proposalId][NO]));
    }

    /**
     * @dev Check if the proposal is votable
     * @param _proposalId The ID of the proposal
     * @return isProposalVotable True or false depending on whether the proposal is voteable
     */
    function _isVotable(bytes32 _proposalId) internal view returns (bool isProposalVotable) {
        ProposalState pState = proposals[_proposalId].state;
        return ((pState == ProposalState.PreBoosted) ||
            (pState == ProposalState.Boosted) ||
            (pState == ProposalState.QuietEndingPeriod) ||
            (pState == ProposalState.Queued));
    }

    /**
     * @dev staking function
     * @param _proposalId id of the proposal
     * @param _vote  NO(1) or YES(2).
     * @param _amount The betting amount
     * @param _staker Address of the staker
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    function _stake(
        bytes32 _proposalId,
        uint256 _vote,
        uint256 _amount,
        address _staker
    ) internal validDecision(_proposalId, _vote) returns (bool proposalExecuted) {
        // 0 is not a valid vote.

        if (_amount <= 0) {
            revert DXDVotingMachine__StakingAmountShouldBeBiggerThanZero();
        }

        if (_execute(_proposalId)) {
            return true;
        }
        Proposal storage proposal = proposals[_proposalId];

        if ((proposal.state != ProposalState.PreBoosted) && (proposal.state != ProposalState.Queued)) {
            return false;
        }

        // enable to increase stake only on the previous stake vote
        Staker storage staker = proposalStakers[_proposalId][_staker];
        if ((staker.amount > 0) && (staker.vote != _vote)) {
            return false;
        }

        uint256 amount = _amount;

        bool transferSuccess = stakingToken.transferFrom(_staker, address(this), amount);
        if (!transferSuccess) {
            revert DXDVotingMachine__TransferFromStakerFailed();
        }
        schemes[proposal.schemeId].stakingTokenBalance += amount;
        proposal.totalStakes = proposal.totalStakes + amount; //update totalRedeemableStakes
        staker.amount = staker.amount + amount;
        // This is to prevent average downstakes calculation overflow
        // Note that GEN cap is 100000000 ether.

        if (staker.amount > 0x100000000000000000000000000000000) {
            revert DXDVotingMachine__StakingAmountIsTooHight();
        }

        if (proposal.totalStakes > uint256(0x100000000000000000000000000000000)) {
            revert DXDVotingMachine__TotalStakesIsToHight();
        }

        if (_vote == YES) {
            staker.amount4Bounty = staker.amount4Bounty + amount;
        }
        staker.vote = _vote;

        proposalStakes[_proposalId][_vote] = amount + proposalStakes[_proposalId][_vote];
        emit Stake(_proposalId, schemes[proposal.schemeId].avatar, _staker, _vote, _amount);
        return _execute(_proposalId);
    }

    /**
     * @dev Register a new proposal with the given parameters. Every proposal has a unique ID which is being generated by calculating keccak256 of a incremented counter.
     * @param _choicesAmount the total amount of choices for the proposal
     * @param _paramsHash parameters hash
     * @param _proposer Proposer address
     * @param _avatar Avatar address
     * @return proposalId ID of the new proposal registered
     */
    function _propose(
        uint256 _choicesAmount,
        bytes32 _paramsHash,
        address _proposer,
        address _avatar
    ) internal returns (bytes32 proposalId) {
        if (_choicesAmount < NUM_OF_CHOICES) {
            revert DXDVotingMachine__InvalidChoicesAmount();
        }
        // Check parameters existence.
        if (parameters[_paramsHash].queuedVoteRequiredPercentage < 5000) {
            revert DXDVotingMachine__InvalidParameters();
        }
        // Generate a unique ID:
        bytes32 proposalId = keccak256(abi.encodePacked(this, proposalsCnt));
        proposalsCnt = proposalsCnt + 1;
        // Open proposal:
        Proposal memory proposal;
        proposal.callbacks = msg.sender;
        proposal.schemeId = keccak256(abi.encodePacked(msg.sender, _avatar));

        proposal.state = ProposalState.Queued;
        // solhint-disable-next-line not-rely-on-time
        proposal.times[0] = block.timestamp; //submitted time
        proposal.currentBoostedVotePeriodLimit = parameters[_paramsHash].boostedVotePeriodLimit;
        proposal.proposer = _proposer;
        proposal.winningVote = NO;
        proposal.paramsHash = _paramsHash;
        if (schemes[proposal.schemeId].avatar == address(0)) {
            if (_avatar == address(0)) {
                schemes[proposal.schemeId].avatar = msg.sender;
            } else {
                schemes[proposal.schemeId].avatar = _avatar;
            }
        }
        // calc dao bounty
        uint256 daoBounty = (parameters[_paramsHash].daoBountyConst *
            schemes[proposal.schemeId].averagesDownstakesOfBoosted) / 100;
        proposal.daoBountyRemain = daoBounty.max(parameters[_paramsHash].minimumDaoBounty);
        proposals[proposalId] = proposal;
        proposalStakes[proposalId][NO] = proposal.daoBountyRemain; //dao downstake on the proposal
        numOfChoices[proposalId] = _choicesAmount;
        activeProposals[getProposalAvatar(proposalId)].add(proposalId);
        emit NewProposal(proposalId, schemes[proposal.schemeId].avatar, _choicesAmount, _proposer, _paramsHash);
        return proposalId;
    }

    /**
     * @dev Refund a vote gas cost to an address
     * @param schemeId The id of the scheme that should do the refund
     */
    function _refundVote(bytes32 schemeId) internal {
        if (schemes[schemeId].voteGas > 0) {
            uint256 gasRefund = schemes[schemeId].voteGas * tx.gasprice.min(schemes[schemeId].maxGasPrice);
            if (schemes[schemeId].voteGasBalance >= gasRefund) {
                schemes[schemeId].voteGasBalance -= gasRefund;
                payable(msg.sender).transfer(gasRefund);
            }
        }
    }

    /**
     * @dev Returns a hash of the given parameters
     * @param _params Array of params (9) to hash
     * @return paramsHash Hash of the given parameters
     */
    function getParametersHash(uint256[9] memory _params) public pure returns (bytes32 paramsHash) {
        return
            keccak256(
                abi.encodePacked(
                    _params[0],
                    _params[1],
                    _params[2],
                    _params[3],
                    _params[4],
                    _params[5],
                    _params[6],
                    _params[7],
                    _params[8]
                )
            );
    }

    /**
     * @dev Returns proposals times variables.
     * @param _proposalId ID of the proposal
     * @return times Times array
     */
    function getProposalTimes(bytes32 _proposalId) external view returns (uint256[3] memory times) {
        return proposals[_proposalId].times;
    }

    /**
     * @dev Returns the schemeId for a given proposal
     * @param _proposalId ID of the proposal
     * @return schemeId Scheme identifier
     */
    function getProposalSchemeId(bytes32 _proposalId) external view returns (bytes32 schemeId) {
        return (proposals[_proposalId].schemeId);
    }

    /**
     * @dev Returns the Avatar address for a given proposalId
     * @param _proposalId ID of the proposal
     * @return avatarAddress Avatar address
     */
    function getProposalAvatar(bytes32 _proposalId) public view returns (address avatarAddress) {
        return schemes[proposals[_proposalId].schemeId].avatar;
    }

    /**
     * @dev Returns the vote and stake amount for a given proposal and staker
     * @param _proposalId The ID of the proposal
     * @param _staker Staker address
     * @return vote Proposal staker vote
     * @return amount Proposal staker amount
     */
    function getStaker(bytes32 _proposalId, address _staker) external view returns (uint256 vote, uint256 amount) {
        return (proposalStakers[_proposalId][_staker].vote, proposalStakers[_proposalId][_staker].amount);
    }

    /**
     * @dev Returns the allowed range of choices for a voting machine.
     * @return min minimum number of choices
     * @return max maximum number of choices
     */
    function getAllowedRangeOfChoices() external pure returns (uint256 min, uint256 max) {
        return (NO, YES);
    }

    /**
     * @dev Returns the number of choices possible in this proposal
     * @param _proposalId The proposal id
     * @return proposalChoicesNum Number of choices for given proposal
     */
    function getNumberOfChoices(bytes32 _proposalId) public view returns (uint256 proposalChoicesNum) {
        return numOfChoices[_proposalId];
    }

    /**
     * @dev Returns the total votes and stakes for a given proposal
     * @param _proposalId The ID of the proposal
     * @return preBoostedVotesNo preBoostedVotes NO
     * @return preBoostedVotesYes preBoostedVotes YES
     * @return totalStakesNo Total stakes NO
     * @return totalStakesYes Total stakes YES
     */
    function proposalStatus(
        bytes32 _proposalId
    )
        external
        view
        returns (uint256 preBoostedVotesNo, uint256 preBoostedVotesYes, uint256 totalStakesNo, uint256 totalStakesYes)
    {
        return (
            proposalPreBoostedVotes[_proposalId][NO],
            proposalPreBoostedVotes[_proposalId][YES],
            proposalStakes[_proposalId][NO],
            proposalStakes[_proposalId][YES]
        );
    }

    /**
     * @dev Returns the total votes, preBoostedVotes and stakes for a given proposal
     * @param _proposalId The ID of the proposal
     * @return votesNo Proposal votes NO
     * @return votesYes Proposal votes YES
     * @return preBoostedVotesNo Proposal pre boosted votes NO
     * @return preBoostedVotesYes Proposal pre boosted votes YES
     * @return totalStakesNo Proposal total stakes NO
     * @return totalStakesYes Proposal total stakes YES
     */
    function proposalStatusWithVotes(
        bytes32 _proposalId
    )
        external
        view
        returns (
            uint256 votesNo,
            uint256 votesYes,
            uint256 preBoostedVotesNo,
            uint256 preBoostedVotesYes,
            uint256 totalStakesNo,
            uint256 totalStakesYes
        )
    {
        return (
            proposalVotes[_proposalId][NO],
            proposalVotes[_proposalId][YES],
            proposalPreBoostedVotes[_proposalId][NO],
            proposalPreBoostedVotes[_proposalId][YES],
            proposalStakes[_proposalId][NO],
            proposalStakes[_proposalId][YES]
        );
    }

    /**
     * @dev Returns the amount stakes for a given proposal and vote
     * @param _proposalId The ID of the proposal
     * @param _vote Vote number
     * @return totalStakeAmount Total stake amount
     */
    function voteStake(bytes32 _proposalId, uint256 _vote) external view returns (uint256 totalStakeAmount) {
        return proposalStakes[_proposalId][_vote];
    }

    /**
     * @dev Returns the winningVote for a given proposal
     * @param _proposalId The ID of the proposal
     * @return winningVote Winning vote for given proposal
     */
    function winningVote(bytes32 _proposalId) external view returns (uint256 winningVote) {
        return proposals[_proposalId].winningVote;
    }

    /**
     * @dev Returns the state for a given proposal
     * @param _proposalId The ID of the proposal
     * @return state ProposalState proposal state
     */
    function state(bytes32 _proposalId) external view returns (ProposalState state) {
        return proposals[_proposalId].state;
    }

    /**
     * @dev Returns array of proposals based on index args. Both indexes are inclusive, unles (0,0) that returns all elements
     * @param _start index to start batching (included).
     * @param _end last index of batch (included). Zero will default to last element from the list
     * @param _proposals EnumerableSetUpgradeable set of proposal ids
     * @return proposalsArray with proposals list.
     */
    function _getProposalsBatchRequest(
        uint256 _start,
        uint256 _end,
        EnumerableSetUpgradeable.Bytes32Set storage _proposals
    ) internal view returns (Proposal[] memory proposalsArray) {
        uint256 totalCount = uint256(_proposals.length());
        if (totalCount == 0) {
            return new Proposal[](0);
        }
        if (_start > totalCount) {
            revert DXDVotingMachine__StartCannotBeBiggerThanListLength();
        }
        if (_end > totalCount) {
            revert DXDVotingMachine__EndCannotBeBiggerThanListLength();
        }
        if (_start > _end) {
            revert DXDVotingMachine__StartCannotBeBiggerThanEnd();
        }

        uint256 total = totalCount - 1;
        uint256 lastIndex = _end == 0 ? total : _end;
        uint256 returnCount = lastIndex + 1 - _start;

        proposalsArray = new Proposal[](returnCount);
        uint256 i = 0;
        for (i; i < returnCount; i++) {
            proposalsArray[i] = proposals[_proposals.at(i + _start)];
        }
        return proposalsArray;
    }

    /**
     * @dev Returns array of active proposals
     * @param _start index to start batching (included).
     * @param _end last index of batch (included). Zero will return all
     * @param _avatar the avatar contract address
     * @return activeProposalsArray with active proposals list.
     */
    function getActiveProposals(
        uint256 _start,
        uint256 _end,
        address _avatar
    ) external view returns (Proposal[] memory activeProposalsArray) {
        return _getProposalsBatchRequest(_start, _end, activeProposals[_avatar]);
    }

    /**
     * @dev Returns array of inactive proposals
     * @param _start index to start batching (included).
     * @param _end last index of batch (included). Zero will return all
     * @param _avatar the avatar contract address
     * @return inactiveProposalsArray with inactive proposals list.
     */
    function getInactiveProposals(
        uint256 _start,
        uint256 _end,
        address _avatar
    ) external view returns (Proposal[] memory inactiveProposalsArray) {
        return _getProposalsBatchRequest(_start, _end, inactiveProposals[_avatar]);
    }

    /**
     *  @dev Returns the amount of active proposals
     *  @param _avatar The avatar address
     * @return activeProposalsCount The total count of active proposals for given avatar address
     */
    function getActiveProposalsCount(address _avatar) public view returns (uint256 activeProposalsCount) {
        return activeProposals[_avatar].length();
    }

    /**
     *  @dev Returns the amount of inactive proposals
     *  @param _avatar The avatar address
     * @return inactiveProposalsCount The total count of active proposals for given avatar address
     */
    function getInactiveProposalsCount(address _avatar) public view returns (uint256 inactiveProposalsCount) {
        return inactiveProposals[_avatar].length();
    }
}
