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

### schemeOfProposal

```solidity
mapping(bytes32 => address) schemeOfProposal
```

### ProposalAndScheme

```solidity
struct ProposalAndScheme {
  bytes32 proposalId;
  address scheme;
}

```

### reputationToken

```solidity
contract DAOReputation reputationToken
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

### schemes

```solidity
mapping(address => struct DAOController.Scheme) schemes
```

### schemesWithManageSchemesPermission

```solidity
uint256 schemesWithManageSchemesPermission
```

### RegisterScheme

```solidity
event RegisterScheme(address _sender, address _scheme)
```

### UnregisterScheme

```solidity
event UnregisterScheme(address _sender, address _scheme)
```

### DAOController\_\_SenderNotRegistered

```solidity
error DAOController__SenderNotRegistered()
```

Sender is not a registered scheme

### DAOController\_\_SenderCannotManageSchemes

```solidity
error DAOController__SenderCannotManageSchemes()
```

Sender cannot manage schemes

### DAOController\_\_SenderCannotPerformAvatarCalls

```solidity
error DAOController__SenderCannotPerformAvatarCalls()
```

Sender cannot perform avatar calls

### DAOController\_\_SenderCannotChangeReputation

```solidity
error DAOController__SenderCannotChangeReputation()
```

Sender cannot change reputation

### DAOController\_\_CannotDisableLastSchemeWithManageSchemesPermission

```solidity
error DAOController__CannotDisableLastSchemeWithManageSchemesPermission()
```

Cannot disable canManageSchemes property from the last scheme with manage schemes permissions

### DAOController\_\_CannotUnregisterLastSchemeWithManageSchemesPermission

```solidity
error DAOController__CannotUnregisterLastSchemeWithManageSchemesPermission()
```

Cannot unregister last scheme with manage schemes permission

### DAOController\_\_IdUsedByOtherScheme

```solidity
error DAOController__IdUsedByOtherScheme()
```

arg \_proposalId is being used by other scheme

### DAOController\_\_SenderIsNotTheProposer

```solidity
error DAOController__SenderIsNotTheProposer()
```

Sender is not the scheme that originally started the proposal

### DAOController\_\_SenderIsNotRegisteredOrProposalIsInactive

```solidity
error DAOController__SenderIsNotRegisteredOrProposalIsInactive()
```

Sender is not a registered scheme or proposal is not active

### DAOController\_\_StartCannotBeBiggerThanListLength

```solidity
error DAOController__StartCannotBeBiggerThanListLength()
```

arg \_start cannot be bigger than proposals list length

### DAOController\_\_EndCannotBeBiggerThanListLength

```solidity
error DAOController__EndCannotBeBiggerThanListLength()
```

arg \_end cannot be bigger than proposals list length

### DAOController\_\_StartCannotBeBiggerThanEnd

```solidity
error DAOController__StartCannotBeBiggerThanEnd()
```

arg \_start cannot be bigger than \_end

### initialize

```solidity
function initialize(address _scheme, address _reputationToken, bytes32 _paramsHash) public
```

### onlyRegisteredScheme

```solidity
modifier onlyRegisteredScheme()
```

### onlyRegisteringSchemes

```solidity
modifier onlyRegisteringSchemes()
```

### onlyAvatarCallScheme

```solidity
modifier onlyAvatarCallScheme()
```

### onlyChangingReputation

```solidity
modifier onlyChangingReputation()
```

### registerScheme

```solidity
function registerScheme(address _scheme, bytes32 _paramsHash, bool _canManageSchemes, bool _canMakeAvatarCalls, bool _canChangeReputation) external returns (bool)
```

_register a scheme_

#### Parameters

| Name                  | Type    | Description                                       |
| --------------------- | ------- | ------------------------------------------------- |
| \_scheme              | address | the address of the scheme                         |
| \_paramsHash          | bytes32 | a hashed configuration of the usage of the scheme |
| \_canManageSchemes    | bool    | whether the scheme is able to manage schemes      |
| \_canMakeAvatarCalls  | bool    | whether the scheme is able to make avatar calls   |
| \_canChangeReputation | bool    | whether the scheme is able to change reputation   |

#### Return Values

| Name | Type | Description                   |
| ---- | ---- | ----------------------------- |
| [0]  | bool | bool success of the operation |

### unregisterScheme

```solidity
function unregisterScheme(address _scheme) external returns (bool)
```

_unregister a scheme_

#### Parameters

| Name     | Type    | Description               |
| -------- | ------- | ------------------------- |
| \_scheme | address | the address of the scheme |

#### Return Values

| Name | Type | Description                   |
| ---- | ---- | ----------------------------- |
| [0]  | bool | bool success of the operation |

### avatarCall

```solidity
function avatarCall(address _contract, bytes _data, contract DAOAvatar _avatar, uint256 _value) external returns (bool, bytes)
```

_perform a generic call to an arbitrary contract_

#### Parameters

| Name       | Type               | Description                                            |
| ---------- | ------------------ | ------------------------------------------------------ |
| \_contract | address            | the contract's address to call                         |
| \_data     | bytes              | ABI-encoded contract call to call `_contract` address. |
| \_avatar   | contract DAOAvatar | the controller's avatar address                        |
| \_value    | uint256            | value (ETH) to transfer with the transaction           |

#### Return Values

| Name | Type  | Description                                                 |
| ---- | ----- | ----------------------------------------------------------- |
| [0]  | bool  | bool success                                                |
| [1]  | bytes | bytes the return value of the called \_contract's function. |

### startProposal

```solidity
function startProposal(bytes32 _proposalId) external
```

_Adds a proposal to the active proposals list_

#### Parameters

| Name         | Type    | Description    |
| ------------ | ------- | -------------- |
| \_proposalId | bytes32 | the proposalId |

### endProposal

```solidity
function endProposal(bytes32 _proposalId) external
```

_Moves a proposal from the active proposals list to the inactive list_

#### Parameters

| Name         | Type    | Description    |
| ------------ | ------- | -------------- |
| \_proposalId | bytes32 | the proposalId |

### burnReputation

```solidity
function burnReputation(uint256 _amount, address _account) external returns (bool)
```

_Burns dao reputation_

#### Parameters

| Name      | Type    | Description                         |
| --------- | ------- | ----------------------------------- |
| \_amount  | uint256 | the amount of reputation to burn    |
| \_account | address | the account to burn reputation from |

### mintReputation

```solidity
function mintReputation(uint256 _amount, address _account) external returns (bool)
```

_Mints dao reputation_

#### Parameters

| Name      | Type    | Description                         |
| --------- | ------- | ----------------------------------- |
| \_amount  | uint256 | the amount of reputation to mint    |
| \_account | address | the account to mint reputation from |

### transferReputationOwnership

```solidity
function transferReputationOwnership(address _newOwner) external
```

_Transfer ownership of dao reputation_

#### Parameters

| Name       | Type    | Description                           |
| ---------- | ------- | ------------------------------------- |
| \_newOwner | address | the new owner of the reputation token |

### isSchemeRegistered

```solidity
function isSchemeRegistered(address _scheme) external view returns (bool)
```

### getSchemeParameters

```solidity
function getSchemeParameters(address _scheme) external view returns (bytes32)
```

### getSchemeCanManageSchemes

```solidity
function getSchemeCanManageSchemes(address _scheme) external view returns (bool)
```

### getSchemeCanMakeAvatarCalls

```solidity
function getSchemeCanMakeAvatarCalls(address _scheme) external view returns (bool)
```

### getSchemeCanChangeReputation

```solidity
function getSchemeCanChangeReputation(address _scheme) external view returns (bool)
```

### getSchemesCountWithManageSchemesPermissions

```solidity
function getSchemesCountWithManageSchemesPermissions() external view returns (uint256)
```

### \_isSchemeRegistered

```solidity
function _isSchemeRegistered(address _scheme) private view returns (bool)
```

### \_getProposalsBatchRequest

```solidity
function _getProposalsBatchRequest(uint256 _start, uint256 _end, struct EnumerableSetUpgradeable.Bytes32Set _proposals) internal view returns (struct DAOController.ProposalAndScheme[] proposalsArray)
```

_Returns array of proposals based on index args. Both indexes are inclusive, unles (0,0) that returns all elements_

#### Parameters

| Name        | Type                                       | Description                                                                     |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| \_start     | uint256                                    | index to start batching (included).                                             |
| \_end       | uint256                                    | last index of batch (included). Zero will default to last element from the list |
| \_proposals | struct EnumerableSetUpgradeable.Bytes32Set | EnumerableSetUpgradeable set of proposals                                       |

#### Return Values

| Name           | Type                                     | Description          |
| -------------- | ---------------------------------------- | -------------------- |
| proposalsArray | struct DAOController.ProposalAndScheme[] | with proposals list. |

### getActiveProposals

```solidity
function getActiveProposals(uint256 _start, uint256 _end) external view returns (struct DAOController.ProposalAndScheme[] activeProposalsArray)
```

_Returns array of active proposals_

#### Parameters

| Name    | Type    | Description                                          |
| ------- | ------- | ---------------------------------------------------- |
| \_start | uint256 | index to start batching (included).                  |
| \_end   | uint256 | last index of batch (included). Zero will return all |

#### Return Values

| Name                 | Type                                     | Description                 |
| -------------------- | ---------------------------------------- | --------------------------- |
| activeProposalsArray | struct DAOController.ProposalAndScheme[] | with active proposals list. |

### getInactiveProposals

```solidity
function getInactiveProposals(uint256 _start, uint256 _end) external view returns (struct DAOController.ProposalAndScheme[] inactiveProposalsArray)
```

_Returns array of inactive proposals_

#### Parameters

| Name    | Type    | Description                                          |
| ------- | ------- | ---------------------------------------------------- |
| \_start | uint256 | index to start batching (included).                  |
| \_end   | uint256 | last index of batch (included). Zero will return all |

### getDaoReputation

```solidity
function getDaoReputation() external view returns (contract DAOReputation)
```

### getActiveProposalsCount

```solidity
function getActiveProposalsCount() public view returns (uint256)
```

_Returns the amount of active proposals_

### getInactiveProposalsCount

```solidity
function getInactiveProposalsCount() public view returns (uint256)
```

_Returns the amount of inactive proposals_
