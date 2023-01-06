# Solidity API

## VotingMachine

_A voting machine is used to to determine the outcome of a dao proposal.
The proposals are submitted through schemes.
Each scheme has voting parameters and a staking token balance and ETH balance.
The proposals can be executed in two final states, Queue or Boost.
A boosted proposal is a proposal that received a favorable stake on an option.
An stake is deposit done in the staking token, this adds a financial incentive
and risk on a proposal to be executed faster.
A proposal in queue needs at least 50% (or more) of votes in favour in order to
be executed.
A proposal in boost state might need a % of votes in favour in order to be executed.
If a proposal ended and it has staked tokens on it the tokens can be redeemed by
the stakers.
If a staker staked on the winning option it receives his stake plus a reward.
If a staker staked on a loosing option it lose his stake._

### ProposalState

```solidity
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
```

### ExecutionState

```solidity
enum ExecutionState {
  None,
  Failed,
  QueueBarCrossed,
  QueueTimeOut,
  PreBoostedBarCrossed,
  BoostedTimeOut,
  BoostedBarCrossed
}
```

### Parameters

```solidity
struct Parameters {
  uint256 queuedVoteRequiredPercentage;
  uint256 queuedVotePeriodLimit;
  uint256 boostedVotePeriodLimit;
  uint256 preBoostedVotePeriodLimit;
  uint256 thresholdConst;
  uint256 limitExponentValue;
  uint256 quietEndingPeriod;
  uint256 daoBounty;
  uint256 boostedVoteRequiredPercentage;
}
```

### Voter

```solidity
struct Voter {
  uint256 option;
  uint256 reputation;
  bool preBoosted;
}
```

### Staker

```solidity
struct Staker {
  uint256 option;
  uint256 amount;
}
```

### Proposal

```solidity
struct Proposal {
  bytes32 schemeId;
  address callbacks;
  enum VotingMachine.ProposalState state;
  enum VotingMachine.ExecutionState executionState;
  uint256 winningVote;
  address proposer;
  uint256 currentBoostedVotePeriodLimit;
  bytes32 paramsHash;
  uint256 daoBounty;
  uint256 totalStakes;
  uint256 secondsFromTimeOutTillExecuteBoosted;
  uint256[3] times;
}
```

### Scheme

```solidity
struct Scheme {
  address avatar;
  uint256 stakingTokenBalance;
  uint256 voteGasBalance;
  uint256 voteGas;
  uint256 maxGasPrice;
  uint256 boostedProposalsCounter;
  uint256 preBoostedProposalsCounter;
}
```

### Vote

```solidity
struct Vote {
  uint256 option;
  uint256 amount;
}
```

### NewProposal

```solidity
event NewProposal(bytes32 proposalId, address avatar, uint256 numOfOptions, address proposer, bytes32 paramsHash)
```

### ExecuteProposal

```solidity
event ExecuteProposal(bytes32 proposalId, address avatar, uint256 option, uint256 totalReputation)
```

### VoteProposal

```solidity
event VoteProposal(bytes32 proposalId, address avatar, address voter, uint256 option, uint256 reputation)
```

### Stake

```solidity
event Stake(bytes32 proposalId, address avatar, address staker, uint256 option, uint256 amount)
```

### Redeem

```solidity
event Redeem(bytes32 proposalId, address avatar, address beneficiary, uint256 amount)
```

### UnclaimedDaoBounty

```solidity
event UnclaimedDaoBounty(address avatar, address beneficiary, uint256 amount)
```

### ActionSigned

```solidity
event ActionSigned(bytes32 proposalId, address voter, uint256 option, uint256 amount, uint256 nonce, uint256 actionType, bytes signature)
```

### StateChange

```solidity
event StateChange(bytes32 proposalId, enum VotingMachine.ProposalState proposalState)
```

### ProposalExecuteResult

```solidity
event ProposalExecuteResult(string)
```

### VoteSignaled

```solidity
event VoteSignaled(bytes32 proposalId, address voter, uint256 option, uint256 amount)
```

Event used to signal votes to be executed on chain

### VotingMachine__ProposalIsNotVotable

```solidity
error VotingMachine__ProposalIsNotVotable()
```

### VotingMachine__WrongDecisionValue

```solidity
error VotingMachine__WrongDecisionValue()
```

