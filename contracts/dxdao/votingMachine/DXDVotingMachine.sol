// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import {RealMath} from "../../utils/RealMath.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./DXDVotingMachineCallbacksInterface.sol";
import "./ProposalExecuteInterface.sol";

/**
 * @title GenesisProtocol implementation designed for DXdao
 *
 * New Features:
 *  - Payable Votes: Any organization can send funds and configure the gas and maxGasPrice to be refunded per vote.
 *  - Signed Votes: Votes can be signed for this or any voting machine, they can be shared on this voting machine and
 *    execute votes signed for this voting machine.
 *  - Signal Votes: Voters can signal their decisions with near 50k gas, the signaled votes can be executed on
 *    chain by anyone.
 */
contract DXDVotingMachine {
    using ECDSA for bytes32;
    using SafeMath for uint256;
    using Math for uint256;
    using RealMath for uint216;
    using RealMath for uint256;
    using Address for address;

    enum ProposalState {
        None,
        ExpiredInQueue,
        Executed,
        Queued,
        PreBoosted,
        Boosted,
        QuietEndingPeriod
    }
    enum ExecutionState {
        None,
        QueueBarCrossed,
        QueueTimeOut,
        PreBoostedBarCrossed,
        BoostedTimeOut,
        BoostedBarCrossed
    }

    //Organization's parameters
    struct Parameters {
        uint256 queuedVoteRequiredPercentage; // the absolute vote percentages bar.
        uint256 queuedVotePeriodLimit; //the time limit for a proposal to be in an absolute voting mode.
        uint256 boostedVotePeriodLimit; //the time limit for a proposal to be in boost mode.
        uint256 preBoostedVotePeriodLimit; //the time limit for a proposal
        //to be in an preparation state (stable) before boosted.
        uint256 thresholdConst; //constant  for threshold calculation .
        //threshold =thresholdConst ** (numberOfBoostedProposals)
        uint256 limitExponentValue; // an upper limit for numberOfBoostedProposals
        //in the threshold calculation to prevent overflow
        uint256 quietEndingPeriod; //quite ending period
        uint256 proposingRepReward; //proposer reputation reward.
        uint256 votersReputationLossRatio; //Unsuccessful pre booster
        //voters lose votersReputationLossRatio% of their reputation.
        uint256 minimumDaoBounty;
        uint256 daoBountyConst; //The DAO downstake for each proposal is calculate according to the formula
        //(daoBountyConst * averageBoostDownstakes)/100 .
        uint256 activationTime; //the point in time after which proposals can be created.
        //if this address is set so only this address is allowed to vote of behalf of someone else.
        address voteOnBehalf;
    }

    struct Voter {
        uint256 vote; // YES(1) ,NO(2)
        uint256 reputation; // amount of voter's reputation
        bool preBoosted;
    }

    struct Staker {
        uint256 vote; // YES(1) ,NO(2)
        uint256 amount; // amount of staker's stake
        uint256 amount4Bounty; // amount of staker's stake used for bounty reward calculation.
    }

    struct Proposal {
        bytes32 organizationId; // the organization unique identifier the proposal is target to.
        address callbacks; // should fulfill voting callbacks interface.
        ProposalState state;
        uint256 winningVote; //the winning vote.
        address proposer;
        //the proposal boosted period limit . it is updated for the case of quiteWindow mode.
        uint256 currentBoostedVotePeriodLimit;
        bytes32 paramsHash;
        uint256 daoBountyRemain; //use for checking sum zero bounty claims.it is set at the proposing time.
        uint256 daoBounty;
        uint256 totalStakes; // Total number of tokens staked which can be redeemable by stakers.
        uint256 confidenceThreshold;
        uint256 secondsFromTimeOutTillExecuteBoosted;
        uint256[3] times; //times[0] - submittedTime
        //times[1] - boostedPhaseTime
        //times[2] -preBoostedPhaseTime;
        bool daoRedeemItsWinnings;
    }

    struct OrganizationRefunds {
        uint256 balance;
        uint256 voteGas;
        uint256 maxGasPrice;
    }

    struct VoteDecision {
        uint256 voteDecision;
        uint256 amount;
    }

    struct ExecuteFunctionParams {
        uint256 totalReputation;
        uint256 executionBar;
        uint256 _boostedVoteRequiredPercentage;
        uint256 boostedExecutionBar;
        uint256 averageDownstakesOfBoosted;
        uint256 confidenceThreshold;
    }

    event NewProposal(
        bytes32 indexed _proposalId,
        address indexed _organization,
        uint256 _numOfChoices,
        address _proposer,
        bytes32 _paramsHash
    );

    event ExecuteProposal(
        bytes32 indexed _proposalId,
        address indexed _organization,
        uint256 _decision,
        uint256 _totalReputation
    );

    event VoteProposal(
        bytes32 indexed _proposalId,
        address indexed _organization,
        address indexed _voter,
        uint256 _vote,
        uint256 _reputation
    );

    event CancelProposal(bytes32 indexed _proposalId, address indexed _organization);
    event CancelVoting(bytes32 indexed _proposalId, address indexed _organization, address indexed _voter);

    event Stake(
        bytes32 indexed _proposalId,
        address indexed _organization,
        address indexed _staker,
        uint256 _vote,
        uint256 _amount
    );

    event Redeem(
        bytes32 indexed _proposalId,
        address indexed _organization,
        address indexed _beneficiary,
        uint256 _amount
    );

    event RedeemDaoBounty(
        bytes32 indexed _proposalId,
        address indexed _organization,
        address indexed _beneficiary,
        uint256 _amount
    );

    event RedeemReputation(
        bytes32 indexed _proposalId,
        address indexed _organization,
        address indexed _beneficiary,
        uint256 _amount
    );

    event VoteSigned(
        address votingMachine,
        bytes32 proposalId,
        address voter,
        uint256 voteDecision,
        uint256 amount,
        bytes signature
    );

    event StateChange(bytes32 indexed _proposalId, ProposalState _proposalState);
    event GPExecuteProposal(bytes32 indexed _proposalId, ExecutionState _executionState);
    event ExpirationCallBounty(bytes32 indexed _proposalId, address indexed _beneficiary, uint256 _amount);
    event ConfidenceLevelChange(bytes32 indexed _proposalId, uint256 _confidenceThreshold);

    // Event used to signal votes to be executed on chain
    event VoteSignaled(bytes32 proposalId, address voter, uint256 voteDecision, uint256 amount);

    // Mappings of a proposal various properties
    //      proposalId         vote       reputation
    mapping(bytes32 => mapping(uint256 => uint256)) proposalVotes;
    //      proposalId         vote       reputation
    mapping(bytes32 => mapping(uint256 => uint256)) proposalPreBoostedVotes;
    //      proposalId         address    voter
    mapping(bytes32 => mapping(address => Voter)) proposalVoters;
    //      proposalId         address    stakes
    mapping(bytes32 => mapping(uint256 => uint256)) proposalStakes;
    //      proposalId         address    staker
    mapping(bytes32 => mapping(address => Staker)) proposalStakers;

    mapping(bytes32 => Parameters) public parameters; // A mapping from hashes to parameters
    mapping(bytes32 => Proposal) public proposals; // Mapping from the ID of the proposal to the proposal itself.
    mapping(bytes32 => uint256) public orgBoostedProposalsCnt;
    //organizationId => organization
    mapping(bytes32 => address) public organizations;
    //organizationId => averageBoostDownstakes
    mapping(bytes32 => uint256) public averagesDownstakesOfBoosted;
    uint256 public constant NUM_OF_CHOICES = 2;
    uint256 public constant NO = 2;
    uint256 public constant YES = 1;
    uint256 public proposalsCnt; // Total number of proposals
    IERC20 public stakingToken;
    address private constant GEN_TOKEN_ADDRESS = 0x543Ff227F64Aa17eA132Bf9886cAb5DB55DCAddf;
    uint256 private constant MAX_BOOSTED_PROPOSALS = 4096;

    // Digest describing the data the user signs according EIP 712.
    // Needs to match what is passed to Metamask.
    bytes32 public constant DELEGATION_HASH_EIP712 =
        keccak256(
            abi.encodePacked(
                "address GenesisProtocolAddress",
                "bytes32 ProposalId",
                "uint256 Vote",
                "uint256 AmountToStake",
                "uint256 Nonce"
            )
        );

    mapping(address => uint256) public stakesNonce; //stakes Nonce

    // organization id scheme => parameters hash => required % of votes in boosted proposal.
    // 100 == 1%, 2500 == 25%.
    mapping(bytes32 => mapping(bytes32 => uint256)) public boostedVoteRequiredPercentage;

    mapping(address => OrganizationRefunds) public organizationRefunds;

    // Event used to share vote signatures on chain
    mapping(bytes32 => mapping(address => VoteDecision)) public votesSignaled;

    // The number of choices of each proposal
    mapping(bytes32 => uint256) internal numOfChoices;

    //When implementing this interface please do not only override function and modifier,
    //but also to keep the modifiers on the overridden functions.
    modifier onlyProposalOwner(bytes32 _proposalId) {
        revert();
        _;
    }

    /**
     * @dev Check that the proposal is votable
     * a proposal is votable if it is in one of the following states:
     *  PreBoosted,Boosted,QuietEndingPeriod or Queued
     */
    modifier votable(bytes32 _proposalId) {
        require(_isVotable(_proposalId));
        _;
    }

    modifier validDecision(bytes32 proposalId, uint256 decision) {
        require(decision <= getNumberOfChoices(proposalId) && decision > 0, "wrong decision value");
        _;
    }

    /**
     * @dev Constructor
     */
    constructor(IERC20 _stakingToken) {
        //The GEN token (staking token) address is hard coded in the contract by GEN_TOKEN_ADDRESS .
        //This will work for a network which already hosted the GEN token on this address (e.g mainnet).
        //If such contract address does not exist in the network (e.g ganache)
        //the contract will use the _stakingToken param as the
        //staking token address.

        require(address(_stakingToken) != address(0), "wrong _stakingToken");
        if (address(GEN_TOKEN_ADDRESS).isContract()) {
            stakingToken = IERC20(GEN_TOKEN_ADDRESS);
        } else {
            stakingToken = _stakingToken;
        }
    }

    /**
     * @dev Allows the voting machine to receive ether to be used to refund voting costs
     */
    receive() external payable {
        require(
            organizationRefunds[msg.sender].voteGas > 0,
            "DXDVotingMachine: Address not registered in organizationRefounds"
        );
        organizationRefunds[msg.sender].balance = organizationRefunds[msg.sender].balance.add(msg.value);
    }

    /**
     * @dev executeBoosted try to execute a boosted or QuietEndingPeriod proposal if it is expired
     * it rewards the msg.sender with P % of the proposal's upstakes upon a successful call to this function.
     * P = t/150, where t is the number of seconds passed since the the proposal's timeout.
     * P is capped by 10%.
     * @param _proposalId the id of the proposal
     * @return expirationCallBounty the bounty amount for the expiration call
     */
    function executeBoosted(bytes32 _proposalId) external returns (uint256 expirationCallBounty) {
        Proposal storage proposal = proposals[_proposalId];
        require(
            proposal.state == ProposalState.Boosted || proposal.state == ProposalState.QuietEndingPeriod,
            "proposal state in not Boosted nor QuietEndingPeriod"
        );
        require(_execute(_proposalId), "proposal need to expire");

        proposal.secondsFromTimeOutTillExecuteBoosted = block.timestamp.sub(
            // solhint-disable-next-line not-rely-on-time
            proposal.currentBoostedVotePeriodLimit.add(proposal.times[1])
        );

        expirationCallBounty = calcExecuteCallBounty(_proposalId);
        proposal.totalStakes = proposal.totalStakes.sub(expirationCallBounty);
        require(stakingToken.transfer(msg.sender, expirationCallBounty), "transfer to msg.sender failed");
        emit ExpirationCallBounty(_proposalId, msg.sender, expirationCallBounty);
    }

    /**
     * @dev hash the parameters, save them if necessary, and return the hash value
     * @param _params a parameters array
     *    _params[0] - _queuedVoteRequiredPercentage,
     *    _params[1] - _queuedVotePeriodLimit, //the time limit for a proposal to be in an absolute voting mode.
     *    _params[2] - _boostedVotePeriodLimit, //the time limit for a proposal to be in an relative voting mode.
     *    _params[3] - _preBoostedVotePeriodLimit, //the time limit for a proposal to be in an preparation
     *                  state (stable) before boosted.
     *    _params[4] -_thresholdConst
     *    _params[5] -_quietEndingPeriod
     *    _params[6] -_proposingRepReward
     *    _params[7] -_votersReputationLossRatio
     *    _params[8] -_minimumDaoBounty
     *    _params[9] -_daoBountyConst
     *    _params[10] -_activationTime
     * @param _voteOnBehalf - authorized to vote on behalf of others.
     */
    function setParameters(
        uint256[11] calldata _params, //use array here due to stack too deep issue.
        address _voteOnBehalf
    ) external returns (bytes32) {
        require(_params[0] <= 100 && _params[0] >= 50, "50 <= queuedVoteRequiredPercentage <= 100");
        require(_params[4] <= 16000 && _params[4] > 1000, "1000 < thresholdConst <= 16000");
        require(_params[7] <= 100, "votersReputationLossRatio <= 100");
        require(_params[2] >= _params[5], "boostedVotePeriodLimit >= quietEndingPeriod");
        require(_params[8] > 0, "minimumDaoBounty should be > 0");
        require(_params[9] > 0, "daoBountyConst should be > 0");

        bytes32 paramsHash = getParametersHash(_params, _voteOnBehalf);
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
            proposingRepReward: _params[6],
            votersReputationLossRatio: _params[7],
            minimumDaoBounty: _params[8],
            daoBountyConst: _params[9],
            activationTime: _params[10],
            voteOnBehalf: _voteOnBehalf
        });
        return paramsHash;
    }

    /**
     * @dev redeem a reward for a successful stake, vote or proposing.
     * The function use a beneficiary address as a parameter (and not msg.sender) to enable
     * users to redeem on behalf of someone else.
     * @param _proposalId the ID of the proposal
     * @param _beneficiary - the beneficiary address
     * @return rewards -
     *           [0] stakerTokenReward
     *           [1] voterReputationReward
     *           [2] proposerReputationReward
     */
    // solhint-disable-next-line function-max-lines,code-complexity
    function redeem(bytes32 _proposalId, address _beneficiary) public returns (uint256[3] memory rewards) {
        Proposal storage proposal = proposals[_proposalId];
        require(
            (proposal.state == ProposalState.Executed) || (proposal.state == ProposalState.ExpiredInQueue),
            "Proposal should be Executed or ExpiredInQueue"
        );
        Parameters memory params = parameters[proposal.paramsHash];
        //as staker
        Staker storage staker = proposalStakers[_proposalId][_beneficiary];
        uint256 totalWinningStakes = proposalStakes[_proposalId][proposal.winningVote];
        uint256 totalStakesLeftAfterCallBounty = proposalStakes[_proposalId][NO]
            .add(proposalStakes[_proposalId][YES])
            .sub(calcExecuteCallBounty(_proposalId));
        if (staker.amount > 0) {
            if (proposal.state == ProposalState.ExpiredInQueue) {
                //Stakes of a proposal that expires in Queue are sent back to stakers
                rewards[0] = staker.amount;
            } else if (staker.vote == proposal.winningVote) {
                if (staker.vote == YES) {
                    if (proposal.daoBounty < totalStakesLeftAfterCallBounty) {
                        uint256 _totalStakes = totalStakesLeftAfterCallBounty.sub(proposal.daoBounty);
                        rewards[0] = (staker.amount.mul(_totalStakes)) / totalWinningStakes;
                    }
                } else {
                    rewards[0] = (staker.amount.mul(totalStakesLeftAfterCallBounty)) / totalWinningStakes;
                }
            }
            staker.amount = 0;
        }
        //dao redeem its winnings
        if (
            proposal.daoRedeemItsWinnings == false &&
            _beneficiary == organizations[proposal.organizationId] &&
            proposal.state != ProposalState.ExpiredInQueue &&
            proposal.winningVote == NO
        ) {
            rewards[0] = rewards[0]
                .add((proposal.daoBounty.mul(totalStakesLeftAfterCallBounty)) / totalWinningStakes)
                .sub(proposal.daoBounty);
            proposal.daoRedeemItsWinnings = true;
        }

        //as voter
        Voter storage voter = proposalVoters[_proposalId][_beneficiary];
        if ((voter.reputation != 0) && (voter.preBoosted)) {
            if (proposal.state == ProposalState.ExpiredInQueue) {
                //give back reputation for the voter
                rewards[1] = ((voter.reputation.mul(params.votersReputationLossRatio)) / 100);
            } else if (proposal.winningVote == voter.vote) {
                uint256 lostReputation;
                if (proposal.winningVote == YES) {
                    lostReputation = proposalPreBoostedVotes[_proposalId][NO];
                } else {
                    lostReputation = proposalPreBoostedVotes[_proposalId][YES];
                }
                lostReputation = (lostReputation.mul(params.votersReputationLossRatio)) / 100;
                rewards[1] = ((voter.reputation.mul(params.votersReputationLossRatio)) / 100).add(
                    (voter.reputation.mul(lostReputation)) / proposalPreBoostedVotes[_proposalId][proposal.winningVote]
                );
            }
            voter.reputation = 0;
        }
        //as proposer
        if ((proposal.proposer == _beneficiary) && (proposal.winningVote == YES) && (proposal.proposer != address(0))) {
            rewards[2] = params.proposingRepReward;
            proposal.proposer = address(0);
        }
        if (rewards[0] != 0) {
            proposal.totalStakes = proposal.totalStakes.sub(rewards[0]);
            require(stakingToken.transfer(_beneficiary, rewards[0]), "transfer to beneficiary failed");
            emit Redeem(_proposalId, organizations[proposal.organizationId], _beneficiary, rewards[0]);
        }
        if (rewards[1].add(rewards[2]) != 0) {
            DXDVotingMachineCallbacksInterface(proposal.callbacks).mintReputation(
                rewards[1].add(rewards[2]),
                _beneficiary,
                _proposalId
            );
            emit RedeemReputation(
                _proposalId,
                organizations[proposal.organizationId],
                _beneficiary,
                rewards[1].add(rewards[2])
            );
        }
    }

    /**
     * @dev redeemDaoBounty a reward for a successful stake.
     * The function use a beneficiary address as a parameter (and not msg.sender) to enable
     * users to redeem on behalf of someone else.
     * @param _proposalId the ID of the proposal
     * @param _beneficiary - the beneficiary address
     * @return redeemedAmount - redeem token amount
     * @return potentialAmount - potential redeem token amount(if there is enough tokens bounty at the organization )
     */
    function redeemDaoBounty(bytes32 _proposalId, address _beneficiary)
        public
        returns (uint256 redeemedAmount, uint256 potentialAmount)
    {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.state == ProposalState.Executed);
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
        if (
            (potentialAmount != 0) &&
            (DXDVotingMachineCallbacksInterface(proposal.callbacks).balanceOfStakingToken(
                address(stakingToken),
                _proposalId
            ) >= potentialAmount)
        ) {
            staker.amount4Bounty = 0;
            proposal.daoBountyRemain = proposal.daoBountyRemain.sub(potentialAmount);
            require(
                DXDVotingMachineCallbacksInterface(proposal.callbacks).stakingTokenTransfer(
                    address(stakingToken),
                    _beneficiary,
                    potentialAmount,
                    _proposalId
                )
            );
            redeemedAmount = potentialAmount;
            emit RedeemDaoBounty(_proposalId, organizations[proposal.organizationId], _beneficiary, redeemedAmount);
        }
    }

    /**
     * @dev calcExecuteCallBounty calculate the execute boosted call bounty
     * @param _proposalId the ID of the proposal
     * @return uint256 executeCallBounty
     */
    function calcExecuteCallBounty(bytes32 _proposalId) public view returns (uint256) {
        uint256 maxRewardSeconds = 1500;
        uint256 rewardSeconds = uint256(maxRewardSeconds).min(
            proposals[_proposalId].secondsFromTimeOutTillExecuteBoosted
        );
        return rewardSeconds.mul(proposalStakes[_proposalId][YES]).div(maxRewardSeconds * 10);
    }

    /**
     * @dev shouldBoost check if a proposal should be shifted to boosted phase.
     * @param _proposalId the ID of the proposal
     * @return bool true or false.
     */
    function shouldBoost(bytes32 _proposalId) public view returns (bool) {
        Proposal memory proposal = proposals[_proposalId];
        return (_score(_proposalId) > threshold(proposal.paramsHash, proposal.organizationId));
    }

    /**
     * @dev threshold return the organization's score threshold which required by
     * a proposal to shift to boosted state.
     * This threshold is dynamically set and it depend on the number of boosted proposal.
     * @param _organizationId the organization identifier
     * @param _paramsHash the organization parameters hash
     * @return uint256 organization's score threshold as real number.
     */
    function threshold(bytes32 _paramsHash, bytes32 _organizationId) public view returns (uint256) {
        uint256 power = orgBoostedProposalsCnt[_organizationId];
        Parameters storage params = parameters[_paramsHash];

        if (power > params.limitExponentValue) {
            power = params.limitExponentValue;
        }

        return params.thresholdConst.pow(power);
    }

    /**
     * @dev staking function
     * @param _proposalId id of the proposal
     * @param _vote  NO(2) or YES(1).
     * @param _amount the betting amount
     * @return bool true - the proposal has been executed
     *              false - otherwise.
     */
    function stake(
        bytes32 _proposalId,
        uint256 _vote,
        uint256 _amount
    ) external returns (bool) {
        return _stake(_proposalId, _vote, _amount, msg.sender);
    }

    /**
     * @dev stakeWithSignature function
     * @param _proposalId id of the proposal
     * @param _vote  NO(2) or YES(1).
     * @param _amount the betting amount
     * @param _nonce nonce value ,it is part of the signature to ensure that
              a signature can be received only once.
     * @param _signatureType signature type
              1 - for web3.eth.sign
              2 - for eth_signTypedData according to EIP #712.
     * @param _signature  - signed data by the staker
     * @return bool true - the proposal has been executed
     *              false - otherwise.
     */
    function stakeWithSignature(
        bytes32 _proposalId,
        uint256 _vote,
        uint256 _amount,
        uint256 _nonce,
        uint256 _signatureType,
        bytes calldata _signature
    ) external returns (bool) {
        // Recreate the digest the user signed
        bytes32 delegationDigest;
        if (_signatureType == 2) {
            delegationDigest = keccak256(
                abi.encodePacked(
                    DELEGATION_HASH_EIP712,
                    keccak256(abi.encodePacked(address(this), _proposalId, _vote, _amount, _nonce))
                )
            );
        } else {
            delegationDigest = keccak256(abi.encodePacked(address(this), _proposalId, _vote, _amount, _nonce))
                .toEthSignedMessageHash();
        }
        address staker = delegationDigest.recover(_signature);
        //a garbage staker address due to wrong signature will revert due to lack of approval and funds.
        require(staker != address(0), "staker address cannot be 0");
        require(stakesNonce[staker] == _nonce);
        stakesNonce[staker] = stakesNonce[staker].add(1);
        return _stake(_proposalId, _vote, _amount, staker);
    }

    /**
     * @dev Config the vote refund for each organization
     * @param _voteGas the amount of gas that will be used as vote cost
     * @param _maxGasPrice the maximum amount of gas price to be paid, if the gas used is higher than this value only a
     * portion of the total gas would be refunded
     */
    function setOrganizationRefund(uint256 _voteGas, uint256 _maxGasPrice) external {
        organizationRefunds[msg.sender].voteGas = _voteGas;
        organizationRefunds[msg.sender].maxGasPrice = _maxGasPrice;
    }

    /**
     * @dev Withdraw organization refund balance
     */
    function withdrawRefundBalance() public {
        require(
            organizationRefunds[msg.sender].voteGas > 0,
            "DXDVotingMachine: Address not registered in organizationRefounds"
        );
        require(organizationRefunds[msg.sender].balance > 0, "DXDVotingMachine: Organization refund balance is zero");
        uint256 organizationBalance = organizationRefunds[msg.sender].balance;
        organizationRefunds[msg.sender].balance = 0;
        payable(msg.sender).transfer(organizationBalance);
    }

    /**
     * @dev Config the required % of votes needed in a boosted proposal in a scheme, only callable by the avatar
     * @param _scheme the scheme address to be configured
     * @param _paramsHash the parameters configuration hashed of the scheme
     * @param _boostedVotePeriodLimit the required % of votes needed in a boosted proposal to be executed on that scheme
     */
    function setBoostedVoteRequiredPercentage(
        address _scheme,
        bytes32 _paramsHash,
        uint256 _boostedVotePeriodLimit
    ) external {
        boostedVoteRequiredPercentage[keccak256(abi.encodePacked(_scheme, msg.sender))][
            _paramsHash
        ] = _boostedVotePeriodLimit;
    }

    /**
     * @dev voting function from old voting machine changing only the logic to refund vote after vote done
     *
     * @param _proposalId id of the proposal
     * @param _vote NO(2) or YES(1).
     * @param _amount the reputation amount to vote with, 0 will use all available REP
     * @param _voter voter address
     * @return bool if the proposal has been executed or not
     */
    function vote(
        bytes32 _proposalId,
        uint256 _vote,
        uint256 _amount,
        address _voter
    ) external votable(_proposalId) returns (bool) {
        Proposal storage proposal = proposals[_proposalId];
        Parameters memory params = parameters[proposal.paramsHash];
        address voter;
        if (params.voteOnBehalf != address(0)) {
            require(msg.sender == params.voteOnBehalf, "address not allowed to vote on behalf");
            voter = _voter;
        } else {
            voter = msg.sender;
        }
        bool voteResult = internalVote(_proposalId, voter, _vote, _amount);
        _refundVote(proposal.organizationId);
        return voteResult;
    }

    /**
     * @dev Cancel the vote of the msg.sender.
     * cancel vote is not allow in genesisProtocol so this function doing nothing.
     * This function is here in order to comply to the IntVoteInterface .
     */
    function cancelVote(bytes32 _proposalId) external view votable(_proposalId) {
        //this is not allowed
        return;
    }

    /**
     * @dev execute check if the proposal has been decided, and if so, execute the proposal
     * @param _proposalId the id of the proposal
     * @return bool true - the proposal has been executed
     *              false - otherwise.
     */
    function execute(bytes32 _proposalId) external votable(_proposalId) returns (bool) {
        return _execute(_proposalId);
    }

    /**
     * @dev voteInfo returns the vote and the amount of reputation of the user committed to this proposal
     * @param _proposalId the ID of the proposal
     * @param _voter the address of the voter
     * @return uint256 vote - the voters vote
     *        uint256 reputation - amount of reputation committed by _voter to _proposalId
     */
    function voteInfo(bytes32 _proposalId, address _voter) external view returns (uint256, uint256) {
        Voter memory voter = proposalVoters[_proposalId][_voter];
        return (voter.vote, voter.reputation);
    }

    /**
     * @dev voteStatus returns the reputation voted for a proposal for a specific voting choice.
     * @param _proposalId the ID of the proposal
     * @param _choice the index in the
     * @return voted reputation for the given choice
     */
    function voteStatus(bytes32 _proposalId, uint256 _choice) external view returns (uint256) {
        return proposalVotes[_proposalId][_choice];
    }

    /**
     * @dev isVotable check if the proposal is votable
     * @param _proposalId the ID of the proposal
     * @return bool true or false
     */
    function isVotable(bytes32 _proposalId) external view returns (bool) {
        return _isVotable(_proposalId);
    }

    /**
     * @dev Share the vote of a proposal for a voting machine on a event log
     *
     * @param votingMachine the voting machine address
     * @param proposalId id of the proposal
     * @param voter address of voter
     * @param voteDecision the vote decision, NO(2) or YES(1).
     * @param amount the reputation amount to vote with, 0 will use all available REP
     * @param signature the encoded vote signature
     */
    function shareSignedVote(
        address votingMachine,
        bytes32 proposalId,
        address voter,
        uint256 voteDecision,
        uint256 amount,
        bytes calldata signature
    ) external validDecision(proposalId, voteDecision) {
        bytes32 voteHashed = hashVote(votingMachine, proposalId, voter, voteDecision, amount);
        require(voter == voteHashed.toEthSignedMessageHash().recover(signature), "wrong signer");
        emit VoteSigned(votingMachine, proposalId, voter, voteDecision, amount, signature);
    }

    /**
     * @dev Signal the vote of a proposal in this voting machine to be executed later
     *
     * @param proposalId id of the proposal to vote
     * @param voteDecision the vote decisions, NO(2) or YES(1).
     * @param amount the reputation amount to vote with, 0 will use all available REP
     */
    function signalVote(
        bytes32 proposalId,
        uint256 voteDecision,
        uint256 amount
    ) external validDecision(proposalId, voteDecision) {
        require(_isVotable(proposalId), "not votable proposal");
        require(votesSignaled[proposalId][msg.sender].voteDecision == 0, "already voted");
        votesSignaled[proposalId][msg.sender].voteDecision = voteDecision;
        votesSignaled[proposalId][msg.sender].amount = amount;
        emit VoteSignaled(proposalId, msg.sender, voteDecision, amount);
    }

    /**
     * @dev Execute a signed vote
     *
     * @param votingMachine the voting machine address
     * @param proposalId id of the proposal to execute the vote on
     * @param voter the signer of the vote
     * @param voteDecision the vote decision, NO(2) or YES(1).
     * @param amount the reputation amount to vote with, 0 will use all available REP
     * @param signature the signature of the hashed vote
     */
    function executeSignedVote(
        address votingMachine,
        bytes32 proposalId,
        address voter,
        uint256 voteDecision,
        uint256 amount,
        bytes calldata signature
    ) external {
        require(votingMachine == address(this), "wrong votingMachine");
        require(_isVotable(proposalId), "not votable proposal");
        require(
            voter ==
                hashVote(votingMachine, proposalId, voter, voteDecision, amount).toEthSignedMessageHash().recover(
                    signature
                ),
            "wrong signer"
        );
        internalVote(proposalId, voter, voteDecision, amount);
        _refundVote(proposals[proposalId].organizationId);
    }

    /**
     * @dev register a new proposal with the given parameters. Every proposal has a unique ID which is being
     * generated by calculating keccak256 of a incremented counter.
     * @param _paramsHash parameters hash
     * @param _proposer address
     * @param _organization address
     */
    function propose(
        uint256,
        bytes32 _paramsHash,
        address _proposer,
        address _organization
    ) external returns (bytes32) {
        return _propose(NUM_OF_CHOICES, _paramsHash, _proposer, _organization);
    }

    /**
     * @dev register a new proposal with the given parameters. Every proposal has a unique ID which is being
     * generated by calculating keccak256 of a incremented counter.
     * @param _choicesAmount the total amount of choices for the proposal
     * @param _paramsHash parameters hash
     * @param _proposer address
     * @param _organization address
     */
    function proposeMultipleChoice(
        uint256 _choicesAmount,
        bytes32 _paramsHash,
        address _proposer,
        address _organization
    ) external returns (bytes32) {
        return _propose(_choicesAmount, _paramsHash, _proposer, _organization);
    }

    /**
     * @dev Vote for a proposal, if the voter already voted, cancel the last vote and set a new one instead
     * @param _proposalId id of the proposal
     * @param _voter used in case the vote is cast for someone else
     * @param _vote a value between 0 to and the proposal's number of choices.
     * @param _rep how many reputation the voter would like to stake for this vote.
     *         if  _rep==0 so the voter full reputation will be use.
     * @return true in case of proposal execution otherwise false
     * throws if proposal is not open or if it has been executed
     * NB: executes the proposal if a decision has been reached
     */
    // solhint-disable-next-line function-max-lines,code-complexity
    function internalVote(
        bytes32 _proposalId,
        address _voter,
        uint256 _vote,
        uint256 _rep
    ) internal validDecision(_proposalId, _vote) returns (bool) {
        if (_execute(_proposalId)) {
            return true;
        }

        Parameters memory params = parameters[proposals[_proposalId].paramsHash];
        Proposal storage proposal = proposals[_proposalId];

        // Check voter has enough reputation:
        uint256 reputation = DXDVotingMachineCallbacksInterface(proposal.callbacks).reputationOf(_voter, _proposalId);
        require(reputation > 0, "_voter must have reputation");
        require(reputation >= _rep, "reputation >= _rep");
        uint256 rep = _rep;
        if (rep == 0) {
            rep = reputation;
        }
        // If this voter has already voted, return false.
        if (proposalVoters[_proposalId][_voter].reputation != 0) {
            return false;
        }
        // The voting itself:
        proposalVotes[_proposalId][_vote] = rep.add(proposalVotes[_proposalId][_vote]);
        //check if the current winningVote changed or there is a tie.
        //for the case there is a tie the current winningVote set to NO.
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
                //quietEndingPeriod
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
            proposalPreBoostedVotes[_proposalId][_vote] = rep.add(proposalPreBoostedVotes[_proposalId][_vote]);
            uint256 reputationDeposit = (params.votersReputationLossRatio.mul(rep)) / 100;
            DXDVotingMachineCallbacksInterface(proposal.callbacks).burnReputation(
                reputationDeposit,
                _voter,
                _proposalId
            );
        }
        emit VoteProposal(_proposalId, organizations[proposal.organizationId], _voter, _vote, rep);
        return _execute(_proposalId);
    }

    /**
     * @dev Execute a signed vote on a votable proposal
     *
     * @param proposalId id of the proposal to vote
     * @param voter the signer of the vote
     */
    function executeSignaledVote(bytes32 proposalId, address voter) external {
        require(_isVotable(proposalId), "not votable proposal");
        require(votesSignaled[proposalId][voter].voteDecision > 0, "wrong vote shared");
        internalVote(
            proposalId,
            voter,
            votesSignaled[proposalId][voter].voteDecision,
            votesSignaled[proposalId][voter].amount
        );
        delete votesSignaled[proposalId][voter];
        _refundVote(proposals[proposalId].organizationId);
    }

    /**
     * @dev Hash the vote data that is used for signatures
     *
     * @param votingMachine the voting machine address
     * @param proposalId id of the proposal
     * @param voter the signer of the vote
     * @param voteDecision the vote decision, NO(2) or YES(1).
     * @param amount the reputation amount to vote with, 0 will use all available REP
     */
    function hashVote(
        address votingMachine,
        bytes32 proposalId,
        address voter,
        uint256 voteDecision,
        uint256 amount
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(votingMachine, proposalId, voter, voteDecision, amount));
    }

    /**
     * @dev score return the proposal score
     * @param _proposalId the ID of the proposal
     * @return uint256 proposal score.
     */
    function score(bytes32 _proposalId) public view returns (uint256) {
        return _score(_proposalId);
    }

    /**
     * @dev execute check if the proposal has been decided, and if so, execute the proposal
     * @param _proposalId the id of the proposal
     * @return bool true - the proposal has been executed
     *              false - otherwise.
     */
    // solhint-disable-next-line function-max-lines,code-complexity
    function _execute(bytes32 _proposalId) internal votable(_proposalId) returns (bool) {
        Proposal storage proposal = proposals[_proposalId];
        Parameters memory params = parameters[proposal.paramsHash];
        Proposal memory tmpProposal = proposal;
        ExecuteFunctionParams memory executeParams;
        executeParams.totalReputation = DXDVotingMachineCallbacksInterface(proposal.callbacks).getTotalReputationSupply(
            _proposalId
        );
        //first divide by 100 to prevent overflow
        executeParams.executionBar = (executeParams.totalReputation / 100) * params.queuedVoteRequiredPercentage;
        executeParams._boostedVoteRequiredPercentage = boostedVoteRequiredPercentage[proposal.organizationId][
            proposal.paramsHash
        ];
        executeParams.boostedExecutionBar =
            (executeParams.totalReputation / 10000) *
            executeParams._boostedVoteRequiredPercentage;
        ExecutionState executionState = ExecutionState.None;
        executeParams.averageDownstakesOfBoosted;
        executeParams.confidenceThreshold;

        if (proposalVotes[_proposalId][proposal.winningVote] > executeParams.executionBar) {
            // someone crossed the absolute vote execution bar.
            if (proposal.state == ProposalState.Queued) {
                executionState = ExecutionState.QueueBarCrossed;
            } else if (proposal.state == ProposalState.PreBoosted) {
                executionState = ExecutionState.PreBoostedBarCrossed;
            } else {
                executionState = ExecutionState.BoostedBarCrossed;
            }
            proposal.state = ProposalState.Executed;
        } else {
            if (proposal.state == ProposalState.Queued) {
                // solhint-disable-next-line not-rely-on-time
                if ((block.timestamp - proposal.times[0]) >= params.queuedVotePeriodLimit) {
                    proposal.state = ProposalState.ExpiredInQueue;
                    proposal.winningVote = NO;
                    executionState = ExecutionState.QueueTimeOut;
                } else {
                    executeParams.confidenceThreshold = threshold(proposal.paramsHash, proposal.organizationId);
                    if (_score(_proposalId) > executeParams.confidenceThreshold) {
                        //change proposal mode to PreBoosted mode.
                        proposal.state = ProposalState.PreBoosted;
                        // solhint-disable-next-line not-rely-on-time
                        proposal.times[2] = block.timestamp;
                        proposal.confidenceThreshold = executeParams.confidenceThreshold;
                    }
                }
            }

            if (proposal.state == ProposalState.PreBoosted) {
                executeParams.confidenceThreshold = threshold(proposal.paramsHash, proposal.organizationId);
                // solhint-disable-next-line not-rely-on-time
                if ((block.timestamp - proposal.times[2]) >= params.preBoostedVotePeriodLimit) {
                    if (_score(_proposalId) > executeParams.confidenceThreshold) {
                        if (orgBoostedProposalsCnt[proposal.organizationId] < MAX_BOOSTED_PROPOSALS) {
                            //change proposal mode to Boosted mode.
                            proposal.state = ProposalState.Boosted;

                            // ONLY CHANGE IN DXD VOTING MACHINE TO BOOST AUTOMATICALLY
                            proposal.times[1] = proposal.times[2] + params.preBoostedVotePeriodLimit;

                            orgBoostedProposalsCnt[proposal.organizationId]++;
                            //add a value to average -> average = average + ((value - average) / nbValues)
                            executeParams.averageDownstakesOfBoosted = averagesDownstakesOfBoosted[
                                proposal.organizationId
                            ];
                            // solium-disable-next-line indentation
                            averagesDownstakesOfBoosted[proposal.organizationId] = uint256(
                                int256(executeParams.averageDownstakesOfBoosted) +
                                    ((int256(proposalStakes[_proposalId][NO]) -
                                        int256(executeParams.averageDownstakesOfBoosted)) /
                                        int256(orgBoostedProposalsCnt[proposal.organizationId]))
                            );
                        }
                    } else {
                        proposal.state = ProposalState.Queued;
                    }
                } else {
                    //check the Confidence level is stable
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
                    proposal.state = ProposalState.Executed;
                    executionState = ExecutionState.BoostedBarCrossed;
                } else {
                    proposal.state = ProposalState.ExpiredInQueue;
                    proposal.winningVote = NO;
                    executionState = ExecutionState.BoostedTimeOut;
                }
            }
        }

        if (executionState != ExecutionState.None) {
            if (
                (executionState == ExecutionState.BoostedTimeOut) ||
                (executionState == ExecutionState.BoostedBarCrossed)
            ) {
                orgBoostedProposalsCnt[tmpProposal.organizationId] = orgBoostedProposalsCnt[tmpProposal.organizationId]
                    .sub(1);
                //remove a value from average = ((average * nbValues) - value) / (nbValues - 1);
                uint256 boostedProposals = orgBoostedProposalsCnt[tmpProposal.organizationId];
                if (boostedProposals == 0) {
                    averagesDownstakesOfBoosted[proposal.organizationId] = 0;
                } else {
                    executeParams.averageDownstakesOfBoosted = averagesDownstakesOfBoosted[proposal.organizationId];
                    averagesDownstakesOfBoosted[proposal.organizationId] =
                        (
                            executeParams.averageDownstakesOfBoosted.mul(boostedProposals + 1).sub(
                                proposalStakes[_proposalId][NO]
                            )
                        ) /
                        boostedProposals;
                }
            }
            emit ExecuteProposal(
                _proposalId,
                organizations[proposal.organizationId],
                proposal.winningVote,
                executeParams.totalReputation
            );
            emit GPExecuteProposal(_proposalId, executionState);
            proposal.daoBounty = proposal.daoBountyRemain;
            ProposalExecuteInterface(proposal.callbacks).executeProposal(_proposalId, proposal.winningVote);
        }
        if (tmpProposal.state != proposal.state) {
            emit StateChange(_proposalId, proposal.state);
        }
        return (executionState != ExecutionState.None);
    }

    /**
     * @dev _score return the proposal score (Confidence level)
     * For dual choice proposal S = (S+)/(S-)
     * @param _proposalId the ID of the proposal
     * @return uint256 proposal score as real number.
     */
    function _score(bytes32 _proposalId) internal view returns (uint256) {
        //proposal.stakes[NO] cannot be zero as the dao downstake > 0 for each proposal.
        return uint216(proposalStakes[_proposalId][YES]).fraction(uint216(proposalStakes[_proposalId][NO]));
    }

    /**
     * @dev _isVotable check if the proposal is votable
     * @param _proposalId the ID of the proposal
     * @return bool true or false
     */
    function _isVotable(bytes32 _proposalId) internal view returns (bool) {
        ProposalState pState = proposals[_proposalId].state;
        return ((pState == ProposalState.PreBoosted) ||
            (pState == ProposalState.Boosted) ||
            (pState == ProposalState.QuietEndingPeriod) ||
            (pState == ProposalState.Queued));
    }

    /**
     * @dev staking function
     * @param _proposalId id of the proposal
     * @param _vote  NO(2) or YES(1).
     * @param _amount the betting amount
     * @return bool true - the proposal has been executed
     *              false - otherwise.
     */
    function _stake(
        bytes32 _proposalId,
        uint256 _vote,
        uint256 _amount,
        address _staker
    ) internal validDecision(_proposalId, _vote) returns (bool) {
        // 0 is not a valid vote.
        require(_amount > 0, "staking amount should be >0");

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
        require(stakingToken.transferFrom(_staker, address(this), amount), "fail transfer from staker");
        proposal.totalStakes = proposal.totalStakes.add(amount); //update totalRedeemableStakes
        staker.amount = staker.amount.add(amount);
        // This is to prevent average downstakes calculation overflow
        // Note that GEN cap is 100000000 ether.
        require(staker.amount <= 0x100000000000000000000000000000000, "staking amount is too high");
        require(
            proposal.totalStakes <= uint256(0x100000000000000000000000000000000).sub(proposal.daoBountyRemain),
            "total stakes is too high"
        );

        if (_vote == YES) {
            staker.amount4Bounty = staker.amount4Bounty.add(amount);
        }
        staker.vote = _vote;

        proposalStakes[_proposalId][_vote] = amount.add(proposalStakes[_proposalId][_vote]);
        emit Stake(_proposalId, organizations[proposal.organizationId], _staker, _vote, _amount);
        return _execute(_proposalId);
    }

    /**
     * @dev register a new proposal with the given parameters. Every proposal has a unique ID which is being
     * generated by calculating keccak256 of a incremented counter.
     * @param _choicesAmount the total amount of choices for the proposal
     * @param _paramsHash parameters hash
     * @param _proposer address
     * @param _organization address
     */
    function _propose(
        uint256 _choicesAmount,
        bytes32 _paramsHash,
        address _proposer,
        address _organization
    ) internal returns (bytes32) {
        require(_choicesAmount >= NUM_OF_CHOICES);
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp > parameters[_paramsHash].activationTime, "not active yet");
        //Check parameters existence.
        require(parameters[_paramsHash].queuedVoteRequiredPercentage >= 50);
        // Generate a unique ID:
        bytes32 proposalId = keccak256(abi.encodePacked(this, proposalsCnt));
        proposalsCnt = proposalsCnt.add(1);
        // Open proposal:
        Proposal memory proposal;
        proposal.callbacks = msg.sender;
        proposal.organizationId = keccak256(abi.encodePacked(msg.sender, _organization));

        proposal.state = ProposalState.Queued;
        // solhint-disable-next-line not-rely-on-time
        proposal.times[0] = block.timestamp; //submitted time
        proposal.currentBoostedVotePeriodLimit = parameters[_paramsHash].boostedVotePeriodLimit;
        proposal.proposer = _proposer;
        proposal.winningVote = NO;
        proposal.paramsHash = _paramsHash;
        if (organizations[proposal.organizationId] == address(0)) {
            if (_organization == address(0)) {
                organizations[proposal.organizationId] = msg.sender;
            } else {
                organizations[proposal.organizationId] = _organization;
            }
        }
        //calc dao bounty
        uint256 daoBounty = parameters[_paramsHash]
            .daoBountyConst
            .mul(averagesDownstakesOfBoosted[proposal.organizationId])
            .div(100);
        proposal.daoBountyRemain = daoBounty.max(parameters[_paramsHash].minimumDaoBounty);
        proposals[proposalId] = proposal;
        proposalStakes[proposalId][NO] = proposal.daoBountyRemain; //dao downstake on the proposal
        numOfChoices[proposalId] = _choicesAmount;
        emit NewProposal(proposalId, organizations[proposal.organizationId], _choicesAmount, _proposer, _paramsHash);
        return proposalId;
    }

    /**
     * @dev Refund a vote gas cost to an address
     *
     * @param organizationId the id of the organization that should do the refund
     */
    function _refundVote(bytes32 organizationId) internal {
        address orgAddress = organizations[organizationId];
        if (organizationRefunds[orgAddress].voteGas > 0) {
            uint256 gasRefund = organizationRefunds[orgAddress].voteGas.mul(
                tx.gasprice.min(organizationRefunds[orgAddress].maxGasPrice)
            );
            if (organizationRefunds[orgAddress].balance >= gasRefund) {
                organizationRefunds[orgAddress].balance = organizationRefunds[orgAddress].balance.sub(gasRefund);
                payable(msg.sender).transfer(gasRefund);
            }
        }
    }

    /**
     * @dev hashParameters returns a hash of the given parameters
     */
    function getParametersHash(
        uint256[11] memory _params, //use array here due to stack too deep issue.
        address _voteOnBehalf
    ) public pure returns (bytes32) {
        //double call to keccak256 to avoid deep stack issue when call with too many params.
        return
            keccak256(
                abi.encodePacked(
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
                            _params[8],
                            _params[9],
                            _params[10]
                        )
                    ),
                    _voteOnBehalf
                )
            );
    }

    /**
     * @dev getProposalTimes returns proposals times variables.
     * @param _proposalId id of the proposal
     * @return times times array
     */
    function getProposalTimes(bytes32 _proposalId) external view returns (uint256[3] memory times) {
        return proposals[_proposalId].times;
    }

    /**
     * @dev getProposalOrganization return the organizationId for a given proposal
     * @param _proposalId the ID of the proposal
     * @return bytes32 organization identifier
     */
    function getProposalOrganization(bytes32 _proposalId) external view returns (bytes32) {
        return (proposals[_proposalId].organizationId);
    }

    /**
     * @dev getStaker return the vote and stake amount for a given proposal and staker
     * @param _proposalId the ID of the proposal
     * @param _staker staker address
     * @return uint256 vote
     * @return uint256 amount
     */
    function getStaker(bytes32 _proposalId, address _staker) external view returns (uint256, uint256) {
        return (proposalStakers[_proposalId][_staker].vote, proposalStakers[_proposalId][_staker].amount);
    }

    /**
     * @dev getAllowedRangeOfChoices returns the allowed range of choices for a voting machine.
     * @return min - minimum number of choices
               max - maximum number of choices
     */
    function getAllowedRangeOfChoices() external pure returns (uint256 min, uint256 max) {
        return (YES, NO);
    }

    /**
     * @dev Get the required % of votes needed in a boosted proposal in a scheme
     * @param avatar the avatar address
     * @param scheme the scheme address
     * @param paramsHash the parameters configuration hashed of the scheme
     */
    function getBoostedVoteRequiredPercentage(
        address avatar,
        address scheme,
        bytes32 paramsHash
    ) external view returns (uint256) {
        return boostedVoteRequiredPercentage[keccak256(abi.encodePacked(scheme, avatar))][paramsHash];
    }

    /**
     * @dev getNumberOfChoices returns the number of choices possible in this proposal
     * @param _proposalId the proposal id
     * @return uint256 that contains number of choices
     */
    function getNumberOfChoices(bytes32 _proposalId) public view returns (uint256) {
        return numOfChoices[_proposalId];
    }

    /**
     * @dev proposalStatus return the total votes and stakes for a given proposal
     * @param _proposalId the ID of the proposal
     * @return uint256 preBoostedVotes YES
     * @return uint256 preBoostedVotes NO
     * @return uint256 total stakes YES
     * @return uint256 total stakes NO
     */
    function proposalStatus(bytes32 _proposalId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            proposalPreBoostedVotes[_proposalId][YES],
            proposalPreBoostedVotes[_proposalId][NO],
            proposalStakes[_proposalId][YES],
            proposalStakes[_proposalId][NO]
        );
    }

    /**
     * @dev proposalStatusWithVotes return the total votes, preBoostedVotes and stakes for a given proposal
     * @param _proposalId the ID of the proposal
     * @return uint256 votes YES
     * @return uint256 votes NO
     * @return uint256 preBoostedVotes YES
     * @return uint256 preBoostedVotes NO
     * @return uint256 total stakes YES
     * @return uint256 total stakes NO
     */
    function proposalStatusWithVotes(bytes32 _proposalId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            proposalVotes[_proposalId][YES],
            proposalVotes[_proposalId][NO],
            proposalPreBoostedVotes[_proposalId][YES],
            proposalPreBoostedVotes[_proposalId][NO],
            proposalStakes[_proposalId][YES],
            proposalStakes[_proposalId][NO]
        );
    }

    /**
     * @dev voteStake return the amount stakes for a given proposal and vote
     * @param _proposalId the ID of the proposal
     * @param _vote vote number
     * @return uint256 stake amount
     */
    function voteStake(bytes32 _proposalId, uint256 _vote) external view returns (uint256) {
        return proposalStakes[_proposalId][_vote];
    }

    /**
     * @dev winningVote return the winningVote for a given proposal
     * @param _proposalId the ID of the proposal
     * @return uint256 winningVote
     */
    function winningVote(bytes32 _proposalId) external view returns (uint256) {
        return proposals[_proposalId].winningVote;
    }

    /**
     * @dev state return the state for a given proposal
     * @param _proposalId the ID of the proposal
     * @return ProposalState proposal state
     */
    function state(bytes32 _proposalId) external view returns (ProposalState) {
        return proposals[_proposalId].state;
    }

    /**
     * @dev isAbstainAllow returns if the voting machine allow abstain (0)
     * @return bool true or false
     */
    function isAbstainAllow() external pure returns (bool) {
        return false;
    }
}
