// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import {RealMath} from "../../utils/RealMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./IVotingMachineCallbacks.sol";
import "./ProposalExecuteInterface.sol";

/**
 * @title Holographic Consensus Voting Machine
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
 * If a staker staked on the winning option it receives his stake plus a reward.
 * If a staker staked on a loosing option it lose his stake.
 */
contract VotingMachine {
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
        uint256 daoBounty;
        uint256 boostedVoteRequiredPercentage; // The required % of votes needed in a boosted proposal to be
        // executed on that scheme
    }

    struct Voter {
        uint256 option; // NO(1), YES(2)
        uint256 reputation; // amount of voter's reputation
        bool preBoosted;
    }

    struct Staker {
        uint256 option; // NO(1), YES(2)
        uint256 amount; // Amount of staker's stake
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
        uint256 daoBounty;
        bool daoRedeemedWinnings; // True if the DAO has claimed the bounty for this proposal.
        uint256[3] times;
        // times[0] - submittedTime
        // times[1] - boostedPhaseTime
        // times[2] - preBoostedPhaseTime;
    }

    struct Scheme {
        address avatar;
        uint256 stakingTokenBalance;
        uint256 voteGasBalance;
        uint256 voteGas;
        uint256 maxGasPrice;
        uint256 boostedProposalsCounter;
        uint256 preBoostedProposalsCounter;
    }

    struct Vote {
        uint256 option;
        uint256 amount;
    }

    event NewProposal(
        bytes32 indexed proposalId,
        address indexed avatar,
        uint256 numOfOptions,
        address proposer,
        bytes32 paramsHash
    );

    event ExecuteProposal(bytes32 indexed proposalId, address indexed avatar, uint256 option, uint256 totalReputation);

    event VoteProposal(
        bytes32 indexed proposalId,
        address indexed avatar,
        address indexed voter,
        uint256 option,
        uint256 reputation
    );

    event Stake(
        bytes32 indexed proposalId,
        address indexed avatar,
        address indexed staker,
        uint256 option,
        uint256 amount
    );

    event Redeem(bytes32 indexed proposalId, address indexed avatar, address indexed beneficiary, uint256 amount);

    event ClaimedDaoBounty(address indexed avatar, address beneficiary, uint256 amount);

    event ActionSigned(
        bytes32 proposalId,
        address voter,
        uint256 option,
        uint256 amount,
        uint256 nonce,
        uint256 actionType,
        bytes signature
    );

    event StateChange(bytes32 indexed proposalId, ProposalState proposalState);
    event ProposalExecuteResult(string);

    /// @notice Event used to signal votes to be executed on chain
    event VoteSignaled(bytes32 proposalId, address voter, uint256 option, uint256 amount);

    error VotingMachine__ProposalIsNotVotable();
    error VotingMachine__WrongDecisionValue();
    error VotingMachine__WrongStakingToken();
    error VotingMachine__SetParametersError(string);

    /// @notice Emited when proposal is not in ExecutedInQueue, ExecutedInBoost or Expired status
    error VotingMachine__WrongProposalStateToRedeem();
    error VotingMachine__NoAmountToRedeem();
    error VotingMachine__TransferFailed(address to, uint256 amount);
    error VotingMachine__TransferFromFailed(address to, uint256 amount);

    /// @notice Emited when proposal is not in ExecutedInQueue or ExecutedInBoost status
    error VotingMachine__WrongProposalStateToRedeemDaoBounty();
    error VotingMachine__WrongSigner();
    error VotingMachine__InvalidNonce();
    error VotingMachine__OnlySchemeOrAvatarCanSetSchemeRefound();
    error VotingMachine__AddressNotRegisteredInSchemeRefounds();
    error VotingMachine__SchemeRefundBalanceIsZero();
    error VotingMachine__ProposalAlreadyVoted();
    error VotingMachine__VoterMustHaveReputation();
    error VotingMachine__NotEnoughtReputation();
    error VotingMachine__WrongVoteShared();
    error VotingMachine__StakingAmountShouldBeBiggerThanZero();
    error VotingMachine__TransferFromStakerFailed();
    error VotingMachine__StakingAmountIsTooHight();
    error VotingMachine__TotalStakesIsToHight();

    /// @notice Emited when optionsAmount is less than NUM_OF_OPTIONS
    error VotingMachine__InvalidOptionsAmount();
    error VotingMachine__InvalidParameters();

    /// @notice arg start cannot be bigger than proposals list length
    error VotingMachine__StartCannotBeBiggerThanListLength();
    /// @notice arg end cannot be bigger than proposals list length
    error VotingMachine__EndCannotBeBiggerThanListLength();

    /// @notice arg start cannot be bigger than end
    error VotingMachine__StartCannotBeBiggerThanEnd();

    // Mappings of a proposal various properties

    ///      proposalId   =>      option   =>    reputation
    mapping(bytes32 => mapping(uint256 => uint256)) proposalVotes;
    ///      proposalId   =>    option   => reputation
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

    uint256 public constant NUM_OF_OPTIONS = 2;
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
                "address VotingMachineAddress",
                "bytes32 ProposalId",
                "address Signer",
                "uint256 Vote",
                "uint256 AmountToStake",
                "uint256 Nonce",
                "string Action"
            )
        );

    mapping(address => uint256) public signerNonce;

    mapping(bytes32 => mapping(address => Vote)) public votesSignaled;

    /// @notice The number of options of each proposal
    mapping(bytes32 => uint256) internal numOfOptions;

    /**
     * @dev Check that the proposal is votable.
     * A proposal is votable if it is in one of the following states:
     * PreBoosted, Boosted, QuietEndingPeriod or Queued
     */
    modifier votable(bytes32 proposalId) {
        if (!isVotable(proposalId)) {
            revert VotingMachine__ProposalIsNotVotable();
        }
        _;
    }

    modifier validOption(bytes32 proposalId, uint256 option) {
        if (option > getNumberOfOptions(proposalId) || option <= 0) {
            revert VotingMachine__WrongDecisionValue();
        }
        _;
    }

    /**
     * @dev Constructor
     * @param stakingTokenAddress ERC20 token used as staking token
     */
    constructor(IERC20 stakingTokenAddress) {
        if (address(stakingTokenAddress) == address(0)) {
            revert VotingMachine__WrongStakingToken();
        }
        stakingToken = IERC20(stakingTokenAddress);
    }

    /**
     * @dev Hash the parameters, save them if necessary, and return the hash value
     * @param params A parameters array
     *    params[0] - queuedVoteRequiredPercentage,
     *    params[1] - queuedVotePeriodLimit, //the time limit for a proposal to be in an absolute voting mode.
     *    params[2] - boostedVotePeriodLimit, //the time limit for a proposal to be in an relative voting mode.
     *    params[3] - preBoostedVotePeriodLimit, //the time limit for a proposal to be in an preparation state (stable) before boosted.
     *    params[4] -_thresholdConst
     *    params[5] -_quietEndingPeriod
     *    params[6] -_daoBounty
     *    params[7] - boostedVoteRequiredPercentage
     * @return paramsHash Hash of the given parameters
     */
    function setParameters(
        uint256[8] calldata params //use array here due to stack too deep issue.
    ) external returns (bytes32 paramsHash) {
        if (params[0] > 10000 || params[0] < 5000) {
            revert VotingMachine__SetParametersError("5000 <= queuedVoteRequiredPercentage <= 10000");
        }
        if (params[4] > 16000 || params[4] <= 1000) {
            revert VotingMachine__SetParametersError("1000 < thresholdConst <= 16000");
        }
        if (params[2] < params[5]) {
            revert VotingMachine__SetParametersError("boostedVotePeriodLimit >= quietEndingPeriod");
        }
        if (params[6] <= 0) {
            revert VotingMachine__SetParametersError("daoBounty should be > 0");
        }
        if (params[0] <= params[7]) {
            revert VotingMachine__SetParametersError(
                "queuedVoteRequiredPercentage should eb higher than boostedVoteRequiredPercentage"
            );
        }

        paramsHash = getParametersHash(params);
        //set a limit for power for a given alpha to prevent overflow
        uint256 limitExponent = 172; //for alpha less or equal 2
        uint256 j = 2;
        for (uint256 i = 2000; i < 16000; i = i * 2) {
            if ((params[4] > i) && (params[4] <= i * 2)) {
                limitExponent = limitExponent / j;
                break;
            }
            j++;
        }

        parameters[paramsHash] = Parameters({
            queuedVoteRequiredPercentage: params[0],
            queuedVotePeriodLimit: params[1],
            boostedVotePeriodLimit: params[2],
            preBoostedVotePeriodLimit: params[3],
            thresholdConst: uint216(params[4]).fraction(uint216(1000)),
            limitExponentValue: limitExponent,
            quietEndingPeriod: params[5],
            daoBounty: params[6],
            boostedVoteRequiredPercentage: params[7]
        });
        return paramsHash;
    }

    /**
     * @dev Redeem a reward for a successful stake, vote or proposing.
     *      The function use a beneficiary address as a parameter (and not msg.sender) to enable users to redeem on behalf of someone else.
     * @param proposalId The ID of the proposal
     * @param beneficiary The beneficiary address
     * @return reward The staking token reward
     */
    // solhint-disable-next-line function-max-lines,code-complexity
    function redeem(bytes32 proposalId, address beneficiary) external returns (uint256 reward) {
        Proposal storage proposal = proposals[proposalId];
        if (
            (proposal.state != ProposalState.ExecutedInQueue) &&
            (proposal.state != ProposalState.ExecutedInBoost) &&
            (proposal.state != ProposalState.Expired)
        ) {
            revert VotingMachine__WrongProposalStateToRedeem();
        }

        address proposalAvatar = getProposalAvatar(proposalId);

        // Check that there are tokens to be redeemed
        Staker storage staker = proposalStakers[proposalId][beneficiary];
        uint256 staked = staker.amount;
        if (staked == 0 && beneficiary != proposalAvatar) {
            revert VotingMachine__NoAmountToRedeem();
        }

        // The staker amount is marked as 0 to make sure the staker can't redeem twice
        staker.amount = 0;

        uint256 totalStakesWithoutDaoBounty = proposalStakes[proposalId][NO] +
            proposalStakes[proposalId][YES] -
            proposal.daoBounty;

        bool transferSuccess;

        // If the proposal expires the staked amount is sent back to the staker
        if (proposal.state == ProposalState.Expired) {
            schemes[proposal.schemeId].stakingTokenBalance = schemes[proposal.schemeId].stakingTokenBalance - staked;

            transferSuccess = stakingToken.transfer(beneficiary, staked);

            if (!transferSuccess) {
                revert VotingMachine__TransferFailed(beneficiary, staked);
            }
            emit Redeem(proposalId, proposalAvatar, beneficiary, staked);

            // If NO won and there is staked tokens on YES, the dao avatar gets a % or the rewards
        } else if (beneficiary == proposalAvatar && proposal.winningVote == NO && !proposal.daoRedeemedWinnings) {
            uint256 daoBountyReward = (proposalStakes[proposalId][YES] * parameters[proposal.paramsHash].daoBounty) /
                proposalStakes[proposalId][NO];

            schemes[proposal.schemeId].stakingTokenBalance =
                schemes[proposal.schemeId].stakingTokenBalance -
                daoBountyReward;

            proposal.daoRedeemedWinnings = true;

            transferSuccess = stakingToken.transfer(proposalAvatar, daoBountyReward);
            if (!transferSuccess) {
                revert VotingMachine__TransferFromFailed(proposalAvatar, daoBountyReward);
            } else {
                emit ClaimedDaoBounty(proposalAvatar, proposalAvatar, daoBountyReward);
            }

            // If also a stake was done by the avatar, the stake redeem is done
            if (staked > 0) {
                reward = (staked * totalStakesWithoutDaoBounty) / proposalStakes[proposalId][NO];

                schemes[proposal.schemeId].stakingTokenBalance =
                    schemes[proposal.schemeId].stakingTokenBalance -
                    reward;

                transferSuccess = stakingToken.transfer(proposalAvatar, reward);
                if (!transferSuccess) {
                    revert VotingMachine__TransferFailed(proposalAvatar, reward);
                }
                emit Redeem(proposalId, proposalAvatar, proposalAvatar, reward);
            }

            // If the proposal was executed and the stake was in the winning option the beneficiary gets the reward
        } else if (staker.option == proposal.winningVote) {
            // The reward would be a % (of the staked on the winning option) of all the stakes
            reward = (staked * totalStakesWithoutDaoBounty) / proposalStakes[proposalId][proposal.winningVote];

            if (reward > 0) {
                schemes[proposal.schemeId].stakingTokenBalance =
                    schemes[proposal.schemeId].stakingTokenBalance -
                    reward;

                transferSuccess = stakingToken.transfer(beneficiary, reward);
                if (!transferSuccess) {
                    revert VotingMachine__TransferFailed(beneficiary, reward);
                }
                emit Redeem(proposalId, proposalAvatar, beneficiary, reward);
            }

            // If the winning option was yes the reward also include a % (of the staked on the winning option)
            // of the minimum dao bounty
            if (staker.option == YES) {
                uint256 daoBountyReward = (staked * parameters[proposal.paramsHash].daoBounty) /
                    proposalStakes[proposalId][YES];

                transferSuccess = stakingToken.transferFrom(proposalAvatar, beneficiary, daoBountyReward);
                if (!transferSuccess) {
                    revert VotingMachine__TransferFromFailed(beneficiary, daoBountyReward);
                } else {
                    emit ClaimedDaoBounty(proposalAvatar, beneficiary, daoBountyReward);
                }
            }
        }
    }

    /**
     * @dev Returns the proposal score (Confidence level)
     * For dual options proposal S = (S+)/(S-)
     * @param proposalId The ID of the proposal
     * @return proposalScore Proposal score as real number.
     */
    function score(bytes32 proposalId) public view returns (uint256 proposalScore) {
        // proposal.stakes[NO] cannot be zero as the dao downstake > 0 for each proposal.
        return uint216(proposalStakes[proposalId][YES]).fraction(uint216(proposalStakes[proposalId][NO]));
    }

    /**
     * @dev Check if a proposal should be shifted to boosted phase.
     * @param proposalId The ID of the proposal
     * @return shouldProposalBeBoosted True or false depending on whether the proposal should be boosted or not.
     */
    function shouldBoost(bytes32 proposalId) public view returns (bool shouldProposalBeBoosted) {
        Proposal memory proposal = proposals[proposalId];
        return (score(proposalId) > getSchemeThreshold(proposal.paramsHash, proposal.schemeId));
    }

    /**
     * @dev Returns the scheme's score threshold which is required by a proposal to shift to boosted state.
     * This threshold is dynamically set and it depend on the number of boosted proposal.
     * @param schemeId The scheme identifier
     * @param paramsHash The scheme parameters hash
     * @return schemeThreshold Scheme's score threshold as real number.
     */
    function getSchemeThreshold(bytes32 paramsHash, bytes32 schemeId) public view returns (uint256 schemeThreshold) {
        return
            calculateThreshold(
                parameters[paramsHash].thresholdConst,
                parameters[paramsHash].limitExponentValue,
                schemes[schemeId].boostedProposalsCounter
            );
    }

    /**
     * @dev Returns the a score threshold which is required by a proposal to shift to boosted state.
     * @param thresholdConst The threshold constant to be used that increments the score exponentially
     * @param limitExponentValue The limit of the scheme boosted proposals counter
     * @param boostedProposalsCounter The amount of boosted proposals in scheme
     * @return threshold Score threshold as real number.
     */
    function calculateThreshold(
        uint256 thresholdConst,
        uint256 limitExponentValue,
        uint256 boostedProposalsCounter
    ) public pure returns (uint256 threshold) {
        return thresholdConst.pow(boostedProposalsCounter.min(limitExponentValue));
    }

    /**
     * @dev Calculate the amount needed to boost a proposal
     * @param proposalId The ID of the proposal
     * @return toBoost Stake amount needed to boost proposal and move it to preBoost
     */
    function calculateBoostChange(bytes32 proposalId) external view returns (uint256 toBoost) {
        Proposal memory proposal = proposals[proposalId];
        uint256 thresholdWithPreBoosted = calculateThreshold(
            parameters[proposal.paramsHash].thresholdConst,
            parameters[proposal.paramsHash].limitExponentValue,
            schemes[proposal.schemeId].boostedProposalsCounter + schemes[proposal.schemeId].preBoostedProposalsCounter
        );
        uint256 downstakeThreshold = (thresholdWithPreBoosted + 2).mul(proposalStakes[proposalId][NO]);

        if (downstakeThreshold > proposalStakes[proposalId][YES])
            return (downstakeThreshold - proposalStakes[proposalId][YES]);
        else return (0);
    }

    /**
     * @dev Staking function
     * @param proposalId Id of the proposal
     * @param option  NO(1) or YES(2).
     * @param amount The betting amount
     * @return proposalExecuted true if the proposal was executed, false otherwise.
     */
    function stake(
        bytes32 proposalId,
        uint256 option,
        uint256 amount
    ) external returns (bool proposalExecuted) {
        return _stake(proposalId, option, amount, msg.sender);
    }

    /**
     * @dev executeSignedStake function
     * @param proposalId Id of the proposal
     * @param staker Address of staker
     * @param option  NO(1) or YES(2).
     * @param amount The betting amount
     * @param signature  Signed data by the staker
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    function executeSignedStake(
        bytes32 proposalId,
        address staker,
        uint256 option,
        uint256 amount,
        bytes calldata signature
    ) external returns (bool proposalExecuted) {
        bytes32 stakeHashed = hashAction(proposalId, staker, option, amount, signerNonce[staker], 2);

        if (staker != stakeHashed.toEthSignedMessageHash().recover(signature)) {
            revert VotingMachine__WrongSigner();
        }

        signerNonce[staker] = signerNonce[staker] + 1;
        return _stake(proposalId, option, amount, staker);
    }

    /**
     * @dev Config the vote refund for each scheme
     * @notice Allows the voting machine to receive ether to be used to refund voting costs
     * @param avatar Avatar contract address
     * @param scheme Scheme contract address to set vote refund config
     * @param voteGas The amount of gas that will be used as vote cost
     * @param maxGasPrice The maximum amount of gas price to be paid, if the gas used is higher than this value only a portion of the total gas would be refunded
     */
    function setSchemeRefund(
        address avatar,
        address scheme,
        uint256 voteGas,
        uint256 maxGasPrice
    ) external payable {
        bytes32 schemeId;
        if (msg.sender == scheme) {
            schemeId = keccak256(abi.encodePacked(msg.sender, avatar));
        } else if (msg.sender == avatar) {
            schemeId = keccak256(abi.encodePacked(scheme, msg.sender));
        }

        if (!(schemeId != bytes32(0))) {
            revert VotingMachine__OnlySchemeOrAvatarCanSetSchemeRefound();
        }
        schemes[schemeId].voteGasBalance = schemes[schemeId].voteGasBalance + msg.value;
        schemes[schemeId].voteGas = voteGas;
        schemes[schemeId].maxGasPrice = maxGasPrice;
    }

    /**
     * @dev Withdraw scheme refund balance
     * @param avatar The avatar address of the dao that controls the scheme
     * @param scheme Scheme contract address to withdraw refund balance from
     */
    function withdrawRefundBalance(address avatar, address scheme) external {
        bytes32 schemeId;
        if (msg.sender == scheme) {
            schemeId = keccak256(abi.encodePacked(msg.sender, avatar));
        } else if (msg.sender == avatar) {
            schemeId = keccak256(abi.encodePacked(scheme, msg.sender));
        }

        uint256 voteGasBalance = schemes[schemeId].voteGasBalance;
        schemes[schemeId].voteGasBalance = 0;
        payable(avatar).transfer(voteGasBalance);
    }

    /**
     * @dev Voting function from old voting machine changing only the logic to refund vote after vote done
     * @param proposalId Id of the proposal
     * @param option NO(1) or YES(2).
     * @param amount The reputation amount to vote with, 0 will use all available REP
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    function vote(
        bytes32 proposalId,
        uint256 option,
        uint256 amount
    ) external votable(proposalId) returns (bool proposalExecuted) {
        Proposal storage proposal = proposals[proposalId];
        bool voteResult = _vote(proposalId, msg.sender, option, amount);
        _refundVote(proposal.schemeId);
        return voteResult;
    }

    /**
     * @dev Check if the proposal has been decided, and if so, execute the proposal
     * @param proposalId The id of the proposal
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    function execute(bytes32 proposalId) external votable(proposalId) returns (bool proposalExecuted) {
        return _execute(proposalId);
    }

    /**
     * @dev Share the vote of a proposal for a voting machine on a event log
     * @param proposalId Id of the proposal
     * @param voter Address of voter
     * @param option The vote option, NO(1) or YES(2).
     * @param amount The reputation amount to vote with, 0 will use all available REP
     * @param nonce Nonce value ,it is part of the signature to ensure that a signature can be received only once.
     * @param actionType 1=vote, 2=stake
     * @param signature The encoded vote signature
     */
    function shareSignedAction(
        bytes32 proposalId,
        address voter,
        uint256 option,
        uint256 amount,
        uint256 nonce,
        uint256 actionType,
        bytes calldata signature
    ) external validOption(proposalId, option) {
        bytes32 voteHashed = hashAction(proposalId, voter, option, amount, nonce, actionType);

        if (voter != voteHashed.toEthSignedMessageHash().recover(signature)) {
            revert VotingMachine__WrongSigner();
        }

        emit ActionSigned(proposalId, voter, option, amount, nonce, actionType, signature);
    }

    /**
     * @dev Signal the vote of a proposal in this voting machine to be executed later
     * @param proposalId Id of the proposal to vote
     * @param option The vote option, NO(1) or YES(2).
     * @param amount The reputation amount to vote with, 0 will use all available REP
     */
    function signalVote(
        bytes32 proposalId,
        uint256 option,
        uint256 amount
    ) external votable(proposalId) validOption(proposalId, option) {
        if (votesSignaled[proposalId][msg.sender].option != 0) {
            revert VotingMachine__ProposalAlreadyVoted();
        }
        votesSignaled[proposalId][msg.sender].option = option;
        votesSignaled[proposalId][msg.sender].amount = amount;
        emit VoteSignaled(proposalId, msg.sender, option, amount);
    }

    /**
     * @dev Execute a signed vote
     * @param proposalId Id of the proposal to execute the vote on
     * @param voter The signer of the vote
     * @param option The vote option, NO(1) or YES(2).
     * @param amount The reputation amount to vote with, 0 will use all available REP
     * @param signature The signature of the hashed vote
     */
    function executeSignedVote(
        bytes32 proposalId,
        address voter,
        uint256 option,
        uint256 amount,
        bytes calldata signature
    ) external votable(proposalId) {
        bytes32 voteHashed = hashAction(proposalId, voter, option, amount, signerNonce[voter], 1);

        if (voter != voteHashed.toEthSignedMessageHash().recover(signature)) {
            revert VotingMachine__WrongSigner();
        }

        signerNonce[voter] = signerNonce[voter] + 1;
        _vote(proposalId, voter, option, amount);
        _refundVote(proposals[proposalId].schemeId);
    }

    /**
     * @dev Register a new proposal with the given parameters. Every proposal has a unique ID which is being generated by calculating keccak256 of a incremented counter.
     * @param totalOptions The amount of options to be voted on
     * @param paramsHash Parameters hash
     * @param proposer Proposer address
     * @param avatar Avatar address
     * @return proposalId ID of the new proposal registered
     */
    function propose(
        uint256 totalOptions,
        bytes32 paramsHash,
        address proposer,
        address avatar
    ) external returns (bytes32 proposalId) {
        return _propose(totalOptions, paramsHash, proposer, avatar);
    }

    /**
     * @dev Vote for a proposal, if the voter already voted, cancel the last vote and set a new one instead
     * @param proposalId Id of the proposal
     * @param voter Used in case the vote is cast for someone else
     * @param option Value between 0 and the proposal's number of options.
     * @param repAmount How many reputation the voter would like to stake for this vote. if  _rep==0 the voter full reputation will be use.
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     * Throws if proposal is not open or if it has been executed
     * NB: executes the proposal if a decision has been reached
     */
    function _vote(
        bytes32 proposalId,
        address voter,
        uint256 option,
        uint256 repAmount
    ) internal validOption(proposalId, option) returns (bool proposalExecuted) {
        if (_execute(proposalId)) {
            return true;
        }

        Parameters memory params = parameters[proposals[proposalId].paramsHash];
        Proposal storage proposal = proposals[proposalId];

        // Check voter has enough reputation
        uint256 voterReputation = IVotingMachineCallbacks(proposal.callbacks).reputationOf(voter, proposalId);

        if (voterReputation == 0) {
            revert VotingMachine__VoterMustHaveReputation();
        }

        if (voterReputation < repAmount) {
            revert VotingMachine__NotEnoughtReputation();
        }
        if (repAmount == 0) {
            repAmount = voterReputation;
        }
        // If this voter has already voted, return false.
        if (proposalVoters[proposalId][voter].reputation != 0) {
            return false;
        }
        // The voting itself:
        proposalVotes[proposalId][option] = repAmount + proposalVotes[proposalId][option];
        // check if the current winningVote changed or there is a tie.
        // for the case there is a tie the current winningVote set to NO.
        if (
            (proposalVotes[proposalId][option] > proposalVotes[proposalId][proposal.winningVote]) ||
            ((proposalVotes[proposalId][NO] == proposalVotes[proposalId][proposal.winningVote]) &&
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
                    emit StateChange(proposalId, proposal.state);
                }
                // solhint-disable-next-line not-rely-on-time
                proposal.times[1] = block.timestamp;
            }
            proposal.winningVote = option;
        }
        proposalVoters[proposalId][voter] = Voter({
            reputation: repAmount,
            option: option,
            preBoosted: ((proposal.state == ProposalState.PreBoosted) || (proposal.state == ProposalState.Queued))
        });
        if ((proposal.state == ProposalState.PreBoosted) || (proposal.state == ProposalState.Queued)) {
            proposalPreBoostedVotes[proposalId][option] = repAmount + proposalPreBoostedVotes[proposalId][option];
        }
        emit VoteProposal(proposalId, schemes[proposal.schemeId].avatar, voter, option, repAmount);
        return _execute(proposalId);
    }

    /**
     * @dev Execute a signaled vote on a votable proposal
     * @param proposalId Id of the proposal to vote
     * @param voter The signer of the vote
     */
    function executeSignaledVote(bytes32 proposalId, address voter) external votable(proposalId) {
        if (votesSignaled[proposalId][voter].option <= 0) {
            revert VotingMachine__WrongVoteShared();
        }
        _vote(proposalId, voter, votesSignaled[proposalId][voter].option, votesSignaled[proposalId][voter].amount);
        delete votesSignaled[proposalId][voter];
        _refundVote(proposals[proposalId].schemeId);
    }

    /**
     * @dev Check if the proposal has been decided, and if so, execute the proposal
     * @param proposalId The id of the proposal
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    // solhint-disable-next-line function-max-lines,code-complexity
    function _execute(bytes32 proposalId) internal votable(proposalId) returns (bool proposalExecuted) {
        Proposal storage proposal = proposals[proposalId];
        Parameters memory params = parameters[proposal.paramsHash];
        Proposal memory tmpProposal = proposal;
        uint256 totalReputation = IVotingMachineCallbacks(proposal.callbacks).getTotalReputationSupply(proposalId);

        if (
            proposalVotes[proposalId][proposal.winningVote] >
            (totalReputation / 10000) * params.queuedVoteRequiredPercentage
        ) {
            // someone crossed the absolute vote execution bar.
            if (proposal.state == ProposalState.Queued) {
                proposal.executionState = ExecutionState.QueueBarCrossed;
            } else if (proposal.state == ProposalState.PreBoosted) {
                proposal.executionState = ExecutionState.PreBoostedBarCrossed;
                schemes[proposal.schemeId].preBoostedProposalsCounter--;
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
                    if (shouldBoost(proposalId)) {
                        // change proposal mode to PreBoosted mode.
                        proposal.state = ProposalState.PreBoosted;
                        // solhint-disable-next-line not-rely-on-time
                        proposal.times[2] = block.timestamp;
                        schemes[proposal.schemeId].preBoostedProposalsCounter++;
                    }
                }
            }

            if (proposal.state == ProposalState.PreBoosted) {
                // solhint-disable-next-line not-rely-on-time
                if ((block.timestamp - proposal.times[2]) >= params.preBoostedVotePeriodLimit) {
                    if (shouldBoost(proposalId)) {
                        if (schemes[proposal.schemeId].boostedProposalsCounter < MAX_BOOSTED_PROPOSALS) {
                            // change proposal mode to Boosted mode.
                            proposal.state = ProposalState.Boosted;
                            proposal.times[1] = proposal.times[2] + params.preBoostedVotePeriodLimit;
                            schemes[proposal.schemeId].preBoostedProposalsCounter--;
                            schemes[proposal.schemeId].boostedProposalsCounter++;
                        }
                    } else {
                        proposal.state = ProposalState.Queued;
                        schemes[proposal.schemeId].preBoostedProposalsCounter--;
                    }
                } else {
                    // check the Confidence level is stable
                    if (score(proposalId) <= getSchemeThreshold(proposal.paramsHash, proposal.schemeId)) {
                        proposal.state = ProposalState.Queued;
                        schemes[proposal.schemeId].preBoostedProposalsCounter--;
                    }
                }
            }
        }

        if ((proposal.state == ProposalState.Boosted) || (proposal.state == ProposalState.QuietEndingPeriod)) {
            // solhint-disable-next-line not-rely-on-time
            if ((block.timestamp - proposal.times[1]) >= proposal.currentBoostedVotePeriodLimit) {
                if (
                    proposalVotes[proposalId][proposal.winningVote] >=
                    (totalReputation / 10000) * params.boostedVoteRequiredPercentage
                ) {
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
                schemes[proposal.schemeId].boostedProposalsCounter--;
            }
            activeProposals[getProposalAvatar(proposalId)].remove(proposalId);
            inactiveProposals[getProposalAvatar(proposalId)].add(proposalId);
            emit ExecuteProposal(proposalId, schemes[proposal.schemeId].avatar, proposal.winningVote, totalReputation);

            // Try to execute the proposal for the winning option and catch error if any
            try ProposalExecuteInterface(proposal.callbacks).executeProposal(proposalId, proposal.winningVote) {
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

            // Set the proposal as executed without executing it, this is done in case the proposal state
            // didnt change in the storage on the previous execution
            ProposalExecuteInterface(proposal.callbacks).finishProposal(proposalId, proposal.winningVote);
        }
        if (tmpProposal.state != proposal.state) {
            emit StateChange(proposalId, proposal.state);
        }
        return (proposal.executionState != ExecutionState.None);
    }

    /**
     * @dev Check if the proposal is votable
     * @param proposalId The ID of the proposal
     * @return isProposalVotable True or false depending on whether the proposal is voteable
     */
    function isVotable(bytes32 proposalId) public view returns (bool isProposalVotable) {
        ProposalState pState = proposals[proposalId].state;
        return ((pState == ProposalState.PreBoosted) ||
            (pState == ProposalState.Boosted) ||
            (pState == ProposalState.QuietEndingPeriod) ||
            (pState == ProposalState.Queued));
    }

    /**
     * @dev staking function
     * @param proposalId Id of the proposal
     * @param option  NO(1) or YES(2).
     * @param amount The betting amount
     * @param staker Address of the staker
     * @return proposalExecuted True if the proposal was executed, false otherwise.
     */
    function _stake(
        bytes32 proposalId,
        uint256 option,
        uint256 amount,
        address staker
    ) internal validOption(proposalId, option) returns (bool proposalExecuted) {
        // 0 is not a valid vote.

        if (amount <= 0) {
            revert VotingMachine__StakingAmountShouldBeBiggerThanZero();
        }

        if (_execute(proposalId)) {
            return true;
        }
        Proposal storage proposal = proposals[proposalId];

        if ((proposal.state != ProposalState.PreBoosted) && (proposal.state != ProposalState.Queued)) {
            return false;
        }

        // enable to increase stake only on the previous stake vote
        Staker storage proposalStake = proposalStakers[proposalId][staker];
        if ((proposalStake.amount > 0) && (proposalStake.option != option)) {
            return false;
        }

        bool transferSuccess = stakingToken.transferFrom(staker, address(this), amount);
        if (!transferSuccess) {
            revert VotingMachine__TransferFromStakerFailed();
        }
        schemes[proposal.schemeId].stakingTokenBalance += amount;
        proposalStake.amount = proposalStake.amount + amount;
        proposalStake.option = option;

        // This is to prevent average downstakes calculation overflow

        if (proposalStake.amount > 0x100000000000000000000000000000000) {
            revert VotingMachine__StakingAmountIsTooHight();
        }

        if (
            proposalStakes[proposalId][YES] + proposalStakes[proposalId][NO] >
            uint256(0x100000000000000000000000000000000)
        ) {
            revert VotingMachine__TotalStakesIsToHight();
        }

        proposalStakes[proposalId][option] = amount + proposalStakes[proposalId][option];
        emit Stake(proposalId, schemes[proposal.schemeId].avatar, staker, option, amount);
        return _execute(proposalId);
    }

    /**
     * @dev Register a new proposal with the given parameters. Every proposal has a unique ID which is being generated by calculating keccak256 of a incremented counter.
     * @param optionsAmount The total amount of options for the proposal
     * @param paramsHash Parameters hash
     * @param proposer Proposer address
     * @param avatar Avatar address
     * @return proposalId ID of the new proposal registered
     */
    function _propose(
        uint256 optionsAmount,
        bytes32 paramsHash,
        address proposer,
        address avatar
    ) internal returns (bytes32 proposalId) {
        if (optionsAmount != NUM_OF_OPTIONS) {
            revert VotingMachine__InvalidOptionsAmount();
        }
        // Check parameters existence.
        if (parameters[paramsHash].queuedVoteRequiredPercentage < 5000) {
            revert VotingMachine__InvalidParameters();
        }
        // Generate a unique ID:
        proposalId = keccak256(abi.encodePacked(this, proposalsCnt));
        proposalsCnt = proposalsCnt + 1;
        // Open proposal:
        Proposal memory proposal;
        proposal.callbacks = msg.sender;
        proposal.schemeId = keccak256(abi.encodePacked(msg.sender, avatar));

        proposal.state = ProposalState.Queued;
        // solhint-disable-next-line not-rely-on-time
        proposal.times[0] = block.timestamp; //submitted time
        proposal.currentBoostedVotePeriodLimit = parameters[paramsHash].boostedVotePeriodLimit;
        proposal.proposer = proposer;
        proposal.winningVote = NO;
        proposal.paramsHash = paramsHash;
        if (schemes[proposal.schemeId].avatar == address(0)) {
            if (avatar == address(0)) {
                schemes[proposal.schemeId].avatar = msg.sender;
            } else {
                schemes[proposal.schemeId].avatar = avatar;
            }
        }
        proposal.daoBounty = parameters[paramsHash].daoBounty;
        proposalStakes[proposalId][NO] = proposal.daoBounty; //dao downstake on the proposal
        proposals[proposalId] = proposal;
        numOfOptions[proposalId] = optionsAmount;
        activeProposals[getProposalAvatar(proposalId)].add(proposalId);
        emit NewProposal(proposalId, schemes[proposal.schemeId].avatar, optionsAmount, proposer, paramsHash);
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
     * @param params Array of params (8) to hash
     * @return paramsHash Hash of the given parameters
     */
    function getParametersHash(uint256[8] memory params) public pure returns (bytes32 paramsHash) {
        return
            keccak256(
                abi.encodePacked(params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7])
            );
    }

    /**
     * @dev Hash the vote data that is used for signatures
     * @param proposalId Id of the proposal
     * @param signer The signer of the vote
     * @param option The vote option, NO(1) or YES(2).
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
                            keccak256(bytes("VotingMachine")),
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
     * @dev Returns the vote and the amount of reputation of the user committed to this proposal
     * @param proposalId The ID of the proposal
     * @param voter The address of the voter
     * @return option The option voted
     * @return amount The amount of rep used in the vote
     */
    function getVoter(bytes32 proposalId, address voter) external view returns (uint256 option, uint256 amount) {
        return (proposalVoters[proposalId][voter].option, proposalVoters[proposalId][voter].reputation);
    }

    /**
     * @dev Returns the vote and stake amount for a given proposal and staker
     * @param proposalId The ID of the proposal
     * @param staker Staker address
     * @return option Staked option
     * @return amount Staked amount
     */
    function getStaker(bytes32 proposalId, address staker) external view returns (uint256 option, uint256 amount) {
        return (proposalStakers[proposalId][staker].option, proposalStakers[proposalId][staker].amount);
    }

    /**
     * @dev Returns the allowed range of options for a voting machine.
     * @return min Minimum number of options
     * @return max Maximum number of options
     */
    function getAllowedRangeOfOptions() external pure returns (uint256 min, uint256 max) {
        return (NO, YES);
    }

    /**
     * @dev Returns the number of options possible in this proposal
     * @param proposalId The proposal id
     * @return proposalOptionsAmount Number of options for given proposal
     */
    function getNumberOfOptions(bytes32 proposalId) public view returns (uint256 proposalOptionsAmount) {
        return numOfOptions[proposalId];
    }

    /**
     * @dev Returns the total votes, preBoostedVotes and stakes for a given proposal
     * @param proposalId The ID of the proposal
     * @return votesNo Proposal votes NO
     * @return votesYes Proposal votes YES
     * @return preBoostedVotesNo Proposal pre boosted votes NO
     * @return preBoostedVotesYes Proposal pre boosted votes YES
     * @return totalStakesNo Proposal total stakes NO
     * @return totalStakesYes Proposal total stakes YES
     */
    function getProposalStatus(bytes32 proposalId)
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
            proposalVotes[proposalId][NO],
            proposalVotes[proposalId][YES],
            proposalPreBoostedVotes[proposalId][NO],
            proposalPreBoostedVotes[proposalId][YES],
            proposalStakes[proposalId][NO],
            proposalStakes[proposalId][YES]
        );
    }

    /**
     * @dev Returns the Avatar address for a given proposalId
     * @param proposalId ID of the proposal
     * @return avatarAddress Avatar address
     */
    function getProposalAvatar(bytes32 proposalId) public view returns (address avatarAddress) {
        return schemes[proposals[proposalId].schemeId].avatar;
    }

    /**
     * @dev Returns array of proposal ids based on index args. Both indexes are inclusive, unles (0,0) that returns all elements
     * @param start The index to start batching.
     * @param end The last index of batch (included). Zero will default to last element from the list
     * @param proposalsSet Set of proposal ids
     * @return proposalsArray List of proposal IDs from `proposalsSet` for given range
     */
    function _getProposalsBatchRequest(
        uint256 start,
        uint256 end,
        EnumerableSetUpgradeable.Bytes32Set storage proposalsSet
    ) internal view returns (bytes32[] memory proposalsArray) {
        uint256 totalCount = uint256(proposalsSet.length());
        if (totalCount == 0) {
            return new bytes32[](0);
        }
        if (start > totalCount) {
            revert VotingMachine__StartCannotBeBiggerThanListLength();
        }
        if (end > totalCount) {
            revert VotingMachine__EndCannotBeBiggerThanListLength();
        }
        if (start > end) {
            revert VotingMachine__StartCannotBeBiggerThanEnd();
        }

        uint256 total = totalCount - 1;
        uint256 lastIndex = end == 0 ? total : end;
        uint256 returnCount = lastIndex + 1 - start;

        proposalsArray = new bytes32[](returnCount);
        uint256 i = 0;
        for (i; i < returnCount; i++) {
            proposalsArray[i] = proposalsSet.at(i + start);
        }
        return proposalsArray;
    }

    /**
     * @dev Returns array of active proposal ids
     * @param start The index to start batching
     * @param end The last index of batch (included). Zero will return all
     * @param avatar The avatar address to get active proposals from
     * @return activeProposalsArray List of active proposal ids
     */
    function getActiveProposals(
        uint256 start,
        uint256 end,
        address avatar
    ) external view returns (bytes32[] memory activeProposalsArray) {
        return _getProposalsBatchRequest(start, end, activeProposals[avatar]);
    }

    /**
     * @dev Returns array of inactive proposal ids
     * @param start The index to start batching
     * @param end The last index of batch (included). Zero will return all
     * @param avatar The avatar address to get active proposals from
     * @return inactiveProposalsArray List of inactive proposal ids
     */
    function getInactiveProposals(
        uint256 start,
        uint256 end,
        address avatar
    ) external view returns (bytes32[] memory inactiveProposalsArray) {
        return _getProposalsBatchRequest(start, end, inactiveProposals[avatar]);
    }

    /**
     * @dev Returns the amount of active proposals
     * @param avatar The avatar address
     * @return activeProposalsCount The total count of active proposals for given avatar address
     */
    function getActiveProposalsCount(address avatar) public view returns (uint256 activeProposalsCount) {
        return activeProposals[avatar].length();
    }

    /**
     * @dev Returns the amount of inactive proposals
     * @param avatar The avatar address
     * @return inactiveProposalsCount The total count of active proposals for given avatar address
     */
    function getInactiveProposalsCount(address avatar) public view returns (uint256 inactiveProposalsCount) {
        return inactiveProposals[avatar].length();
    }

    /**
     * @dev Returns proposal `times` property for given `proposalId`
     * @param proposalId Id of the proposal
     * @return times proposal.times [submittedTime, boostedPhaseTime, preBoostedPhaseTime]
     */
    function getProposalTimes(bytes32 proposalId) public view returns (uint256[3] memory times) {
        return proposals[proposalId].times;
    }
}