### VotingMachine__WrongStakingToken

```solidity
error VotingMachine__WrongStakingToken()
```

### VotingMachine__SetParametersError

```solidity
error VotingMachine__SetParametersError(string)
```

### VotingMachine__WrongProposalStateToRedeem

```solidity
error VotingMachine__WrongProposalStateToRedeem()
```

Emited when proposal is not in ExecutedInQueue, ExecutedInBoost or Expired status

### VotingMachine__TransferFailed

```solidity
error VotingMachine__TransferFailed(address to, uint256 amount)
```

### VotingMachine__WrongProposalStateToRedeemDaoBounty

```solidity
error VotingMachine__WrongProposalStateToRedeemDaoBounty()
```

Emited when proposal is not in ExecutedInQueue or ExecutedInBoost status

### VotingMachine__WrongSigner

```solidity
error VotingMachine__WrongSigner()
```

### VotingMachine__InvalidNonce

```solidity
error VotingMachine__InvalidNonce()
```

### VotingMachine__OnlySchemeOrAvatarCanSetSchemeRefound

```solidity
error VotingMachine__OnlySchemeOrAvatarCanSetSchemeRefound()
```

### VotingMachine__AddressNotRegisteredInSchemeRefounds

```solidity
error VotingMachine__AddressNotRegisteredInSchemeRefounds()
```

### VotingMachine__SchemeRefundBalanceIsZero

```solidity
error VotingMachine__SchemeRefundBalanceIsZero()
```

### VotingMachine__ProposalAlreadyVoted

```solidity
error VotingMachine__ProposalAlreadyVoted()
```

### VotingMachine__VoterMustHaveReputation

```solidity
error VotingMachine__VoterMustHaveReputation()
```

### VotingMachine__NotEnoughtReputation

```solidity
error VotingMachine__NotEnoughtReputation()
```

### VotingMachine__WrongVoteShared

```solidity
error VotingMachine__WrongVoteShared()
```

### VotingMachine__StakingAmountShouldBeBiggerThanZero

```solidity
error VotingMachine__StakingAmountShouldBeBiggerThanZero()
```

### VotingMachine__TransferFromStakerFailed

```solidity
error VotingMachine__TransferFromStakerFailed()
```

### VotingMachine__StakingAmountIsTooHight

```solidity
error VotingMachine__StakingAmountIsTooHight()
```

### VotingMachine__TotalStakesIsToHight

```solidity
error VotingMachine__TotalStakesIsToHight()
```

### VotingMachine__InvalidOptionsAmount

```solidity
error VotingMachine__InvalidOptionsAmount()
```

Emited when optionsAmount is less than NUM_OF_OPTIONS

### VotingMachine__InvalidParameters

```solidity
error VotingMachine__InvalidParameters()
```

### VotingMachine__StartCannotBeBiggerThanListLength

```solidity
error VotingMachine__StartCannotBeBiggerThanListLength()
```

arg start cannot be bigger than proposals list length

### VotingMachine__EndCannotBeBiggerThanListLength

```solidity
error VotingMachine__EndCannotBeBiggerThanListLength()
```

arg end cannot be bigger than proposals list length

### VotingMachine__StartCannotBeBiggerThanEnd

```solidity
error VotingMachine__StartCannotBeBiggerThanEnd()
```

arg start cannot be bigger than end

### proposalVotes

```solidity
mapping(bytes32 => mapping(uint256 => uint256)) proposalVotes
```

proposalId   =>      option   =>    reputation

### proposalPreBoostedVotes

```solidity
mapping(bytes32 => mapping(uint256 => uint256)) proposalPreBoostedVotes
```

proposalId   =>    option   => reputation

### proposalVoters

```solidity
mapping(bytes32 => mapping(address => struct VotingMachine.Voter)) proposalVoters
```

proposalId   =>    address => voter

### proposalStakes

```solidity
mapping(bytes32 => mapping(uint256 => uint256)) proposalStakes
```

proposalId  =>    address  => stakes

### proposalStakers

```solidity
mapping(bytes32 => mapping(address => struct VotingMachine.Staker)) proposalStakers
```

proposalId    =>   address =>  staker

### parameters

```solidity
mapping(bytes32 => struct VotingMachine.Parameters) parameters
```

A mapping from hashes to parameters

### proposals

