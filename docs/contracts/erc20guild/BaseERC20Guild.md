# Solidity API

## BaseERC20Guild

### MAX_OPTIONS_PER_PROPOSAL

```solidity
uint8 MAX_OPTIONS_PER_PROPOSAL
```

### ProposalState

```solidity
enum ProposalState {
  None,
  Active,
  Rejected,
  Executed,
  Failed
}
```

### token

```solidity
contract IERC20Upgradeable token
```

### permissionRegistry

```solidity
contract PermissionRegistry permissionRegistry
```

### name

```solidity
string name
```

### proposalTime

```solidity
uint256 proposalTime
```

### timeForExecution

```solidity
uint256 timeForExecution
```

### votingPowerPercentageForProposalExecution

```solidity
uint256 votingPowerPercentageForProposalExecution
```

### votingPowerPercentageForProposalCreation

```solidity
uint256 votingPowerPercentageForProposalCreation
```

### voteGas

```solidity
uint256 voteGas
```

### maxGasPrice

```solidity
uint256 maxGasPrice
```

### maxActiveProposals

```solidity
uint256 maxActiveProposals
```

### totalProposals

```solidity
uint256 totalProposals
```

### totalMembers

```solidity
uint256 totalMembers
```

### activeProposalsNow

```solidity
uint256 activeProposalsNow
```

### lockTime

```solidity
uint256 lockTime
```

### totalLocked

```solidity
uint256 totalLocked
```

### minimumMembersForProposalCreation

```solidity
uint256 minimumMembersForProposalCreation
```

### minimumTokensLockedForProposalCreation

```solidity
uint256 minimumTokensLockedForProposalCreation
```

### tokenVault

```solidity
contract TokenVault tokenVault
```

### TokenLock

```solidity
struct TokenLock {
  uint256 amount;
  uint256 timestamp;
}
```

### tokensLocked

```solidity
mapping(address => struct BaseERC20Guild.TokenLock) tokensLocked
```

### signedVotes

```solidity
mapping(bytes32 => bool) signedVotes
```

### Vote

```solidity
struct Vote {
  uint256 option;
  uint256 votingPower;
}
```

### Proposal

```solidity
struct Proposal {
  address creator;
  uint256 startTime;
  uint256 endTime;
  address[] to;
  bytes[] data;
  uint256[] value;
  string title;
  string contentHash;
  enum BaseERC20Guild.ProposalState state;
  uint256[] totalVotes;
}
```

### proposalVotes

```solidity
mapping(bytes32 => mapping(address => struct BaseERC20Guild.Vote)) proposalVotes
```

### proposals

```solidity
mapping(bytes32 => struct BaseERC20Guild.Proposal) proposals
```

### proposalsIds

```solidity
bytes32[] proposalsIds
```

### ProposalStateChanged

```solidity
event ProposalStateChanged(bytes32 proposalId, uint256 newState)
```

### VoteAdded

```solidity
event VoteAdded(bytes32 proposalId, uint256 option, address voter, uint256 votingPower)
```

### TokensLocked

```solidity
event TokensLocked(address voter, uint256 value)
```

### TokensWithdrawn

```solidity
event TokensWithdrawn(address voter, uint256 value)
```

### isExecutingProposal

```solidity
bool isExecutingProposal
```

### fallback

```solidity
fallback() external payable
```

### setConfig

