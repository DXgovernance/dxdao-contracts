# Solidity API

## SnapshotRepERC20Guild

### proposalsSnapshots

```solidity
mapping(bytes32 => uint256) proposalsSnapshots
```

### initialize

```solidity
function initialize(address _token, uint256 _proposalTime, uint256 _timeForExecution, uint256 _votingPowerForProposalExecution, uint256 _votingPowerForProposalCreation, string _name, uint256 _voteGas, uint256 _maxGasPrice, uint256 _maxActiveProposals, uint256 _lockTime, address _permissionRegistry) public
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
function lockTokens(uint256) external virtual
```

### withdrawTokens

```solidity
function withdrawTokens(uint256) external virtual
```

### createProposal

```solidity
function createProposal(address[] to, bytes[] data, uint256[] value, uint256 totalActions, string title, string contentHash) public virtual returns (bytes32)
```

### endProposal

```solidity
function endProposal(bytes32 proposalId) public virtual
```

### votingPowerOfMultipleAt

```solidity
function votingPowerOfMultipleAt(address[] accounts, uint256[] snapshotIds) external view virtual returns (uint256[])
```

### votingPowerOfAt

```solidity
function votingPowerOfAt(address account, uint256 snapshotId) public view virtual returns (uint256)
```

### votingPowerOf

```solidity
function votingPowerOf(address account) public view virtual returns (uint256)
```

### getProposalSnapshotId

```solidity
function getProposalSnapshotId(bytes32 proposalId) public view returns (uint256)
```

### getTotalLocked

```solidity
function getTotalLocked() public view virtual returns (uint256)
```

### getSnapshotVotingPowerForProposalExecution

```solidity
function getSnapshotVotingPowerForProposalExecution(bytes32 proposalId) public view virtual returns (uint256)
```

