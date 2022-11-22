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

### \_votesSnapshots

```solidity
mapping(address => struct SnapshotERC20Guild.Snapshots) _votesSnapshots
```

### \_totalLockedSnapshots

```solidity
struct SnapshotERC20Guild.Snapshots _totalLockedSnapshots
```

### \_currentSnapshotId

```solidity
uint256 _currentSnapshotId
```

### setVote

```solidity
function setVote(bytes32 proposalId, uint256 action, uint256 votingPower) public virtual
```

### setSignedVote

```solidity
function setSignedVote(bytes32 proposalId, uint256 action, uint256 votingPower, address voter, bytes signature) public virtual
```

### lockTokens

```solidity
function lockTokens(uint256 tokenAmount) external virtual
```

### withdrawTokens

```solidity
function withdrawTokens(uint256 tokenAmount) external virtual
```

### createProposal

```solidity
function createProposal(address[] to, bytes[] data, uint256[] value, uint256 totalActions, string title, string contentHash) public virtual returns (bytes32)
```

### endProposal

```solidity
function endProposal(bytes32 proposalId) public virtual
```

### votingPowerOfAt

```solidity
function votingPowerOfAt(address account, uint256 snapshotId) public view virtual returns (uint256)
```

### votingPowerOfMultipleAt

```solidity
function votingPowerOfMultipleAt(address[] accounts, uint256[] snapshotIds) external view virtual returns (uint256[])
```

### totalLockedAt

```solidity
function totalLockedAt(uint256 snapshotId) public view virtual returns (uint256)
```

### getVotingPowerForProposalExecution

```solidity
function getVotingPowerForProposalExecution(uint256 snapshotId) public view virtual returns (uint256)
```

### getProposalSnapshotId

```solidity
function getProposalSnapshotId(bytes32 proposalId) external view returns (uint256)
```

### getCurrentSnapshotId

```solidity
function getCurrentSnapshotId() external view returns (uint256)
```

### \_valueAt

```solidity
function _valueAt(uint256 snapshotId, struct SnapshotERC20Guild.Snapshots snapshots) private view returns (bool, uint256)
```

### \_updateAccountSnapshot

```solidity
function _updateAccountSnapshot(address account) private
```

### \_updateTotalSupplySnapshot

```solidity
function _updateTotalSupplySnapshot() private
```

### \_updateSnapshot

```solidity
function _updateSnapshot(struct SnapshotERC20Guild.Snapshots snapshots, uint256 currentValue) private
```

### \_lastSnapshotId

```solidity
function _lastSnapshotId(uint256[] ids) private view returns (uint256)
```