```solidity
function setConfig(uint256 _proposalTime, uint256 _timeForExecution, uint256 _votingPowerPercentageForProposalExecution, uint256 _votingPowerPercentageForProposalCreation, uint256 _voteGas, uint256 _maxGasPrice, uint256 _maxActiveProposals, uint256 _lockTime, uint256 _minimumMembersForProposalCreation, uint256 _minimumTokensLockedForProposalCreation) external virtual
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _proposalTime | uint256 |  |
| _timeForExecution | uint256 |  |
| _votingPowerPercentageForProposalExecution | uint256 |  |
| _votingPowerPercentageForProposalCreation | uint256 |  |
| _voteGas | uint256 |  |
| _maxGasPrice | uint256 | The maximum gas price used for vote refunds |
| _maxActiveProposals | uint256 | The maximum amount of proposals to be active at the same time |
| _lockTime | uint256 | The minimum amount of seconds that the tokens would be locked |
| _minimumMembersForProposalCreation | uint256 |  |
| _minimumTokensLockedForProposalCreation | uint256 |  |

### createProposal

```solidity
function createProposal(address[] to, bytes[] data, uint256[] value, uint256 totalOptions, string title, string contentHash) public virtual returns (bytes32)
```

_Create a proposal with an static call data and extra information_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to | address[] | The receiver addresses of each call to be executed |
| data | bytes[] | The data to be executed on each call to be executed |
| value | uint256[] | The ETH value to be sent on each call to be executed |
| totalOptions | uint256 | The amount of options that would be offered to the voters |
| title | string | The title of the proposal |
| contentHash | string | The content hash of the content reference of the proposal for the proposal to be executed |

### endProposal

```solidity
function endProposal(bytes32 proposalId) public virtual
```

_Executes a proposal that is not votable anymore and can be finished_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to be executed |

### setVote

```solidity
function setVote(bytes32 proposalId, uint256 option, uint256 votingPower) public virtual
```

_Set the voting power to vote in a proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to set the vote |
| option | uint256 | The proposal option to be voted |
| votingPower | uint256 | The votingPower to use in the proposal |

### setSignedVote

```solidity
function setSignedVote(bytes32 proposalId, uint256 option, uint256 votingPower, address voter, bytes signature) public virtual
```

_Set the voting power to vote in a proposal using a signed vote_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to set the vote |
| option | uint256 | The proposal option to be voted |
| votingPower | uint256 | The votingPower to use in the proposal |
| voter | address | The address of the voter |
| signature | bytes | The signature of the hashed vote |

### lockTokens

```solidity
function lockTokens(uint256 tokenAmount) external virtual
```

_Lock tokens in the guild to be used as voting power_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | The amount of tokens to be locked |

### withdrawTokens

```solidity
function withdrawTokens(uint256 tokenAmount) external virtual
```

_Withdraw tokens locked in the guild, this will decrease the voting power_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | The amount of tokens to be withdrawn |

### _setVote

```solidity
function _setVote(address voter, bytes32 proposalId, uint256 option, uint256 votingPower) internal
```

_Internal function to set the amount of votingPower to vote in a proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| voter | address | The address of the voter |
| proposalId | bytes32 | The id of the proposal to set the vote |
| option | uint256 | The proposal option to be voted |
| votingPower | uint256 | The amount of votingPower to use as voting for the proposal |

### getProposal

```solidity
function getProposal(bytes32 proposalId) external view virtual returns (struct BaseERC20Guild.Proposal)
```

_Get the information of a proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to get the information |

### votingPowerOf

```solidity
function votingPowerOf(address account) public view virtual returns (uint256)
```

_Get the voting power of an account_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account |

### getToken

```solidity
function getToken() external view returns (address)
```

_Get the address of the ERC20Token used for voting_

### getPermissionRegistry

```solidity
function getPermissionRegistry() external view returns (address)
```

_Get the address of the permission registry contract_

### getName

```solidity
function getName() external view returns (string)
```

_Get the name of the ERC20Guild_

### getProposalTime

```solidity
function getProposalTime() external view returns (uint256)
```

_Get the proposalTime_

### getTimeForExecution

```solidity
function getTimeForExecution() external view returns (uint256)
```

_Get the timeForExecution_

### getVoteGas

```solidity
function getVoteGas() external view returns (uint256)
```

_Get the voteGas_

### getMaxGasPrice

```solidity
function getMaxGasPrice() external view returns (uint256)
```

_Get the maxGasPrice_

### getMaxActiveProposals

```solidity
function getMaxActiveProposals() public view returns (uint256)
```

_Get the maxActiveProposals_

### getTotalProposals

```solidity
function getTotalProposals() external view returns (uint256)
```

_Get the totalProposals_

### getTotalMembers

```solidity
function getTotalMembers() public view returns (uint256)
```

_Get the totalMembers_

### getActiveProposalsNow

```solidity
function getActiveProposalsNow() external view returns (uint256)
```

_Get the activeProposalsNow_

### getMinimumMembersForProposalCreation

```solidity
function getMinimumMembersForProposalCreation() external view returns (uint256)
```

### getMinimumTokensLockedForProposalCreation

```solidity
function getMinimumTokensLockedForProposalCreation() external view returns (uint256)
```

### getSignedVote

```solidity
function getSignedVote(bytes32 signedVoteHash) external view returns (bool)
```

_Get if a signed vote has been executed or not_

### getProposalsIds

```solidity
function getProposalsIds() external view returns (bytes32[])
```

_Get the proposalsIds array_

### getProposalVotesOfVoter

```solidity
function getProposalVotesOfVoter(bytes32 proposalId, address voter) external view virtual returns (uint256 option, uint256 votingPower)
```

_Get the votes of a voter in a proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to get the information |
| voter | address | The address of the voter to get the votes |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| option | uint256 | The selected option of teh voter |
| votingPower | uint256 | The amount of voting power used in the vote |

### getVotingPowerForProposalCreation

```solidity
function getVotingPowerForProposalCreation() public view virtual returns (uint256)
```

_Get minimum amount of votingPower needed for creation_

### getVotingPowerForProposalExecution

```solidity
function getVotingPowerForProposalExecution() public view virtual returns (uint256)
```

_Get minimum amount of votingPower needed for proposal execution_

### getProposalsIdsLength

```solidity
function getProposalsIdsLength() external view virtual returns (uint256)
```

_Get the length of the proposalIds array_

### getTokenVault

```solidity
function getTokenVault() external view virtual returns (address)
```

_Get the tokenVault address_

### getLockTime

```solidity
function getLockTime() external view virtual returns (uint256)
```

_Get the lockTime_

### getTotalLocked

```solidity
function getTotalLocked() public view virtual returns (uint256)
```

_Get the totalLocked_

### getVoterLockTimestamp

```solidity
function getVoterLockTimestamp(address voter) public view virtual returns (uint256)
```

_Get the locked timestamp of a voter tokens_

### hashVote

```solidity
function hashVote(address voter, bytes32 proposalId, uint256 option, uint256 votingPower) public pure virtual returns (bytes32)
```

_Get the hash of the vote, this hash is later signed by the voter._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| voter | address | The address that will be used to sign the vote |
| proposalId | bytes32 | The id fo the proposal to be voted |
| option | uint256 | The proposal option to be voted |
| votingPower | uint256 | The amount of voting power to be used |

