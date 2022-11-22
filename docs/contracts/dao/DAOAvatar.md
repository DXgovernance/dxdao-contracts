# Solidity API

## DAOAvatar

### CallExecuted

```solidity
event CallExecuted(address _to, bytes _data, uint256 _value, bool _success)
```

### receive

```solidity
receive() external payable
```

### initialize

```solidity
function initialize(address _owner) public
```

### executeCall

```solidity
function executeCall(address _to, bytes _data, uint256 _value) public returns (bool, bytes)
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
| [0] | bool | (bool, bytes) (Success or fail, Call data returned) |
| [1] | bytes |  |

