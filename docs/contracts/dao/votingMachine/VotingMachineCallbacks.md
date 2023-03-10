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

### votingPower

```solidity
contract VotingPower votingPower
```

### proposalSnapshots

```solidity
mapping(bytes32 => uint256) proposalSnapshots
```

### __gap

```solidity
uint256[45] __gap
```

### VotingMachineCallbacks__OnlyVotingMachine

```solidity
error VotingMachineCallbacks__OnlyVotingMachine()
```

### onlyVotingMachine

```solidity
modifier onlyVotingMachine()
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

### getVotingPowerTotalSupply

```solidity
function getVotingPowerTotalSupply() public view returns (uint256)
```

### getVotingPowerTotalSupplyAt

```solidity
function getVotingPowerTotalSupplyAt(bytes32 _proposalId) external view returns (uint256)
```

### votingPowerOf

```solidity
function votingPowerOf(address _owner, bytes32 _proposalId) external view returns (uint256)
```