```solidity
mapping(bytes32 => struct VotingMachine.Proposal) proposals
```

Mapping from the ID of the proposal to the proposal itself.

### schemes

```solidity
mapping(bytes32 => struct VotingMachine.Scheme) schemes
```

schemeId => scheme

### activeProposals

```solidity
mapping(address => struct EnumerableSetUpgradeable.Bytes32Set) activeProposals
```

Store activeProposals for each avatar

### inactiveProposals

```solidity
mapping(address => struct EnumerableSetUpgradeable.Bytes32Set) inactiveProposals
```

Store inactiveProposals for each avatar

### NUM_OF_OPTIONS

```solidity
uint256 NUM_OF_OPTIONS
```

### NO

```solidity
uint256 NO
```

### YES

```solidity
uint256 YES
```

### proposalsCnt

```solidity
uint256 proposalsCnt
```

### stakingToken

```solidity
contract IERC20 stakingToken
```

Total number of proposals

### MAX_BOOSTED_PROPOSALS

```solidity
uint256 MAX_BOOSTED_PROPOSALS
```

### SIGNED_ACTION_HASH_EIP712

```solidity
bytes32 SIGNED_ACTION_HASH_EIP712
```

Digest describing the data the user signs according EIP 712.
Needs to match what is passed to Metamask.

### signerNonce

```solidity
mapping(address => uint256) signerNonce
```

### votesSignaled

```solidity
mapping(bytes32 => mapping(address => struct VotingMachine.Vote)) votesSignaled
```

### numOfOptions

```solidity
mapping(bytes32 => uint256) numOfOptions
```

The number of options of each proposal

### votable

```solidity
modifier votable(bytes32 proposalId)
```

_Check that the proposal is votable.
A proposal is votable if it is in one of the following states:
PreBoosted, Boosted, QuietEndingPeriod or Queued_

### validOption

```solidity
modifier validOption(bytes32 proposalId, uint256 option)
```

### constructor

```solidity
constructor(contract IERC20 stakingTokenAddress) public
```

_Constructor_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| stakingTokenAddress | contract IERC20 | ERC20 token used as staking token |

### setParameters

```solidity
function setParameters(uint256[8] params) external returns (bytes32 paramsHash)
```

_Hash the parameters, save them if necessary, and return the hash value_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| params | uint256[8] | A parameters array    params[0] - queuedVoteRequiredPercentage,    params[1] - queuedVotePeriodLimit, //the time limit for a proposal to be in an absolute voting mode.    params[2] - boostedVotePeriodLimit, //the time limit for a proposal to be in an relative voting mode.    params[3] - preBoostedVotePeriodLimit, //the time limit for a proposal to be in an preparation state (stable) before boosted.    params[4] -_thresholdConst    params[5] -_quietEndingPeriod    params[6] -_daoBounty    params[7] - boostedVoteRequiredPercentage |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| paramsHash | bytes32 | Hash of the given parameters |

### redeem

```solidity
function redeem(bytes32 proposalId, address beneficiary) external returns (uint256 reward)
```

_Redeem a reward for a successful stake, vote or proposing.
     The function use a beneficiary address as a parameter (and not msg.sender) to enable users to redeem on behalf of someone else._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The ID of the proposal |
| beneficiary | address | The beneficiary address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| reward | uint256 | The staking token reward |

### score

```solidity
function score(bytes32 proposalId) public view returns (uint256 proposalScore)
```

_Returns the proposal score (Confidence level)
For dual options proposal S = (S+)/(S-)_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The ID of the proposal |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalScore | uint256 | Proposal score as real number. |

### shouldBoost

```solidity
function shouldBoost(bytes32 proposalId) public view returns (bool shouldProposalBeBoosted)
```

_Check if a proposal should be shifted to boosted phase._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| shouldProposalBeBoosted | bool | True or false depending on whether the proposal should be boosted or not. |

### getSchemeThreshold

```solidity
function getSchemeThreshold(bytes32 paramsHash, bytes32 schemeId) public view returns (uint256 schemeThreshold)
```

_Returns the scheme's score threshold which is required by a proposal to shift to boosted state.
This threshold is dynamically set and it depend on the number of boosted proposal._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| paramsHash | bytes32 | The scheme parameters hash |
| schemeId | bytes32 | The scheme identifier |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| schemeThreshold | uint256 | Scheme's score threshold as real number. |

