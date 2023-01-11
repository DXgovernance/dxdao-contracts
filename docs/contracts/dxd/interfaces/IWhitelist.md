# Solidity API

## IWhitelist

Source: https://raw.githubusercontent.com/simple-restricted-token/reference-implementation/master/contracts/token/ERC1404/ERC1404.sol
With ERC-20 APIs removed (will be implemented as a separate contract).
And adding authorizeTransfer.

### detectTransferRestriction

```solidity
function detectTransferRestriction(address from, address to, uint256 value) external view returns (uint8)
```

Detects if a transfer will be reverted and if so returns an appropriate reference code

_Overwrite with your custom transfer restriction logic_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| from | address | Sending address |
| to | address | Receiving address |
| value | uint256 | Amount of tokens being transferred |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint8 | Code by which to reference message for rejection reasoning |

### messageForTransferRestriction

```solidity
function messageForTransferRestriction(uint8 restrictionCode) external pure returns (string)
```

Returns a human-readable message for a given restriction code

_Overwrite with your custom message and restrictionCode handling_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| restrictionCode | uint8 | Identifier for looking up a message |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | Text showing the restriction's reasoning |

### authorizeTransfer

```solidity
function authorizeTransfer(address _from, address _to, uint256 _value, bool _isSell) external
```

Called by the DAT contract before a transfer occurs.

_This call will revert when the transfer is not authorized.
This is a mutable call to allow additional data to be recorded,
such as when the user aquired their tokens._

