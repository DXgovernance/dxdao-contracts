# Solidity API

## DXDVotingMachineCallbacksInterface

### mintReputation

```solidity
function mintReputation(uint256 _amount, address _beneficiary, bytes32 _proposalId) external returns (bool)
```

### burnReputation

```solidity
function burnReputation(uint256 _amount, address _owner, bytes32 _proposalId) external returns (bool)
```

### stakingTokenTransfer

```solidity
function stakingTokenTransfer(address _stakingToken, address _beneficiary, uint256 _amount, bytes32 _proposalId) external returns (bool)
```

### getTotalReputationSupply

```solidity
function getTotalReputationSupply(bytes32 _proposalId) external view returns (uint256)
```

### reputationOf

```solidity
function reputationOf(address _owner, bytes32 _proposalId) external view returns (uint256)
```

### balanceOfStakingToken

```solidity
function balanceOfStakingToken(address _stakingToken, bytes32 _proposalId) external view returns (uint256)
```

