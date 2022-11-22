# Solidity API

## DXDVotingMachine

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
If a staker staked on the winning option it receives a reward.
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
  uint256 proposingRepReward;
  uint256 minimumDaoBounty;
  uint256 daoBountyConst;
  uint256 boostedVoteRequiredPercentage;
}

```

### Voter

```solidity
struct Voter {
  uint256 vote;
  uint256 reputation;
  bool preBoosted;
}

```

### Staker

```solidity
struct Staker {
  uint256 vote;
  uint256 amount;
  uint256 amount4Bounty;
}

```

### Proposal

```solidity
struct Proposal {
  bytes32 schemeId;
  address callbacks;
  enum DXDVotingMachine.ProposalState state;
  enum DXDVotingMachine.ExecutionState executionState;
  uint256 winningVote;
  address proposer;
  uint256 currentBoostedVotePeriodLimit;
  bytes32 paramsHash;
  uint256 daoBountyRemain;
  uint256 daoBounty;
  uint256 totalStakes;
  uint256 confidenceThreshold;
  uint256 secondsFromTimeOutTillExecuteBoosted;
  uint256[3] times;
  bool daoRedeemItsWinnings;
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
  uint256 averagesDownstakesOfBoosted;
  uint256 orgBoostedProposalsCnt;
}

```

### VoteDecision

```solidity
struct VoteDecision {
  uint256 voteDecision;
  uint256 amount;
}

```

### ExecuteFunctionParams

```solidity
struct ExecuteFunctionParams {
  uint256 totalReputation;
  uint256 executionBar;
  uint256 boostedExecutionBar;
  uint256 averageDownstakesOfBoosted;
  uint256 confidenceThreshold;
}

```

### NewProposal

```solidity
event NewProposal(bytes32 _proposalId, address _avatar, uint256 _numOfChoices, address _proposer, bytes32 _paramsHash)
```

### ExecuteProposal

```solidity
event ExecuteProposal(bytes32 _proposalId, address _avatar, uint256 _decision, uint256 _totalReputation)
```

### VoteProposal

```solidity
event VoteProposal(bytes32 _proposalId, address _avatar, address _voter, uint256 _vote, uint256 _reputation)
```

### CancelProposal

```solidity
event CancelProposal(bytes32 _proposalId, address _avatar)
```

### CancelVoting

```solidity
event CancelVoting(bytes32 _proposalId, address _avatar, address _voter)
```

### Stake

```solidity
event Stake(bytes32 _proposalId, address _avatar, address _staker, uint256 _vote, uint256 _amount)
```

### Redeem

```solidity
event Redeem(bytes32 _proposalId, address _avatar, address _beneficiary, uint256 _amount)
```

### RedeemDaoBounty

```solidity
event RedeemDaoBounty(bytes32 _proposalId, address _avatar, address _beneficiary, uint256 _amount)
```

### RedeemReputation

```solidity
event RedeemReputation(bytes32 _proposalId, address _avatar, address _beneficiary, uint256 _amount)
```

### ActionSigned

```solidity
event ActionSigned(bytes32 proposalId, address voter, uint256 voteDecision, uint256 amount, uint256 nonce, uint256 actionType, bytes signature)
```

### StateChange

```solidity
event StateChange(bytes32 _proposalId, enum DXDVotingMachine.ProposalState _proposalState)
```

### ExpirationCallBounty

```solidity
event ExpirationCallBounty(bytes32 _proposalId, address _beneficiary, uint256 _amount)
```

### ConfidenceLevelChange

```solidity
event ConfidenceLevelChange(bytes32 _proposalId, uint256 _confidenceThreshold)
```

### ProposalExecuteResult

```solidity
event ProposalExecuteResult(string)
```

### VoteSignaled

```solidity
event VoteSignaled(bytes32 proposalId, address voter, uint256 voteDecision, uint256 amount)
```

### proposalVotes

```solidity
mapping(bytes32 => mapping(uint256 => uint256)) proposalVotes
```

### proposalPreBoostedVotes

```solidity
mapping(bytes32 => mapping(uint256 => uint256)) proposalPreBoostedVotes
```

### proposalVoters

```solidity
mapping(bytes32 => mapping(address => struct DXDVotingMachine.Voter)) proposalVoters
```

### proposalStakes

```solidity
mapping(bytes32 => mapping(uint256 => uint256)) proposalStakes
```

### proposalStakers

```solidity
mapping(bytes32 => mapping(address => struct DXDVotingMachine.Staker)) proposalStakers
```

### parameters

```solidity
mapping(bytes32 => struct DXDVotingMachine.Parameters) parameters
```

### proposals

```solidity
mapping(bytes32 => struct DXDVotingMachine.Proposal) proposals
```

### schemes

```solidity
mapping(bytes32 => struct DXDVotingMachine.Scheme) schemes
```

### NUM_OF_CHOICES

```solidity
uint256 NUM_OF_CHOICES
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

