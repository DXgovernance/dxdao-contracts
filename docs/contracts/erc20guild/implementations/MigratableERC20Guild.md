# Solidity API

## MigratableERC20Guild

### tokensLockedByVault

```solidity
mapping(address => mapping(address => struct BaseERC20Guild.TokenLock)) tokensLockedByVault
```

### totalLockedByVault

```solidity
mapping(address => uint256) totalLockedByVault
```

### lastMigrationTimestamp

```solidity
uint256 lastMigrationTimestamp
```

### constructor

```solidity
constructor(address _token, uint256 _proposalTime, uint256 _votingPowerPercentageForProposalExecution, uint256 _votingPowerPercentageForProposalCreation, string _name, uint256 _lockTime, address _permissionRegistry) public
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address |  |
| _proposalTime | uint256 |  |
| _votingPowerPercentageForProposalExecution | uint256 |  |
| _votingPowerPercentageForProposalCreation | uint256 | The percentage of voting power in base 10000 needed to create a proposal |
| _name | string | The name of the ERC20Guild |
| _lockTime | uint256 | The minimum amount of seconds that the tokens would be locked |
| _permissionRegistry | address | The address of the permission registry contract to be used |

### changeTokenVault

```solidity
function changeTokenVault(address newTokenVault) external virtual
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newTokenVault | address | The address of the new token vault |

### lockTokens

```solidity
function lockTokens(uint256 tokenAmount) external virtual
```

_Lock tokens in the guild to be used as voting power in the official vault_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | The amount of tokens to be locked |

### withdrawTokens

```solidity
function withdrawTokens(uint256 tokenAmount) external virtual
```

_Withdraw tokens locked in the guild form the official vault, this will decrease the voting power_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | The amount of tokens to be withdrawn |

### lockExternalTokens

```solidity
function lockExternalTokens(uint256 tokenAmount, address _tokenVault) external virtual
```

_Lock tokens in the guild to be used as voting power in an external vault_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | The amount of tokens to be locked |
| _tokenVault | address | The token vault to be used |

### withdrawExternalTokens

```solidity
function withdrawExternalTokens(uint256 tokenAmount, address _tokenVault) external virtual
```

_Withdraw tokens locked in the guild from an external vault_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAmount | uint256 | The amount of tokens to be withdrawn |
| _tokenVault | address | The token vault to be used |

### endProposal

```solidity
function endProposal(bytes32 proposalId) public virtual
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to be executed |

### votingPowerOf

```solidity
function votingPowerOf(address account) public view virtual returns (uint256)
```

_Get the voting power of an account_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account |

### getVoterLockTimestamp

```solidity
function getVoterLockTimestamp(address voter) public view virtual returns (uint256)
```

_Get the locked timestamp of a voter tokens_

### getTotalLocked

```solidity
function getTotalLocked() public view virtual returns (uint256)
```

_Get the totalLocked_

