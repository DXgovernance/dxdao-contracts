# Solidity API

## VotingMachineCallbacks

### votingMachine

```solidity
contract IVotingMachine votingMachine
```

### controller

```solidity
contract DAOController controller
```

### onlyVotingMachine

```solidity
modifier onlyVotingMachine()
```

### proposalSnapshots

```solidity
mapping(bytes32 => uint256) proposalSnapshots
```

### getReputation

```solidity
function getReputation() public view returns (contract DAOReputation)
```

### getNativeReputationTotalSupply

```solidity
function getNativeReputationTotalSupply() public view returns (uint256)
```

### getTotalReputationSupply

```solidity
function getTotalReputationSupply(bytes32 _proposalId) external view returns (uint256)
```

### reputationOf

```solidity
function reputationOf(address _owner, bytes32 _proposalId) external view returns (uint256)
```

