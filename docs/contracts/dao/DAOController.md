# Solidity API

## DAOController

_A controller controls and connect the organizations schemes, reputation and avatar.
The schemes execute proposals through the controller to the avatar.
Each scheme has it own parameters and operation permissions._

### activeProposals

```solidity
struct EnumerableSetUpgradeable.Bytes32Set activeProposals
```

### inactiveProposals

```solidity
struct EnumerableSetUpgradeable.Bytes32Set inactiveProposals
```

### Scheme

```solidity
struct Scheme {
  bytes32 paramsHash;
  bool isRegistered;
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
event RegisterScheme(address _sender, address _scheme)
```

Emited once scheme has been registered

### UnregisterScheme

```solidity
event UnregisterScheme(address _sender, address _scheme)
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

### DAOController__IdUsedByOtherScheme

```solidity
error DAOController__IdUsedByOtherScheme()
```

arg _proposalId is being used by other scheme

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

### DAOController__StartCannotBeBiggerThanListLength

```solidity
error DAOController__StartCannotBeBiggerThanListLength()
```

arg _start cannot be bigger than proposals list length

### DAOController__EndCannotBeBiggerThanListLength

```solidity
error DAOController__EndCannotBeBiggerThanListLength()
```

arg _end cannot be bigger than proposals list length

### DAOController__StartCannotBeBiggerThanEnd

```solidity
error DAOController__StartCannotBeBiggerThanEnd()
```

arg _start cannot be bigger than _end

### onlyRegisteredScheme

```solidity
modifier onlyRegisteredScheme()
```

_Verify if scheme is registered_

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
function initialize(address _scheme, address _reputationToken, bytes32 _paramsHash) public
```

_Initialize the Controller contract._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _scheme | address | The address of the scheme |
| _reputationToken | address | The address of the reputation token |
| _paramsHash | bytes32 | A hashed configuration of the usage of the default scheme created on initialization |

### registerScheme

```solidity
function registerScheme(address _scheme, bytes32 _paramsHash, bool _canManageSchemes, bool _canMakeAvatarCalls, bool _canChangeReputation) external returns (bool success)
```

_Register a scheme_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _scheme | address | The address of the scheme |
| _paramsHash | bytes32 | A hashed configuration of the usage of the scheme |
| _canManageSchemes | bool | Whether the scheme is able to manage schemes |
| _canMakeAvatarCalls | bool | Whether the scheme is able to make avatar calls |
| _canChangeReputation | bool | Whether the scheme is able to change reputation |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | Success of the operation |

### unregisterScheme

```solidity
function unregisterScheme(address _scheme) external returns (bool success)
```

_Unregister a scheme_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _scheme | address | The address of the scheme to unregister/delete from `schemes` mapping |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | Success of the operation |

### avatarCall

```solidity
function avatarCall(address _contract, bytes _data, contract DAOAvatar _avatar, uint256 _value) external returns (bool success, bytes data)
```

_Perform a generic call to an arbitrary contract_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contract | address | The contract's address to call |
| _data | bytes | ABI-encoded contract call to call `_contract` address. |
| _avatar | contract DAOAvatar | The controller's avatar address |
| _value | uint256 | Value (ETH) to transfer with the transaction |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | Whether call was executed successfully or not |
| data | bytes | Call data returned |

### startProposal

```solidity
function startProposal(bytes32 _proposalId) external
```

_Adds a proposal to the active proposals list_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _proposalId | bytes32 | The proposalId |

### endProposal

```solidity
function endProposal(bytes32 _proposalId) external
```

_Moves a proposal from the active proposals list to the inactive list_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _proposalId | bytes32 | The proposalId |

### burnReputation

```solidity
function burnReputation(uint256 _amount, address _account) external returns (bool success)
```

_Burns dao reputation_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | The amount of reputation to burn |
| _account | address | The account to burn reputation from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are burned correctly |

### mintReputation

```solidity
function mintReputation(uint256 _amount, address _account) external returns (bool success)
```

_Mints dao reputation_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | The amount of reputation to mint |
| _account | address | The account to mint reputation from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are generated correctly |

### transferReputationOwnership

```solidity
function transferReputationOwnership(address _newOwner) external
```