### MAX_BOOSTED_PROPOSALS

```solidity
uint256 MAX_BOOSTED_PROPOSALS
```

### SIGNED_ACTION_HASH_EIP712

```solidity
bytes32 SIGNED_ACTION_HASH_EIP712
```

### stakesNonce

```solidity
mapping(address => uint256) stakesNonce
```

### votesSignaled

```solidity
mapping(bytes32 => mapping(address => struct DXDVotingMachine.VoteDecision)) votesSignaled
```

### numOfChoices

```solidity
mapping(bytes32 => uint256) numOfChoices
```

### onlyProposalOwner

```solidity
modifier onlyProposalOwner(bytes32 _proposalId)
```

### votable

```solidity
modifier votable(bytes32 _proposalId)
```

_Check that the proposal is votable
a proposal is votable if it is in one of the following states:
PreBoosted,Boosted,QuietEndingPeriod or Queued_

### validDecision

```solidity
modifier validDecision(bytes32 proposalId, uint256 decision)
```

### constructor

```solidity
constructor(contract IERC20 _stakingToken) public
```

_Constructor_

### setParameters

```solidity
function setParameters(uint256[10] _params) external returns (bytes32)
```

_hash the parameters, save them if necessary, and return the hash value_

#### Parameters

| Name     | Type        | Description        |
| -------- | ----------- | ------------------ |
| \_params | uint256[10] | a parameters array |

    _params[0] - _queuedVoteRequiredPercentage,
    _params[1] - _queuedVotePeriodLimit, //the time limit for a proposal to be in an absolute voting mode.
    _params[2] - _boostedVotePeriodLimit, //the time limit for a proposal to be in an relative voting mode.
    _params[3] - _preBoostedVotePeriodLimit, //the time limit for a proposal to be in an preparation
                  state (stable) before boosted.
    _params[4] -_thresholdConst
    _params[5] -_quietEndingPeriod
    _params[6] -_proposingRepReward
    _params[7] -_minimumDaoBounty
    _params[8] -_daoBountyConst
    _params[9] - _boostedVoteRequiredPercentage |

### redeem

```solidity
function redeem(bytes32 _proposalId, address _beneficiary) public returns (uint256[3] rewards)
```

_redeem a reward for a successful stake, vote or proposing.
The function use a beneficiary address as a parameter (and not msg.sender) to enable
users to redeem on behalf of someone else._

#### Parameters

| Name          | Type    | Description               |
| ------------- | ------- | ------------------------- |
| \_proposalId  | bytes32 | the ID of the proposal    |
| \_beneficiary | address | - the beneficiary address |

#### Return Values

| Name    | Type       | Description |
| ------- | ---------- | ----------- |
| rewards | uint256[3] | -           |

           [0] stakerTokenReward
           [1] proposerReputationReward |

### redeemDaoBounty

