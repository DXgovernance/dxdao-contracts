# Solidity API

## IVotingMachineCallbacks

### getTotalReputationSupply

```solidity
function getTotalReputationSupply(bytes32 _proposalId) external view returns (uint256)
```

### reputationOf

```solidity
function reputationOf(address _owner, bytes32 _proposalId) external view returns (uint256)
```

### getVotingPowerTotalSupplyAt

```solidity
function getVotingPowerTotalSupplyAt(bytes32 _proposalId) external view returns (uint256)
```

### votingPowerOf

```solidity
function votingPowerOf(address _owner, bytes32 _proposalId) external view returns (uint256)
```