_Transfer ownership of dao reputation_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newOwner | address | The new owner of the reputation token |

### isSchemeRegistered

```solidity
function isSchemeRegistered(address _scheme) external view returns (bool isRegistered)
```

_Return whether a scheme is registered or not_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _scheme | address | The address of the scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| isRegistered | bool | Whether a scheme is registered or not |

### getSchemeParameters

```solidity
function getSchemeParameters(address _scheme) external view returns (bytes32 paramsHash)
```

_Return scheme paramsHash_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _scheme | address | The address of the scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| paramsHash | bytes32 | scheme.paramsHash |

### getSchemeCanManageSchemes

```solidity
function getSchemeCanManageSchemes(address _scheme) external view returns (bool canManageSchemes)
```

_Return if scheme can manage schemes_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _scheme | address | The address of the scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| canManageSchemes | bool | scheme.canManageSchemes |

### getSchemeCanMakeAvatarCalls

```solidity
function getSchemeCanMakeAvatarCalls(address _scheme) external view returns (bool canMakeAvatarCalls)
```

_Return if scheme can make avatar calls_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _scheme | address | The address of the scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| canMakeAvatarCalls | bool | scheme.canMakeAvatarCalls |

### getSchemeCanChangeReputation

```solidity
function getSchemeCanChangeReputation(address _scheme) external view returns (bool canChangeReputation)
```

_Return if scheme can change reputation_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _scheme | address | The address of the scheme |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| canChangeReputation | bool | scheme.canChangeReputation |

### getSchemesWithManageSchemesPermissionsCount

```solidity
function getSchemesWithManageSchemesPermissionsCount() external view returns (uint256 schemesWithManageSchemesPermissionCount)
```

_Return the amount of schemes with manage schemes permission_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| schemesWithManageSchemesPermissionCount | uint256 | Schemes with manage schemes permission count |

### _isSchemeRegistered

```solidity
function _isSchemeRegistered(address _scheme) private view returns (bool)
```

### _getProposalsBatchRequest

```solidity
function _getProposalsBatchRequest(uint256 _start, uint256 _end, struct EnumerableSetUpgradeable.Bytes32Set _proposals) internal view returns (struct DAOController.ProposalAndScheme[] proposalsArray)
```

_Returns array of proposals based on index args. Both indexes are inclusive, unles (0,0) that returns all elements_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _start | uint256 | Index to start batching (included). |
| _end | uint256 | Last index of batch (included). Zero will default to last element from the list |
| _proposals | struct EnumerableSetUpgradeable.Bytes32Set | EnumerableSetUpgradeable set of proposals |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalsArray | struct DAOController.ProposalAndScheme[] | Proposals list from `_proposals` within the range `_start` to `_end`. |

### getActiveProposals

```solidity
function getActiveProposals(uint256 _start, uint256 _end) external view returns (struct DAOController.ProposalAndScheme[] activeProposalsArray)
```

_Returns array of active proposals_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _start | uint256 | Index to start batching (included). |
| _end | uint256 | Last index of batch (included). Zero will return all |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeProposalsArray | struct DAOController.ProposalAndScheme[] | List of (`ProposalAndScheme`) active proposals within the range `_start` to `_end`.. |

### getInactiveProposals

```solidity
function getInactiveProposals(uint256 _start, uint256 _end) external view returns (struct DAOController.ProposalAndScheme[] inactiveProposalsArray)
```

_Returns array of inactive proposals_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _start | uint256 | index to start batching (included). |
| _end | uint256 | last index of batch (included). Zero will return all |

### getDaoReputation

```solidity
function getDaoReputation() external view returns (contract DAOReputation tokenAddress)
```

_Function to get reputation token_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAddress | contract DAOReputation | The reputation token set on controller.initialize |

### getActiveProposalsCount

```solidity
function getActiveProposalsCount() public view returns (uint256 activeProposalsCount)
```

_Function to get the amount of active proposals_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| activeProposalsCount | uint256 | The amount of active proposals |

### getInactiveProposalsCount

```solidity
function getInactiveProposalsCount() public view returns (uint256 inactiveProposalsCount)
```

_Function to get the amount of inactive proposals_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| inactiveProposalsCount | uint256 | The amount of inactive proposals |