### calculateThreshold

```solidity
function calculateThreshold(uint256 thresholdConst, uint256 limitExponentValue, uint256 boostedProposalsCounter) public pure returns (uint256 threshold)
```

_Returns the a score threshold which is required by a proposal to shift to boosted state._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| thresholdConst | uint256 | The threshold constant to be used that increments the score exponentially |
| limitExponentValue | uint256 | The limit of the scheme boosted proposals counter |
| boostedProposalsCounter | uint256 | The amount of boosted proposals in scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| threshold | uint256 | Score threshold as real number. |

### calculateBoostChange

```solidity
function calculateBoostChange(bytes32 proposalId) public view returns (uint256 toBoost)
```

_Calculate the amount needed to boost a proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| toBoost | uint256 | Stake amount needed to boost proposal and move it to preBoost |

### stake

```solidity
function stake(bytes32 proposalId, uint256 option, uint256 amount) external returns (bool proposalExecuted)
```

_Staking function_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | id of the proposal |
| option | uint256 | NO(1) or YES(2). |
| amount | uint256 | The betting amount |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalExecuted | bool | true if the proposal was executed, false otherwise. |

### executeSignedStake

```solidity
function executeSignedStake(bytes32 proposalId, address staker, uint256 option, uint256 amount, bytes signature) external returns (bool proposalExecuted)
```

_executeSignedStake function_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | Id of the proposal |
| staker | address | Address of staker |
| option | uint256 | NO(1) or YES(2). |
| amount | uint256 | The betting amount |
| signature | bytes | Signed data by the staker |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalExecuted | bool | True if the proposal was executed, false otherwise. |

### setSchemeRefund

```solidity
function setSchemeRefund(address avatar, address scheme, uint256 voteGas, uint256 maxGasPrice) external payable
```

Allows the voting machine to receive ether to be used to refund voting costs

_Config the vote refund for each scheme_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| avatar | address | Avatar contract address |
| scheme | address | Scheme contract address to set vote refund config |
| voteGas | uint256 | The amount of gas that will be used as vote cost |
| maxGasPrice | uint256 | The maximum amount of gas price to be paid, if the gas used is higher than this value only a portion of the total gas would be refunded |

### withdrawRefundBalance

```solidity
function withdrawRefundBalance(address scheme) external
```

_Withdraw scheme refund balance_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| scheme | address | Scheme contract address to withdraw refund balance from |

### vote

```solidity
function vote(bytes32 proposalId, uint256 option, uint256 amount) external returns (bool proposalExecuted)
```

_Voting function from old voting machine changing only the logic to refund vote after vote done_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | id of the proposal |
| option | uint256 | NO(1) or YES(2). |
| amount | uint256 | The reputation amount to vote with, 0 will use all available REP |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalExecuted | bool | True if the proposal was executed, false otherwise. |

### execute

```solidity
function execute(bytes32 proposalId) external returns (bool proposalExecuted)
```

_Check if the proposal has been decided, and if so, execute the proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalExecuted | bool | True if the proposal was executed, false otherwise. |

### shareSignedAction

```solidity
function shareSignedAction(bytes32 proposalId, address voter, uint256 option, uint256 amount, uint256 nonce, uint256 actionType, bytes signature) external
```

_Share the vote of a proposal for a voting machine on a event log_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | id of the proposal |
| voter | address | Address of voter |
| option | uint256 | The vote option, NO(1) or YES(2). |
| amount | uint256 | The reputation amount to vote with, 0 will use all available REP |
| nonce | uint256 | Nonce value ,it is part of the signature to ensure that a signature can be received only once. |
| actionType | uint256 | 1=vote, 2=stake |
| signature | bytes | The encoded vote signature |

### signalVote

```solidity
function signalVote(bytes32 proposalId, uint256 option, uint256 amount) external
```

_Signal the vote of a proposal in this voting machine to be executed later_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | Id of the proposal to vote |
| option | uint256 | The vote option, NO(1) or YES(2). |
| amount | uint256 | The reputation amount to vote with, 0 will use all available REP |

### executeSignedVote

```solidity
function executeSignedVote(bytes32 proposalId, address voter, uint256 option, uint256 amount, bytes signature) external
```

