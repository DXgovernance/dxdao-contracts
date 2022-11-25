# Solidity API

## ERC20GuildWithERC1271

### EIP1271SignedHashes

```solidity
mapping(bytes32 => bool) EIP1271SignedHashes
```

### setEIP1271SignedHash

```solidity
function setEIP1271SignedHash(bytes32 _hash, bool isValid) external virtual
```

_Set a hash of an call to be validated using EIP1271_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _hash | bytes32 | The EIP1271 hash to be added or removed |
| isValid | bool | If the hash is valid or not |

### getEIP1271SignedHash

```solidity
function getEIP1271SignedHash(bytes32 _hash) external view virtual returns (bool)
```

_Gets the validity of a EIP1271 hash_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _hash | bytes32 | The EIP1271 hash |

### isValidSignature

```solidity
function isValidSignature(bytes32 hash, bytes signature) external view returns (bytes4 magicValue)
```

_Get if the hash and signature are valid EIP1271 signatures_

