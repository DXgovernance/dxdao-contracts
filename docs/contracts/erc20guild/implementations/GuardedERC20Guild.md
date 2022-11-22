# Solidity API

## GuardedERC20Guild

### guildGuardian

```solidity
address guildGuardian
```

### extraTimeForGuardian

```solidity
uint256 extraTimeForGuardian
```

### initialize

```solidity
function initialize(address _token, uint256 _proposalTime, uint256 _timeForExecution, uint256 _votingPowerForProposalExecution, uint256 _votingPowerForProposalCreation, string _name, uint256 _voteGas, uint256 _maxGasPrice, uint256 _maxActiveProposals, uint256 _lockTime, address _permissionRegistry) public virtual
```

### endProposal

```solidity
function endProposal(bytes32 proposalId) public virtual
```

### rejectProposal

```solidity
function rejectProposal(bytes32 proposalId) external
```

### setGuardianConfig

```solidity
function setGuardianConfig(address _guildGuardian, uint256 _extraTimeForGuardian) external
```

### getGuildGuardian

```solidity
function getGuildGuardian() external view returns (address)
```

### getExtraTimeForGuardian

```solidity
function getExtraTimeForGuardian() external view returns (uint256)
```