_Execute a signed vote_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | Id of the proposal to execute the vote on |
| voter | address | The signer of the vote |
| option | uint256 | The vote option, NO(1) or YES(2). |
| amount | uint256 | The reputation amount to vote with, 0 will use all available REP |
| signature | bytes | The signature of the hashed vote |

### propose

```solidity
function propose(uint256 totalOptions, bytes32 paramsHash, address proposer, address avatar) external returns (bytes32 proposalId)
```

_Register a new proposal with the given parameters. Every proposal has a unique ID which is being generated by calculating keccak256 of a incremented counter._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalOptions | uint256 | The amount of options to be voted on |
| paramsHash | bytes32 | parameters hash |
| proposer | address | address |
| avatar | address | address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | ID of the new proposal registered |

### _vote

```solidity
function _vote(bytes32 proposalId, address voter, uint256 option, uint256 repAmount) internal returns (bool proposalExecuted)
```

_Vote for a proposal, if the voter already voted, cancel the last vote and set a new one instead_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | id of the proposal |
| voter | address | used in case the vote is cast for someone else |
| option | uint256 | a value between 0 to and the proposal's number of options. |
| repAmount | uint256 | how many reputation the voter would like to stake for this vote. if  _rep==0 the voter full reputation will be use. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalExecuted | bool | true if the proposal was executed, false otherwise. Throws if proposal is not open or if it has been executed NB: executes the proposal if a decision has been reached |

### executeSignaledVote

```solidity
function executeSignaledVote(bytes32 proposalId, address voter) external
```

_Execute a signaled vote on a votable proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | id of the proposal to vote |
| voter | address | The signer of the vote |

### _execute

```solidity
function _execute(bytes32 proposalId) internal returns (bool proposalExecuted)
```

_Check if the proposal has been decided, and if so, execute the proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalExecuted | bool | True if the proposal was executed, false otherwise. |

### isVotable

```solidity
function isVotable(bytes32 proposalId) public view returns (bool isProposalVotable)
```

_Check if the proposal is votable_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The ID of the proposal |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| isProposalVotable | bool | True or false depending on whether the proposal is voteable |

### _stake

```solidity
function _stake(bytes32 proposalId, uint256 option, uint256 amount, address staker) internal returns (bool proposalExecuted)
```

_staking function_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | id of the proposal |
| option | uint256 | NO(1) or YES(2). |
| amount | uint256 | The betting amount |
| staker | address | Address of the staker |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalExecuted | bool | True if the proposal was executed, false otherwise. |

### _propose

```solidity
function _propose(uint256 optionsAmount, bytes32 paramsHash, address proposer, address avatar) internal returns (bytes32 proposalId)
```

_Register a new proposal with the given parameters. Every proposal has a unique ID which is being generated by calculating keccak256 of a incremented counter._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| optionsAmount | uint256 | the total amount of options for the proposal |
| paramsHash | bytes32 | parameters hash |
| proposer | address | Proposer address |
| avatar | address | Avatar address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | ID of the new proposal registered |

### _refundVote

```solidity
function _refundVote(bytes32 schemeId) internal
```

_Refund a vote gas cost to an address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| schemeId | bytes32 | The id of the scheme that should do the refund |

### getParametersHash

```solidity
function getParametersHash(uint256[8] params) public pure returns (bytes32 paramsHash)
```

_Returns a hash of the given parameters_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| params | uint256[8] | Array of params (8) to hash |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| paramsHash | bytes32 | Hash of the given parameters |

### hashAction

```solidity
function hashAction(bytes32 proposalId, address signer, uint256 option, uint256 amount, uint256 nonce, uint256 actionType) public view returns (bytes32 actionHash)
```

_Hash the vote data that is used for signatures_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | id of the proposal |
| signer | address | The signer of the vote |
| option | uint256 | The vote option, NO(1) or YES(2). |
| amount | uint256 | The reputation amount to vote with, 0 will use all available REP |
| nonce | uint256 | Nonce value, it is part of the signature to ensure that a signature can be received only once. |
| actionType | uint256 | The governance action type to hash |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| actionHash | bytes32 | Hash of the action |

### getVoter

```solidity
function getVoter(bytes32 proposalId, address voter) external view returns (uint256 option, uint256 amount)
```

