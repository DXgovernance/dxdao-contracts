# Solidity API

## DAOAvatar

_The avatar, representing the DAO, owned by the DAO, controls the reputation and funds of the DAO._

### CallExecuted

```solidity
event CallExecuted(address to, bytes data, uint256 value, bool callSuccess, bytes callData)
```

Emitted when the call was executed

### receive

```solidity
receive() external payable
```

### initialize

```solidity
function initialize(address owner) public
```

_Initialize the avatar contract._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| owner | address | The address of the owner |

### executeCall

```solidity
function executeCall(address to, bytes data, uint256 value) public returns (bool callSuccess, bytes callData)
```

_Perform a call to an arbitrary contract_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to | address | The contract's address to call |
| data | bytes | ABI-encoded contract call to call `_to` address. |
| value | uint256 | Value (ETH) to transfer with the transaction |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| callSuccess | bool | Whether call was executed successfully or not |
| callData | bytes | Call data returned |