```solidity
function redeemDaoBounty(bytes32 _proposalId, address _beneficiary) public returns (uint256 redeemedAmount, uint256 potentialAmount)
```

_redeemDaoBounty a reward for a successful stake.
The function use a beneficiary address as a parameter (and not msg.sender) to enable
users to redeem on behalf of someone else._

#### Parameters

| Name          | Type    | Description               |
| ------------- | ------- | ------------------------- |
| \_proposalId  | bytes32 | the ID of the proposal    |
| \_beneficiary | address | - the beneficiary address |

#### Return Values

| Name            | Type    | Description                                                                                       |
| --------------- | ------- | ------------------------------------------------------------------------------------------------- |
| redeemedAmount  | uint256 | - redeem token amount                                                                             |
| potentialAmount | uint256 | - potential redeem token amount(if there is enough tokens bounty at the dao owner of the scheme ) |

### calcExecuteCallBounty

```solidity
function calcExecuteCallBounty(bytes32 _proposalId) public view returns (uint256)
```

_calcExecuteCallBounty calculate the execute boosted call bounty_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type    | Description               |
| ---- | ------- | ------------------------- |
| [0]  | uint256 | uint256 executeCallBounty |

### shouldBoost

```solidity
function shouldBoost(bytes32 _proposalId) public view returns (bool)
```

_shouldBoost check if a proposal should be shifted to boosted phase._

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type | Description         |
| ---- | ---- | ------------------- |
| [0]  | bool | bool true or false. |

### threshold

```solidity
function threshold(bytes32 _paramsHash, bytes32 _schemeId) public view returns (uint256)
```

_threshold return the scheme's score threshold which required by
a proposal to shift to boosted state.
This threshold is dynamically set and it depend on the number of boosted proposal._

#### Parameters

| Name         | Type    | Description                |
| ------------ | ------- | -------------------------- |
| \_paramsHash | bytes32 | the scheme parameters hash |
| \_schemeId   | bytes32 | the scheme identifier      |

#### Return Values

| Name | Type    | Description                                      |
| ---- | ------- | ------------------------------------------------ |
| [0]  | uint256 | uint256 scheme's score threshold as real number. |

### stake

```solidity
function stake(bytes32 _proposalId, uint256 _vote, uint256 _amount) external returns (bool)
```

_staking function_

#### Parameters

| Name         | Type    | Description        |
| ------------ | ------- | ------------------ |
| \_proposalId | bytes32 | id of the proposal |
| \_vote       | uint256 | NO(1) or YES(2).   |
| \_amount     | uint256 | the betting amount |

#### Return Values

| Name               | Type | Description                                |
| ------------------ | ---- | ------------------------------------------ |
| [0]                | bool | bool true - the proposal has been executed |
| false - otherwise. |

### stakeWithSignature

```solidity
function stakeWithSignature(bytes32 proposalId, address staker, uint256 stakeDecision, uint256 amount, uint256 nonce, bytes signature) external returns (bool)
```

_stakeWithSignature function_

#### Parameters

| Name                                   | Type    | Description                                             |
| -------------------------------------- | ------- | ------------------------------------------------------- |
| proposalId                             | bytes32 | id of the proposal                                      |
| staker                                 | address | address of staker                                       |
| stakeDecision                          | uint256 | NO(1) or YES(2).                                        |
| amount                                 | uint256 | the betting amount                                      |
| nonce                                  | uint256 | nonce value ,it is part of the signature to ensure that |
| a signature can be received only once. |
| signature                              | bytes   | - signed data by the staker                             |

#### Return Values

| Name               | Type | Description                                |
| ------------------ | ---- | ------------------------------------------ |
| [0]                | bool | bool true - the proposal has been executed |
| false - otherwise. |

### setSchemeRefund

```solidity
function setSchemeRefund(address avatar, address scheme, uint256 _voteGas, uint256 _maxGasPrice) external payable
```