_Returns the vote and the amount of reputation of the user committed to this proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | the ID of the proposal |
| voter | address | The address of the voter |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| option | uint256 | The option voted |
| amount | uint256 | The amount of rep used in the vote |

### getStaker

```solidity
function getStaker(bytes32 proposalId, address staker) external view returns (uint256 option, uint256 amount)
```

_Returns the vote and stake amount for a given proposal and staker_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The ID of the proposal |
| staker | address | Staker address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| option | uint256 | Staked option |
| amount | uint256 | Staked amount |

### getAllowedRangeOfOptions

```solidity
function getAllowedRangeOfOptions() external pure returns (uint256 min, uint256 max)
```

_Returns the allowed range of options for a voting machine._

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| min | uint256 | minimum number of options |
| max | uint256 | maximum number of options |

### getNumberOfOptions

```solidity
function getNumberOfOptions(bytes32 proposalId) public view returns (uint256 proposalOptionsAmount)
```

_Returns the number of options possible in this proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The proposal id |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalOptionsAmount | uint256 | Number of options for given proposal |

### getProposalStatus

```solidity
function getProposalStatus(bytes32 proposalId) external view returns (uint256 votesNo, uint256 votesYes, uint256 preBoostedVotesNo, uint256 preBoostedVotesYes, uint256 totalStakesNo, uint256 totalStakesYes)
```

_Returns the total votes, preBoostedVotes and stakes for a given proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The ID of the proposal |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| votesNo | uint256 | Proposal votes NO |
| votesYes | uint256 | Proposal votes YES |
| preBoostedVotesNo | uint256 | Proposal pre boosted votes NO |
| preBoostedVotesYes | uint256 | Proposal pre boosted votes YES |
| totalStakesNo | uint256 | Proposal total stakes NO |
| totalStakesYes | uint256 | Proposal total stakes YES |

### getProposalAvatar

```solidity
function getProposalAvatar(bytes32 proposalId) public view returns (address avatarAddress)
```

_Returns the Avatar address for a given proposalId_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | ID of the proposal |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| avatarAddress | address | Avatar address |

### _getProposalsBatchRequest

```solidity
function _getProposalsBatchRequest(uint256 start, uint256 end, struct EnumerableSetUpgradeable.Bytes32Set proposalsSet) internal view returns (bytes32[] proposalsArray)
```

_Returns array of proposal ids based on index args. Both indexes are inclusive, unles (0,0) that returns all elements_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| start | uint256 | index to start batching (included). |
| end | uint256 | last index of batch (included). Zero will default to last element from the list |
| proposalsSet | struct EnumerableSetUpgradeable.Bytes32Set | EnumerableSetUpgradeable set of proposal ids |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalsArray | bytes32[] | with proposals list. |

### getActiveProposals

```solidity
function getActiveProposals(uint256 start, uint256 end, address avatar) external view returns (bytes32[] activeProposalsArray)
```

_Returns array of active proposal ids_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| start | uint256 | The index to start batching (included). |
| end | uint256 | The last index of batch (included). Zero will return all |
| avatar | address | The avatar address to get active proposals from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeProposalsArray | bytes32[] | List of active proposal ids |

### getInactiveProposals

```solidity
function getInactiveProposals(uint256 start, uint256 end, address avatar) external view returns (bytes32[] inactiveProposalsArray)
```

_Returns array of inactive proposal ids_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| start | uint256 | The index to start batching (included). |
| end | uint256 | The last index of batch (included). Zero will return all |
| avatar | address | The avatar address to get active proposals from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| inactiveProposalsArray | bytes32[] | List of inactive proposal ids |

### getActiveProposalsCount

```solidity
function getActiveProposalsCount(address avatar) public view returns (uint256 activeProposalsCount)
```

_Returns the amount of active proposals_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| avatar | address | The avatar address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeProposalsCount | uint256 | The total count of active proposals for given avatar address |

### getInactiveProposalsCount

```solidity
function getInactiveProposalsCount(address avatar) public view returns (uint256 inactiveProposalsCount)
```

_Returns the amount of inactive proposals_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| avatar | address | The avatar address |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| inactiveProposalsCount | uint256 | The total count of active proposals for given avatar address |

### multiplyRealMath

```solidity
function multiplyRealMath(uint256 a, uint256 b) public pure returns (uint256)
```

_Helper function used in test to execute a real math lib multiplication_

