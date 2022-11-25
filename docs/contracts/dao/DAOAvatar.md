# Solidity API

## DAOAvatar

### CallExecuted

```solidity
event CallExecuted(address _to, bytes _data, uint256 _value, bool _success)
```

Emitted when the call was executed

### receive

```solidity
receive() external payable
```

### initialize

```solidity
function initialize(address _owner) public
```

_Initialize the avatar contract._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _owner | address | The address of the owner |

### executeCall

```solidity
function executeCall(address _to, bytes _data, uint256 _value) public returns (bool success, bytes data)
```

_Perform a call to an arbitrary contract_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _to | address | The contract's address to call |
| _data | bytes | ABI-encoded contract call to call `_to` address. |
| _value | uint256 | Value (ETH) to transfer with the transaction |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | Whether call was executed successfully or not |
| data | bytes | Call data returned |