_Config the vote refund for each scheme
Allows the voting machine to receive ether to be used to refund voting costs_

#### Parameters

| Name                                       | Type    | Description                                                                                  |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------- |
| avatar                                     | address |                                                                                              |
| scheme                                     | address |                                                                                              |
| \_voteGas                                  | uint256 | the amount of gas that will be used as vote cost                                             |
| \_maxGasPrice                              | uint256 | the maximum amount of gas price to be paid, if the gas used is higher than this value only a |
| portion of the total gas would be refunded |

### withdrawRefundBalance

```solidity
function withdrawRefundBalance(address scheme) public
```

_Withdraw scheme refund balance_

### vote

```solidity
function vote(bytes32 _proposalId, uint256 _vote, uint256 _amount) external returns (bool)
```

_voting function from old voting machine changing only the logic to refund vote after vote done_

#### Parameters

| Name         | Type    | Description                                                      |
| ------------ | ------- | ---------------------------------------------------------------- |
| \_proposalId | bytes32 | id of the proposal                                               |
| \_vote       | uint256 | NO(1) or YES(2).                                                 |
| \_amount     | uint256 | the reputation amount to vote with, 0 will use all available REP |

#### Return Values

| Name | Type | Description                                   |
| ---- | ---- | --------------------------------------------- |
| [0]  | bool | bool if the proposal has been executed or not |

### execute

```solidity
function execute(bytes32 _proposalId) external returns (bool)
```

_execute check if the proposal has been decided, and if so, execute the proposal_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the id of the proposal |

#### Return Values

| Name               | Type | Description                                |
| ------------------ | ---- | ------------------------------------------ |
| [0]                | bool | bool true - the proposal has been executed |
| false - otherwise. |

### voteInfo

```solidity
function voteInfo(bytes32 _proposalId, address _voter) external view returns (uint256, uint256)
```

_voteInfo returns the vote and the amount of reputation of the user committed to this proposal_

#### Parameters

| Name         | Type    | Description              |
| ------------ | ------- | ------------------------ |
| \_proposalId | bytes32 | the ID of the proposal   |
| \_voter      | address | the address of the voter |

#### Return Values

| Name                                                                           | Type    | Description                    |
| ------------------------------------------------------------------------------ | ------- | ------------------------------ |
| [0]                                                                            | uint256 | uint256 vote - the voters vote |
| uint256 reputation - amount of reputation committed by \_voter to \_proposalId |
| [1]                                                                            | uint256 |                                |

### voteStatus

```solidity
function voteStatus(bytes32 _proposalId, uint256 _choice) external view returns (uint256)
```

_voteStatus returns the reputation voted for a proposal for a specific voting choice._

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |
| \_choice     | uint256 | the index in the       |

#### Return Values

| Name | Type    | Description                           |
| ---- | ------- | ------------------------------------- |
| [0]  | uint256 | voted reputation for the given choice |

### isVotable

```solidity
function isVotable(bytes32 _proposalId) external view returns (bool)
```

_isVotable check if the proposal is votable_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type | Description        |
| ---- | ---- | ------------------ |
| [0]  | bool | bool true or false |

### shareSignedAction

```solidity
function shareSignedAction(bytes32 proposalId, address voter, uint256 voteDecision, uint256 amount, uint256 nonce, uint256 actionType, bytes signature) external
```

_Share the vote of a proposal for a voting machine on a event log_

#### Parameters

| Name                                   | Type    | Description                                                      |
| -------------------------------------- | ------- | ---------------------------------------------------------------- |
| proposalId                             | bytes32 | id of the proposal                                               |
| voter                                  | address | address of voter                                                 |
| voteDecision                           | uint256 | the vote decision, NO(1) or YES(2).                              |
| amount                                 | uint256 | the reputation amount to vote with, 0 will use all available REP |
| nonce                                  | uint256 | nonce value ,it is part of the signature to ensure that          |
| a signature can be received only once. |
| actionType                             | uint256 | 1 == vote and 2 == stake                                         |
| signature                              | bytes   | the encoded vote signature                                       |

