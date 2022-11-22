# Solidity API

## DAOReputation\_\_NoTransfer

```solidity
error DAOReputation__NoTransfer()
```

Error when trying to transfer reputation

## DAOReputation

### Mint

```solidity
event Mint(address _to, uint256 _amount)
```

### Burn

```solidity
event Burn(address _from, uint256 _amount)
```

### initialize

```solidity
function initialize(string name, string symbol) external
```

### \_transfer

```solidity
function _transfer(address sender, address recipient, uint256 amount) internal virtual
```

_Not allow the transfer of tokens_

### mint

```solidity
function mint(address _account, uint256 _amount) external returns (bool)
```

Generates `_amount` reputation that are assigned to `_account`

#### Parameters

| Name      | Type    | Description                                          |
| --------- | ------- | ---------------------------------------------------- |
| \_account | address | The address that will be assigned the new reputation |
| \_amount  | uint256 | The quantity of reputation generated                 |

#### Return Values

| Name | Type | Description                                    |
| ---- | ---- | ---------------------------------------------- |
| [0]  | bool | True if the reputation are generated correctly |

### mintMultiple

```solidity
function mintMultiple(address[] _accounts, uint256[] _amount) external returns (bool)
```

### burn

```solidity
function burn(address _account, uint256 _amount) external returns (bool)
```

Burns `_amount` reputation from `_account`

#### Parameters

| Name      | Type    | Description                               |
| --------- | ------- | ----------------------------------------- |
| \_account | address | The address that will lose the reputation |
| \_amount  | uint256 | The quantity of reputation to burn        |

#### Return Values

| Name | Type | Description                                 |
| ---- | ---- | ------------------------------------------- |
| [0]  | bool | True if the reputation are burned correctly |

### burnMultiple

```solidity
function burnMultiple(address[] _accounts, uint256 _amount) external returns (bool)
```

### getCurrentSnapshotId

```solidity
function getCurrentSnapshotId() public view returns (uint256)
```

_Get the current snapshotId_
