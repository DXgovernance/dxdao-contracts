# Solidity API

## SnapshotERC20Guild

### proposalsSnapshots

```solidity
mapping(bytes32 => uint256) proposalsSnapshots
```

### Snapshots

```solidity
struct Snapshots {
  uint256[] ids;
  uint256[] values;
}
```

### _votesSnapshots

```solidity
mapping(address => struct SnapshotERC20Guild.Snapshots) _votesSnapshots
```

### _totalLockedSnapshots

```solidity
struct SnapshotERC20Guild.Snapshots _totalLockedSnapshots
```

### _currentSnapshotId

```solidity
uint256 _currentSnapshotId
```

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

_Release tokens locked in the guild, this will decrease the voting power_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | The amount of tokens to be withdrawn |

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
| totalOptions | uint256 | The amount of Options that would be offered to the voters |
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

### votingPowerOfAt

```solidity
function votingPowerOfAt(address account, uint256 snapshotId) public view virtual returns (uint256)
```

_Get the voting power of an address at a certain snapshotId_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account |
| snapshotId | uint256 | The snapshotId to be used |

### votingPowerOfMultipleAt

```solidity
function votingPowerOfMultipleAt(address[] accounts, uint256[] snapshotIds) external view virtual returns (uint256[])
```

_Get the voting power of multiple addresses at a certain snapshotId_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The addresses of the accounts |
| snapshotIds | uint256[] | The snapshotIds to be used |

### totalLockedAt

```solidity
function totalLockedAt(uint256 snapshotId) public view virtual returns (uint256)
```

_Get the total amount of tokes locked at a certain snapshotId_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| snapshotId | uint256 | The snapshotId to be used |

### getVotingPowerForProposalExecution

```solidity
function getVotingPowerForProposalExecution(uint256 snapshotId) public view virtual returns (uint256)
```

_Get minimum amount of votingPower needed for proposal execution_

### getProposalSnapshotId

```solidity
function getProposalSnapshotId(bytes32 proposalId) external view returns (uint256)
```

_Get the proposal snapshot id_

### getCurrentSnapshotId

```solidity
function getCurrentSnapshotId() external view returns (uint256)
```

_Get the current snapshot id_

### _valueAt

```solidity
function _valueAt(uint256 snapshotId, struct SnapshotERC20Guild.Snapshots snapshots) private view returns (bool, uint256)
```

### _updateAccountSnapshot

```solidity
function _updateAccountSnapshot(address account) private
```

### _updateTotalSupplySnapshot

```solidity
function _updateTotalSupplySnapshot() private
```

### _updateSnapshot

```solidity
function _updateSnapshot(struct SnapshotERC20Guild.Snapshots snapshots, uint256 currentValue) private
```

### _lastSnapshotId

```solidity
function _lastSnapshotId(uint256[] ids) private view returns (uint256)
```

