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

### getEIP1271SignedHash

```solidity
function getEIP1271SignedHash(bytes32 _hash) external view virtual returns (bool)
```

### isValidSignature

```solidity
function isValidSignature(bytes32 hash, bytes signature) external view returns (bytes4 magicValue)
```

_Should return whether the signature provided is valid for the provided data_

#### Parameters

| Name      | Type    | Description                                 |
| --------- | ------- | ------------------------------------------- |
| hash      | bytes32 | Hash of the data to be signed               |
| signature | bytes   | Signature byte array associated with \_data |