### signalVote

```solidity
function signalVote(bytes32 proposalId, uint256 voteDecision, uint256 amount) external
```

_Signal the vote of a proposal in this voting machine to be executed later_

#### Parameters

| Name         | Type    | Description                                                      |
| ------------ | ------- | ---------------------------------------------------------------- |
| proposalId   | bytes32 | id of the proposal to vote                                       |
| voteDecision | uint256 | the vote decisions, NO(1) or YES(2).                             |
| amount       | uint256 | the reputation amount to vote with, 0 will use all available REP |

### executeSignedVote

```solidity
function executeSignedVote(bytes32 proposalId, address voter, uint256 voteDecision, uint256 amount, uint256 nonce, bytes signature) external
```

_Execute a signed vote_

#### Parameters

| Name                                   | Type    | Description                                                      |
| -------------------------------------- | ------- | ---------------------------------------------------------------- |
| proposalId                             | bytes32 | id of the proposal to execute the vote on                        |
| voter                                  | address | the signer of the vote                                           |
| voteDecision                           | uint256 | the vote decision, NO(1) or YES(2).                              |
| amount                                 | uint256 | the reputation amount to vote with, 0 will use all available REP |
| nonce                                  | uint256 | nonce value ,it is part of the signature to ensure that          |
| a signature can be received only once. |
| signature                              | bytes   | the signature of the hashed vote                                 |

### propose

```solidity
function propose(uint256, bytes32 _paramsHash, address _proposer, address _avatar) external returns (bytes32)
```

_register a new proposal with the given parameters. Every proposal has a unique ID which is being
generated by calculating keccak256 of a incremented counter._

#### Parameters

| Name         | Type    | Description     |
| ------------ | ------- | --------------- |
|              | uint256 |                 |
| \_paramsHash | bytes32 | parameters hash |
| \_proposer   | address | address         |
| \_avatar     | address | address         |

### internalVote

```solidity
function internalVote(bytes32 _proposalId, address _voter, uint256 _vote, uint256 _rep) internal returns (bool)
```

_Vote for a proposal, if the voter already voted, cancel the last vote and set a new one instead_

#### Parameters

| Name                                                  | Type    | Description                                                      |
| ----------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| \_proposalId                                          | bytes32 | id of the proposal                                               |
| \_voter                                               | address | used in case the vote is cast for someone else                   |
| \_vote                                                | uint256 | a value between 0 to and the proposal's number of choices.       |
| \_rep                                                 | uint256 | how many reputation the voter would like to stake for this vote. |
| if \_rep==0 so the voter full reputation will be use. |

#### Return Values

| Name | Type | Description                                        |
| ---- | ---- | -------------------------------------------------- |
| [0]  | bool | true in case of proposal execution otherwise false |

throws if proposal is not open or if it has been executed
NB: executes the proposal if a decision has been reached |

### executeSignaledVote

```solidity
function executeSignaledVote(bytes32 proposalId, address voter) external
```

_Execute a signaled vote on a votable proposal_

#### Parameters

| Name       | Type    | Description                |
| ---------- | ------- | -------------------------- |
| proposalId | bytes32 | id of the proposal to vote |
| voter      | address | the signer of the vote     |

### hashAction

```solidity
function hashAction(bytes32 proposalId, address signer, uint256 option, uint256 amount, uint256 nonce, uint256 actionType) public view returns (bytes32)
```

_Hash the vote data that is used for signatures_

#### Parameters

