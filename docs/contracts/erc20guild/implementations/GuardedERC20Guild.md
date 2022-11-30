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
function initialize(address _token, uint256 _proposalTime, uint256 _timeForExecution, uint256 _votingPowerPercentageForProposalExecution, uint256 _votingPowerPercentageForProposalCreation, string _name, uint256 _voteGas, uint256 _maxGasPrice, uint256 _maxActiveProposals, uint256 _lockTime, address _permissionRegistry) public virtual
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address |  |
| _proposalTime | uint256 |  |
| _timeForExecution | uint256 |  |
| _votingPowerPercentageForProposalExecution | uint256 |  |
| _votingPowerPercentageForProposalCreation | uint256 | The percentage of voting power in base 10000 needed to create a proposal |
| _name | string | The name of the ERC20Guild |
| _voteGas | uint256 | The amount of gas in wei unit used for vote refunds |
| _maxGasPrice | uint256 | The maximum gas price used for vote refunds |
| _maxActiveProposals | uint256 | The maximum amount of proposals to be active at the same time |
| _lockTime | uint256 | The minimum amount of seconds that the tokens would be locked |
| _permissionRegistry | address | The address of the permission registry contract to be used |

### endProposal

```solidity
function endProposal(bytes32 proposalId) public virtual
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to be ended |

### rejectProposal

```solidity
function rejectProposal(bytes32 proposalId) external
```

_Rejects a proposal directly without execution, only callable by the guardian_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to be rejected |

### setGuardianConfig

```solidity
function setGuardianConfig(address _guildGuardian, uint256 _extraTimeForGuardian) external
```

_Set GuardedERC20Guild guardian configuration_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _guildGuardian | address | The address of the guild guardian |
| _extraTimeForGuardian | uint256 | The extra time the proposals would be locked for guardian verification |

### getGuildGuardian

```solidity
function getGuildGuardian() external view returns (address)
```

_Get the guildGuardian address_

### getExtraTimeForGuardian

```solidity
function getExtraTimeForGuardian() external view returns (uint256)
```

_Get the extraTimeForGuardian_

