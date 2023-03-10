# Solidity API

## DAOController

_A controller controls and connect the organizations schemes, reputation and avatar.
The schemes execute proposals through the controller to the avatar.
Each scheme has it own parameters and operation permissions._

### Scheme

```solidity
struct Scheme {
  bytes32 paramsHash;
  bool canManageSchemes;
  bool canMakeAvatarCalls;
  bool canChangeReputation;
}
```

### ProposalAndScheme

```solidity
struct ProposalAndScheme {
  bytes32 proposalId;
  address scheme;
}
```

### schemeOfProposal

```solidity
mapping(bytes32 => address) schemeOfProposal
```

Mapping that return scheme address for the given proposal ID

### schemes

```solidity
mapping(address => struct DAOController.Scheme) schemes
```

Mapping that return scheme struct for the given scheme address

### reputationToken

```solidity
contract DAOReputation reputationToken
```

The non-transferable ERC20 token that will be used as voting power

### schemesWithManageSchemesPermission

```solidity
uint256 schemesWithManageSchemesPermission
```

### RegisterScheme

```solidity
event RegisterScheme(address sender, address scheme)
```

Emited once scheme has been registered

### UnregisterScheme

```solidity
event UnregisterScheme(address sender, address scheme)
```

Emited once scheme has been unregistered

### DAOController__SenderNotRegistered

```solidity
error DAOController__SenderNotRegistered()
```

Sender is not a registered scheme

### DAOController__SenderCannotManageSchemes

```solidity
error DAOController__SenderCannotManageSchemes()
```

Sender cannot manage schemes

### DAOController__SenderCannotPerformAvatarCalls

```solidity
error DAOController__SenderCannotPerformAvatarCalls()
```

Sender cannot perform avatar calls

### DAOController__SenderCannotChangeReputation

```solidity
error DAOController__SenderCannotChangeReputation()
```

Sender cannot change reputation

### DAOController__CannotDisableLastSchemeWithManageSchemesPermission

```solidity
error DAOController__CannotDisableLastSchemeWithManageSchemesPermission()
```

Cannot disable canManageSchemes property from the last scheme with manage schemes permissions

### DAOController__CannotUnregisterLastSchemeWithManageSchemesPermission

```solidity
error DAOController__CannotUnregisterLastSchemeWithManageSchemesPermission()
```

Cannot unregister last scheme with manage schemes permission

### DAOController__CannotRegisterSchemeWithNullParamsHash

```solidity
error DAOController__CannotRegisterSchemeWithNullParamsHash()
```

Cannot register a scheme with paramsHash 0

### DAOController__SenderIsNotTheProposer

```solidity
error DAOController__SenderIsNotTheProposer()
```

Sender is not the scheme that originally started the proposal

### DAOController__SenderIsNotRegisteredOrProposalIsInactive

```solidity
error DAOController__SenderIsNotRegisteredOrProposalIsInactive()
```

Sender is not a registered scheme or proposal is not active

### onlyRegisteringSchemes

```solidity
modifier onlyRegisteringSchemes()
```

_Verify if scheme can manage schemes_

### onlyAvatarCallScheme

```solidity
modifier onlyAvatarCallScheme()
```

_Verify if scheme can make avatar calls_

### onlyChangingReputation

```solidity
modifier onlyChangingReputation()
```

_Verify if scheme can change reputation_

### initialize

```solidity
function initialize(address scheme, address reputationTokenAddress, bytes32 paramsHash) public
```

_Initialize the Controller contract._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| scheme | address | The address of the scheme |
| reputationTokenAddress | address | The address of the reputation token |
| paramsHash | bytes32 | A hashed configuration of the usage of the default scheme created on initialization |

### registerScheme

```solidity
function registerScheme(address schemeAddress, bytes32 paramsHash, bool canManageSchemes, bool canMakeAvatarCalls, bool canChangeReputation) external returns (bool success)
```

_Register a scheme_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| schemeAddress | address | The address of the scheme |
| paramsHash | bytes32 | A hashed configuration of the usage of the scheme |
| canManageSchemes | bool | Whether the scheme is able to manage schemes |
| canMakeAvatarCalls | bool | Whether the scheme is able to make avatar calls |
| canChangeReputation | bool | Whether the scheme is able to change reputation |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | Success of the operation |

### unregisterScheme

```solidity
function unregisterScheme(address schemeAddress) external returns (bool success)
```

_Unregister a scheme_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| schemeAddress | address | The address of the scheme to unregister/delete from `schemes` mapping |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | Success of the operation |

### avatarCall

```solidity
function avatarCall(address to, bytes data, contract DAOAvatar avatar, uint256 value) external returns (bool callSuccess, bytes callData)
```

_Perform a generic call to an arbitrary contract_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to | address | The contract's address to call |
| data | bytes | ABI-encoded contract call to call `_contract` address. |
| avatar | contract DAOAvatar | The controller's avatar address |
| value | uint256 | Value (ETH) to transfer with the transaction |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| callSuccess | bool | Whether call was executed successfully or not |
| callData | bytes | Call data returned |

### burnReputation

```solidity
function burnReputation(uint256 amount, address account) external returns (bool success)
```

_Burns dao reputation_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The amount of reputation to burn |
| account | address | The account to burn reputation from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are burned correctly |

### mintReputation

```solidity
function mintReputation(uint256 amount, address account) external returns (bool success)
```

_Mints dao reputation_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The amount of reputation to mint |
| account | address | The account to mint reputation from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are generated correctly |

### transferReputationOwnership

```solidity
function transferReputationOwnership(address newOwner) external
```

_Transfer ownership of dao reputation_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newOwner | address | The new owner of the reputation token |

### getSchemeParameters

```solidity
function getSchemeParameters(address scheme) external view returns (bytes32 paramsHash)
```

_Returns scheme paramsHash_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| scheme | address | The address of the scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| paramsHash | bytes32 | scheme.paramsHash |

### getSchemeCanManageSchemes

```solidity
function getSchemeCanManageSchemes(address scheme) external view returns (bool canManageSchemes)
```

_Returns if scheme can manage schemes_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| scheme | address | The address of the scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| canManageSchemes | bool | scheme.canManageSchemes |

### getSchemeCanMakeAvatarCalls

```solidity
function getSchemeCanMakeAvatarCalls(address scheme) external view returns (bool canMakeAvatarCalls)
```

_Returns if scheme can make avatar calls_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| scheme | address | The address of the scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| canMakeAvatarCalls | bool | scheme.canMakeAvatarCalls |

### getSchemeCanChangeReputation

```solidity
function getSchemeCanChangeReputation(address scheme) external view returns (bool canChangeReputation)
```

_Returns if scheme can change reputation_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| scheme | address | The address of the scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| canChangeReputation | bool | scheme.canChangeReputation |

### getSchemesWithManageSchemesPermissionsCount

```solidity
function getSchemesWithManageSchemesPermissionsCount() external view returns (uint256 schemesWithManageSchemesPermissionCount)
```

_Returns the amount of schemes with manage schemes permission_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| schemesWithManageSchemesPermissionCount | uint256 | Schemes with manage schemes permission count |

### getDaoReputation

```solidity
function getDaoReputation() external view returns (contract DAOReputation tokenAddress)
```

_Function to get reputation token_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAddress | contract DAOReputation | The reputation token set on controller.initialize |