| Name                                   | Type    | Description                                                      |
| -------------------------------------- | ------- | ---------------------------------------------------------------- |
| proposalId                             | bytes32 | id of the proposal                                               |
| signer                                 | address | the signer of the vote                                           |
| option                                 | uint256 | the vote decision, NO(1) or YES(2).                              |
| amount                                 | uint256 | the reputation amount to vote with, 0 will use all available REP |
| nonce                                  | uint256 | nonce value ,it is part of the signature to ensure that          |
| a signature can be received only once. |
| actionType                             | uint256 | the governance action type to hash                               |

### score

```solidity
function score(bytes32 _proposalId) public view returns (uint256)
```

_score return the proposal score_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type    | Description             |
| ---- | ------- | ----------------------- |
| [0]  | uint256 | uint256 proposal score. |

### \_execute

```solidity
function _execute(bytes32 _proposalId) internal returns (bool)
```

_execute check if the proposal has been decided, and if so, execute the proposal_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the id of the proposal |

#### Return Values

| Name               | Type | Description                                |
| ------------------ | ---- | ------------------------------------------ |
| [0]                | bool | bool true - the proposal has been executed |
| false - otherwise. |

### \_score

```solidity
function _score(bytes32 _proposalId) internal view returns (uint256)
```

\__score return the proposal score (Confidence level)
For dual choice proposal S = (S+)/(S-)_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type    | Description                            |
| ---- | ------- | -------------------------------------- |
| [0]  | uint256 | uint256 proposal score as real number. |

### \_isVotable

```solidity
function _isVotable(bytes32 _proposalId) internal view returns (bool)
```

\__isVotable check if the proposal is votable_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type | Description        |
| ---- | ---- | ------------------ |
| [0]  | bool | bool true or false |

### \_stake

```solidity
function _stake(bytes32 _proposalId, uint256 _vote, uint256 _amount, address _staker) internal returns (bool)
```

_staking function_

#### Parameters

| Name         | Type    | Description        |
| ------------ | ------- | ------------------ |
| \_proposalId | bytes32 | id of the proposal |
| \_vote       | uint256 | NO(1) or YES(2).   |
| \_amount     | uint256 | the betting amount |
| \_staker     | address |                    |

#### Return Values

| Name               | Type | Description                                |
| ------------------ | ---- | ------------------------------------------ |
| [0]                | bool | bool true - the proposal has been executed |
| false - otherwise. |

### \_propose

```solidity
function _propose(uint256 _choicesAmount, bytes32 _paramsHash, address _proposer, address _avatar) internal returns (bytes32)
```

_register a new proposal with the given parameters. Every proposal has a unique ID which is being
generated by calculating keccak256 of a incremented counter._

#### Parameters

| Name            | Type    | Description                                  |
| --------------- | ------- | -------------------------------------------- |
| \_choicesAmount | uint256 | the total amount of choices for the proposal |
| \_paramsHash    | bytes32 | parameters hash                              |
| \_proposer      | address | address                                      |
| \_avatar        | address | address                                      |

### \_refundVote

```solidity
function _refundVote(bytes32 schemeId) internal
```

_Refund a vote gas cost to an address_

#### Parameters

| Name     | Type    | Description                                    |
| -------- | ------- | ---------------------------------------------- |
| schemeId | bytes32 | the id of the scheme that should do the refund |

### getParametersHash

```solidity
function getParametersHash(uint256[10] _params) public pure returns (bytes32)
```

_hashParameters returns a hash of the given parameters_

### getProposalTimes

```solidity
function getProposalTimes(bytes32 _proposalId) external view returns (uint256[3] times)
```

_getProposalTimes returns proposals times variables._

#### Parameters

| Name         | Type    | Description        |
| ------------ | ------- | ------------------ |
| \_proposalId | bytes32 | id of the proposal |

#### Return Values

| Name  | Type       | Description |
| ----- | ---------- | ----------- |
| times | uint256[3] | times array |

### getProposalScheme

```solidity
function getProposalScheme(bytes32 _proposalId) external view returns (bytes32)
```

