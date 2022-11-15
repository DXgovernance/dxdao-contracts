// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import {RealMath} from "../../utils/RealMath.sol";
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
 *  - Payable Votes: Any dao can send funds and configure the gas and maxGasPrice to be refunded per vote to each scheme it has registered
 *  - Signed Votes: Votes can be signed for this or any voting machine, they can be shared on this voting machine and
 *    execute votes signed for this voting machine.
 *  - Signal Votes: Voters can signal their decisions with near 50k gas, the signaled votes can be executed on
 *    chain by anyone.
 */
contract DXDVotingMachine {
    using ECDSA for bytes32;
    using Math for uint256;
    using RealMath for uint216;
    using RealMath for uint256;
    using Address for address;

    enum ProposalState {
        None,
        ExpiredInQueue,
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

    //Scheme's parameters
    struct Parameters {
        uint256 queuedVoteRequiredPercentage; // the absolute vote percentages bar. 5000 = 50%
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
        uint256 minimumDaoBounty;
        uint256 daoBountyConst; //The DAO downstake for each proposal is calculate according to the formula
        //(daoBountyConst * averageBoostDownstakes)/100 .
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
        uint256 amount; // amount of staker's stake
        uint256 amount4Bounty; // amount of staker's stake used for bounty reward calculation.
    }

    struct Proposal {
        bytes32 schemeId; // the scheme unique identifier the proposal is target to.
        address callbacks; // should fulfill voting callbacks interface.
        ProposalState state;
        ExecutionState executionState;
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

    event RedeemReputation(
        bytes32 indexed _proposalId,
        address indexed _avatar,
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
    event ExpirationCallBounty(bytes32 indexed _proposalId, address indexed _beneficiary, uint256 _amount);
    event ConfidenceLevelChange(bytes32 indexed _proposalId, uint256 _confidenceThreshold);
    event ProposalExecuteResult(string);

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

    //schemeId => scheme
    mapping(bytes32 => Scheme) public schemes;

    uint256 public constant NUM_OF_CHOICES = 2;
    uint256 public constant NO = 1;
    uint256 public constant YES = 2;
    uint256 public proposalsCnt; // Total number of proposals
    IERC20 public stakingToken;
    uint256 private constant MAX_BOOSTED_PROPOSALS = 4096;

    // Digest describing the data the user signs according EIP 712.
    // Needs to match what is passed to Metamask.
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

    mapping(address => uint256) public stakesNonce; //stakes Nonce

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
        require(address(_stakingToken) != address(0), "wrong _stakingToken");
        stakingToken = IERC20(_stakingToken);
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
     *    _params[7] -_minimumDaoBounty
     *    _params[8] -_daoBountyConst
     *    _params[9] - _boostedVoteRequiredPercentage
     */
    function setParameters(
        uint256[10] calldata _params //use array here due to stack too deep issue.
    ) external returns (bytes32) {
        require(_params[0] <= 10000 && _params[0] >= 5000, "5000 <= queuedVoteRequiredPercentage <= 10000");
        require(_params[4] <= 16000 && _params[4] > 1000, "1000 < thresholdConst <= 16000");
        require(_params[2] >= _params[5], "boostedVotePeriodLimit >= quietEndingPeriod");
        require(_params[7] > 0, "minimumDaoBounty should be > 0");
        require(_params[8] > 0, "daoBountyConst should be > 0");
        require(
            _params[0] > _params[9],
            "queuedVoteRequiredPercentage should eb higher than boostedVoteRequiredPercentage"
        );

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
            proposingRepReward: _params[6],
            minimumDaoBounty: _params[7],
            daoBountyConst: _params[8],
            boostedVoteRequiredPercentage: _params[9]
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
     *           [1] proposerReputationReward
     */
    // solhint-disable-next-line function-max-lines,code-complexity
    function redeem(bytes32 _proposalId, address _beneficiary) public returns (uint256[3] memory rewards) {
        Proposal storage proposal = proposals[_proposalId];
        require(
            (proposal.state == ProposalState.ExecutedInQueue) ||
                (proposal.state == ProposalState.ExecutedInBoost) ||
                (proposal.state == ProposalState.ExpiredInQueue),
            "Proposal should be ExecutedInQueue, ExecutedInBoost or ExpiredInQueue"
        );
        Parameters memory params = parameters[proposal.paramsHash];
        //as staker
        Staker storage staker = proposalStakers[_proposalId][_beneficiary];
        uint256 totalWinningStakes = proposalStakes[_proposalId][proposal.winningVote];
        uint256 totalStakesLeftAfterCallBounty = proposalStakes[_proposalId][NO] +
            proposalStakes[_proposalId][YES] -
            calcExecuteCallBounty(_proposalId);
        if (staker.amount > 0) {
            if (proposal.state == ProposalState.ExpiredInQueue) {
                //Stakes of a proposal that expires in Queue are sent back to stakers
                rewards[0] = staker.amount;
            } else if (staker.vote == proposal.winningVote) {
                if (staker.vote == YES) {
                    if (proposal.daoBounty < totalStakesLeftAfterCallBounty) {
                        uint256 _totalStakes = totalStakesLeftAfterCallBounty - proposal.daoBounty;
                        rewards[0] = (staker.amount * _totalStakes) / totalWinningStakes;
                    }
                } else {
                    rewards[0] = (staker.amount * totalStakesLeftAfterCallBounty) / totalWinningStakes;
                }
            }
            staker.amount = 0;
        }
        //dao redeem its winnings
        if (
            proposal.daoRedeemItsWinnings == false &&
            _beneficiary == schemes[proposal.schemeId].avatar &&
            proposal.state != ProposalState.ExpiredInQueue &&
            proposal.winningVote == NO
        ) {
            rewards[0] =
                rewards[0] +
                ((proposal.daoBounty * totalStakesLeftAfterCallBounty) / totalWinningStakes) -
                proposal.daoBounty;
            proposal.daoRedeemItsWinnings = true;
        }

        //as proposer
        if ((proposal.proposer == _beneficiary) && (proposal.winningVote == YES) && (proposal.proposer != address(0))) {
            rewards[1] = params.proposingRepReward;
            proposal.proposer = address(0);
        }
        if (rewards[0] != 0) {
            proposal.totalStakes = proposal.totalStakes - rewards[0];
            schemes[proposal.schemeId].stakingTokenBalance =
                schemes[proposal.schemeId].stakingTokenBalance -
                rewards[0];
            require(stakingToken.transfer(_beneficiary, rewards[0]), "transfer to beneficiary failed");
            emit Redeem(_proposalId, schemes[proposal.schemeId].avatar, _beneficiary, rewards[0]);
        }
        if (rewards[1] > 0) {
            DXDVotingMachineCallbacksInterface(proposal.callbacks).mintReputation(
                rewards[1],
                _beneficiary,
                _proposalId
            );
            emit RedeemReputation(_proposalId, schemes[proposal.schemeId].avatar, _beneficiary, rewards[1]);
        }
    }

    /**
     * @dev redeemDaoBounty a reward for a successful stake.
     * The function use a beneficiary address as a parameter (and not msg.sender) to enable
     * users to redeem on behalf of someone else.
     * @param _proposalId the ID of the proposal
     * @param _beneficiary - the beneficiary address
     * @return redeemedAmount - redeem token amount
     * @return potentialAmount - potential redeem token amount(if there is enough tokens bounty at the dao owner of the scheme )
     */
    function redeemDaoBounty(bytes32 _proposalId, address _beneficiary)
        public
        returns (uint256 redeemedAmount, uint256 potentialAmount)
    {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.state == ProposalState.ExecutedInQueue || proposal.state == ProposalState.ExecutedInBoost);
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
            require(stakingToken.transfer(_beneficiary, potentialAmount), "fail transfer of daoBounty");
            redeemedAmount = potentialAmount;
            emit RedeemDaoBounty(_proposalId, schemes[proposal.schemeId].avatar, _beneficiary, redeemedAmount);
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
        return (rewardSeconds * proposalStakes[_proposalId][YES]) / (maxRewardSeconds * 10);
    }

    /**
     * @dev shouldBoost check if a proposal should be shifted to boosted phase.
     * @param _proposalId the ID of the proposal
     * @return bool true or false.
     */
    function shouldBoost(bytes32 _proposalId) public view returns (bool) {
        Proposal memory proposal = proposals[_proposalId];
        return (_score(_proposalId) > threshold(proposal.paramsHash, proposal.schemeId));
    }

    /**
     * @dev threshold return the scheme's score threshold which required by
     * a proposal to shift to boosted state.
     * This threshold is dynamically set and it depend on the number of boosted proposal.
     * @param _schemeId the scheme identifier
     * @param _paramsHash the scheme parameters hash
     * @return uint256 scheme's score threshold as real number.
     */
    function threshold(bytes32 _paramsHash, bytes32 _schemeId) public view returns (uint256) {
        uint256 power = schemes[_schemeId].orgBoostedProposalsCnt;
        Parameters storage params = parameters[_paramsHash];

        if (power > params.limitExponentValue) {
            power = params.limitExponentValue;
        }

        return params.thresholdConst**power;
    }

    /**
     * @dev staking function
     * @param _proposalId id of the proposal
     * @param _vote  NO(1) or YES(2).
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
     * @param proposalId id of the proposal
     * @param staker address of staker
     * @param stakeDecision  NO(1) or YES(2).
     * @param amount the betting amount
     * @param nonce nonce value ,it is part of the signature to ensure that
        a signature can be received only once.
     * @param signature  - signed data by the staker
     * @return bool true - the proposal has been executed
     *              false - otherwise.
     */
    function stakeWithSignature(
        bytes32 proposalId,
        address staker,
        uint256 stakeDecision,
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external returns (bool) {
        bytes32 stakeHashed = keccak256(
            abi.encodePacked(
                SIGNED_ACTION_HASH_EIP712,
                keccak256(abi.encodePacked(address(this), proposalId, staker, stakeDecision, amount, nonce, "stake"))
            )
        );
        address staker = stakeHashed.recover(signature);
        require(stakesNonce[staker] == nonce);
        stakesNonce[staker] = stakesNonce[staker] + 1;
        return _stake(proposalId, stakeDecision, amount, staker);
    }

    /**
     * @dev Config the vote refund for each scheme
     * Allows the voting machine to receive ether to be used to refund voting costs
     * @param _voteGas the amount of gas that will be used as vote cost
     * @param _maxGasPrice the maximum amount of gas price to be paid, if the gas used is higher than this value only a
     * portion of the total gas would be refunded
     */
    function setSchemeRefund(
        address avatar,
        address scheme,
        uint256 _voteGas,
        uint256 _maxGasPrice
    ) external payable {
        bytes32 schemeId;
        if (msg.sender == scheme) {
            schemeId = keccak256(abi.encodePacked(msg.sender, avatar));
        } else if (msg.sender == avatar) {
            schemeId = keccak256(abi.encodePacked(scheme, msg.sender));
        }
        require(schemeId != bytes32(0), "DXDVotingMachine: Only scheme or avatar can set scheme refund");
        schemes[schemeId].voteGasBalance = schemes[schemeId].voteGasBalance + msg.value;
        schemes[schemeId].voteGas = _voteGas;
        schemes[schemeId].maxGasPrice = _maxGasPrice;
    }

    /**
     * @dev Withdraw scheme refund balance
     */
    function withdrawRefundBalance(address scheme) public {
        bytes32 schemeId = keccak256(abi.encodePacked(msg.sender, scheme));
        require(schemes[schemeId].voteGas > 0, "DXDVotingMachine: Address not registered in scheme refounds");
        require(schemes[schemeId].voteGasBalance > 0, "DXDVotingMachine: Scheme refund balance is zero");
        uint256 voteGasBalance = schemes[schemeId].voteGasBalance;
        schemes[schemeId].voteGasBalance = 0;
        payable(msg.sender).transfer(voteGasBalance);
    }

    /**
     * @dev voting function from old voting machine changing only the logic to refund vote after vote done
     *
     * @param _proposalId id of the proposal
     * @param _vote NO(1) or YES(2).
     * @param _amount the reputation amount to vote with, 0 will use all available REP
     * @return bool if the proposal has been executed or not
     */
    function vote(
        bytes32 _proposalId,
        uint256 _vote,
        uint256 _amount
    ) external votable(_proposalId) returns (bool) {
        Proposal storage proposal = proposals[_proposalId];
        bool voteResult = internalVote(_proposalId, msg.sender, _vote, _amount);
        _refundVote(proposal.schemeId);
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
     * @param voteDecision the vote decision, NO(1) or YES(2).
     * @param amount the reputation amount to vote with, 0 will use all available REP
     * @param nonce nonce value ,it is part of the signature to ensure that
        a signature can be received only once.
     * @param signature the encoded vote signature
     */
    function shareSignedVote(
        address votingMachine,
        bytes32 proposalId,
        address voter,
        uint256 voteDecision,
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external validDecision(proposalId, voteDecision) {
        bytes32 voteHashed = keccak256(
            abi.encodePacked(
                SIGNED_ACTION_HASH_EIP712,
                keccak256(abi.encodePacked(address(this), proposalId, voter, voteDecision, amount, nonce, "stake"))
            )
        );
        require(voter == voteHashed.recover(signature), "wrong signer");
        emit VoteSigned(votingMachine, proposalId, voter, voteDecision, amount, signature);
    }

    /**
     * @dev Signal the vote of a proposal in this voting machine to be executed later
     *
     * @param proposalId id of the proposal to vote
     * @param voteDecision the vote decisions, NO(1) or YES(2).
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
     * @param voteDecision the vote decision, NO(1) or YES(2).
     * @param amount the reputation amount to vote with, 0 will use all available REP
     * @param nonce nonce value ,it is part of the signature to ensure that
        a signature can be received only once.
     * @param signature the signature of the hashed vote
     */
    function executeSignedVote(
        address votingMachine,
        bytes32 proposalId,
        address voter,
        uint256 voteDecision,
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external {
        require(votingMachine == address(this), "wrong votingMachine");
        require(_isVotable(proposalId), "not votable proposal");
        bytes32 voteHashed = keccak256(
            abi.encodePacked(
                SIGNED_ACTION_HASH_EIP712,
                keccak256(abi.encodePacked(address(this), proposalId, voter, voteDecision, amount, nonce, "vote"))
            )
        );
        require(voter == voteHashed.recover(signature), "wrong signer");
        internalVote(proposalId, voter, voteDecision, amount);
        _refundVote(proposals[proposalId].schemeId);
    }

    /**
     * @dev register a new proposal with the given parameters. Every proposal has a unique ID which is being
     * generated by calculating keccak256 of a incremented counter.
     * @param _paramsHash parameters hash
     * @param _proposer address
     * @param _avatar address
     */
    function propose(
        uint256,
        bytes32 _paramsHash,
        address _proposer,
        address _avatar
    ) external returns (bytes32) {
        return _propose(NUM_OF_CHOICES, _paramsHash, _proposer, _avatar);
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
        proposalVotes[_proposalId][_vote] = rep + proposalVotes[_proposalId][_vote];
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
            proposalPreBoostedVotes[_proposalId][_vote] = rep + proposalPreBoostedVotes[_proposalId][_vote];
        }
        emit VoteProposal(_proposalId, schemes[proposal.schemeId].avatar, _voter, _vote, rep);
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
        _refundVote(proposals[proposalId].schemeId);
    }

    /**
     * @dev Hash the vote data that is used for signatures
     *
     * @param votingMachine the voting machine address
     * @param proposalId id of the proposal
     * @param voter the signer of the vote
     * @param voteDecision the vote decision, NO(1) or YES(2).
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
        //first divide by 10000 to prevent overflow
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
                    proposal.state = ProposalState.ExpiredInQueue;
                    proposal.winningVote = NO;
                    proposal.executionState = ExecutionState.QueueTimeOut;
                } else {
                    executeParams.confidenceThreshold = threshold(proposal.paramsHash, proposal.schemeId);
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
                executeParams.confidenceThreshold = threshold(proposal.paramsHash, proposal.schemeId);
                // solhint-disable-next-line not-rely-on-time
                if ((block.timestamp - proposal.times[2]) >= params.preBoostedVotePeriodLimit) {
                    if (_score(_proposalId) > executeParams.confidenceThreshold) {
                        if (schemes[proposal.schemeId].orgBoostedProposalsCnt < MAX_BOOSTED_PROPOSALS) {
                            //change proposal mode to Boosted mode.
                            proposal.state = ProposalState.Boosted;

                            // ONLY CHANGE IN DXD VOTING MACHINE TO BOOST AUTOMATICALLY
                            proposal.times[1] = proposal.times[2] + params.preBoostedVotePeriodLimit;

                            schemes[proposal.schemeId].orgBoostedProposalsCnt++;
                            //add a value to average -> average = average + ((value - average) / nbValues)
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
                    proposal.state = ProposalState.ExecutedInBoost;
                    proposal.executionState = ExecutionState.BoostedBarCrossed;
                } else {
                    proposal.state = ProposalState.ExpiredInQueue;
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
                //remove a value from average = ((average * nbValues) - value) / (nbValues - 1);
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
        return (proposal.executionState != ExecutionState.None || proposal.executionState != ExecutionState.Failed);
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
     * @param _vote  NO(1) or YES(2).
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
        schemes[proposal.schemeId].stakingTokenBalance += amount;
        proposal.totalStakes = proposal.totalStakes + amount; //update totalRedeemableStakes
        staker.amount = staker.amount + amount;
        // This is to prevent average downstakes calculation overflow
        // Note that GEN cap is 100000000 ether.
        require(staker.amount <= 0x100000000000000000000000000000000, "staking amount is too high");
        require(
            proposal.totalStakes <= uint256(0x100000000000000000000000000000000) - proposal.daoBountyRemain,
            "total stakes is too high"
        );

        if (_vote == YES) {
            staker.amount4Bounty = staker.amount4Bounty + amount;
        }
        staker.vote = _vote;

        proposalStakes[_proposalId][_vote] = amount + proposalStakes[_proposalId][_vote];
        emit Stake(_proposalId, schemes[proposal.schemeId].avatar, _staker, _vote, _amount);
        return _execute(_proposalId);
    }

    /**
     * @dev register a new proposal with the given parameters. Every proposal has a unique ID which is being
     * generated by calculating keccak256 of a incremented counter.
     * @param _choicesAmount the total amount of choices for the proposal
     * @param _paramsHash parameters hash
     * @param _proposer address
     * @param _avatar address
     */
    function _propose(
        uint256 _choicesAmount,
        bytes32 _paramsHash,
        address _proposer,
        address _avatar
    ) internal returns (bytes32) {
        require(_choicesAmount >= NUM_OF_CHOICES);
        //Check parameters existence.
        require(parameters[_paramsHash].queuedVoteRequiredPercentage >= 5000);
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
        //calc dao bounty
        uint256 daoBounty = (parameters[_paramsHash].daoBountyConst *
            schemes[proposal.schemeId].averagesDownstakesOfBoosted) / 100;
        proposal.daoBountyRemain = daoBounty.max(parameters[_paramsHash].minimumDaoBounty);
        proposals[proposalId] = proposal;
        proposalStakes[proposalId][NO] = proposal.daoBountyRemain; //dao downstake on the proposal
        numOfChoices[proposalId] = _choicesAmount;
        emit NewProposal(proposalId, schemes[proposal.schemeId].avatar, _choicesAmount, _proposer, _paramsHash);
        return proposalId;
    }

    /**
     * @dev Refund a vote gas cost to an address
     *
     * @param schemeId the id of the scheme that should do the refund
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
     * @dev hashParameters returns a hash of the given parameters
     */
    function getParametersHash(
        uint256[10] memory _params //use array here due to stack too deep issue.
    ) public pure returns (bytes32) {
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
                    _params[8],
                    _params[9]
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
     * @dev getProposalScheme return the schemeId for a given proposal
     * @param _proposalId the ID of the proposal
     * @return bytes32 scheme identifier
     */
    function getProposalScheme(bytes32 _proposalId) external view returns (bytes32) {
        return (proposals[_proposalId].schemeId);
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
        return (NO, YES);
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
            proposalPreBoostedVotes[_proposalId][NO],
            proposalPreBoostedVotes[_proposalId][YES],
            proposalStakes[_proposalId][NO],
            proposalStakes[_proposalId][YES]
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
            proposalVotes[_proposalId][NO],
            proposalVotes[_proposalId][YES],
            proposalPreBoostedVotes[_proposalId][NO],
            proposalPreBoostedVotes[_proposalId][YES],
            proposalStakes[_proposalId][NO],
            proposalStakes[_proposalId][YES]
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
