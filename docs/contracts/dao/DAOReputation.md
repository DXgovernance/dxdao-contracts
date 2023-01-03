# Solidity API

## DAOReputation

_An ERC20 token that is non-transferable, owned and controlled by the DAO.
Used by the DAO to vote on proposals.
It uses a snapshot mechanism to keep track of the reputation at the moment of
each modification of the supply of the token (every mint an burn)._

### Mint

```solidity
event Mint(address to, uint256 amount)
```

### Burn

```solidity
event Burn(address from, uint256 amount)
```

### DAOReputation__NoTransfer

```solidity
error DAOReputation__NoTransfer()
```

Error when trying to transfer reputation

### initialize

```solidity
function initialize(string name, string symbol) external
```

### _transfer

```solidity
function _transfer(address sender, address recipient, uint256 amount) internal virtual
```

_Not allow the transfer of tokens_

### mint

```solidity
function mint(address account, uint256 amount) external returns (bool success)
```

_Generates `amount` reputation that are assigned to `account`_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address that will be assigned the new reputation |
| amount | uint256 | The quantity of reputation generated |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are generated correctly |

### mintMultiple

```solidity
function mintMultiple(address[] accounts, uint256[] amount) external returns (bool success)
```

_Mint reputation for multiple accounts_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The accounts that will be assigned the new reputation |
| amount | uint256[] | The quantity of reputation generated for each account |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are generated correctly |

### burn

```solidity
function burn(address account, uint256 amount) external returns (bool success)
```

_Burns ` amount` reputation from ` account`_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address that will lose the reputation |
| amount | uint256 | The quantity of reputation to burn |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are burned correctly |

### burnMultiple

```solidity
function burnMultiple(address[] accounts, uint256[] amount) external returns (bool success)
```

_Burn reputation from multiple accounts_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The accounts that will lose the reputation |
| amount | uint256[] | The quantity of reputation to burn for each account |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are generated correctly |

### getCurrentSnapshotId

```solidity
function getCurrentSnapshotId() public view returns (uint256)
```

_Get the current snapshotId_