_getProposalScheme return the schemeId for a given proposal_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type    | Description               |
| ---- | ------- | ------------------------- |
| [0]  | bytes32 | bytes32 scheme identifier |

### getStaker

```solidity
function getStaker(bytes32 _proposalId, address _staker) external view returns (uint256, uint256)
```

_getStaker return the vote and stake amount for a given proposal and staker_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |
| \_staker     | address | staker address         |

#### Return Values

| Name | Type    | Description    |
| ---- | ------- | -------------- |
| [0]  | uint256 | uint256 vote   |
| [1]  | uint256 | uint256 amount |

### getAllowedRangeOfChoices

```solidity
function getAllowedRangeOfChoices() external pure returns (uint256 min, uint256 max)
```

_getAllowedRangeOfChoices returns the allowed range of choices for a voting machine._

#### Return Values

| Name                            | Type    | Description                 |
| ------------------------------- | ------- | --------------------------- |
| min                             | uint256 | - minimum number of choices |
| max - maximum number of choices |
| max                             | uint256 |                             |

### getNumberOfChoices

```solidity
function getNumberOfChoices(bytes32 _proposalId) public view returns (uint256)
```

_getNumberOfChoices returns the number of choices possible in this proposal_

#### Parameters

| Name         | Type    | Description     |
| ------------ | ------- | --------------- |
| \_proposalId | bytes32 | the proposal id |

#### Return Values

| Name | Type    | Description                             |
| ---- | ------- | --------------------------------------- |
| [0]  | uint256 | uint256 that contains number of choices |

### proposalStatus

```solidity
function proposalStatus(bytes32 _proposalId) external view returns (uint256, uint256, uint256, uint256)
```

_proposalStatus return the total votes and stakes for a given proposal_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type    | Description                 |
| ---- | ------- | --------------------------- |
| [0]  | uint256 | uint256 preBoostedVotes YES |
| [1]  | uint256 | uint256 preBoostedVotes NO  |
| [2]  | uint256 | uint256 total stakes YES    |
| [3]  | uint256 | uint256 total stakes NO     |

### proposalStatusWithVotes

```solidity
function proposalStatusWithVotes(bytes32 _proposalId) external view returns (uint256, uint256, uint256, uint256, uint256, uint256)
```

_proposalStatusWithVotes return the total votes, preBoostedVotes and stakes for a given proposal_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type    | Description                 |
| ---- | ------- | --------------------------- |
| [0]  | uint256 | uint256 votes YES           |
| [1]  | uint256 | uint256 votes NO            |
| [2]  | uint256 | uint256 preBoostedVotes YES |
| [3]  | uint256 | uint256 preBoostedVotes NO  |
| [4]  | uint256 | uint256 total stakes YES    |
| [5]  | uint256 | uint256 total stakes NO     |

### voteStake

```solidity
function voteStake(bytes32 _proposalId, uint256 _vote) external view returns (uint256)
```

_voteStake return the amount stakes for a given proposal and vote_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |
| \_vote       | uint256 | vote number            |

#### Return Values

| Name | Type    | Description          |
| ---- | ------- | -------------------- |
| [0]  | uint256 | uint256 stake amount |

### winningVote

```solidity
function winningVote(bytes32 _proposalId) external view returns (uint256)
```

_winningVote return the winningVote for a given proposal_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type    | Description         |
| ---- | ------- | ------------------- |
| [0]  | uint256 | uint256 winningVote |

### state

```solidity
function state(bytes32 _proposalId) external view returns (enum DXDVotingMachine.ProposalState)
```

_state return the state for a given proposal_

#### Parameters

| Name         | Type    | Description            |
| ------------ | ------- | ---------------------- |
| \_proposalId | bytes32 | the ID of the proposal |

#### Return Values

| Name | Type                                | Description                  |
| ---- | ----------------------------------- | ---------------------------- |
| [0]  | enum DXDVotingMachine.ProposalState | ProposalState proposal state |
