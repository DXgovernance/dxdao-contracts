# Solidity API

## Scheme

_An abstract Scheme contract to be used as reference for any scheme implementation.
The Scheme is designed to work with a Voting Machine and allow a any amount of options and calls to be executed.
Each proposal contains a list of options, and each option a list of calls, each call has (to, data and value).
The options should have the same amount of calls, and all those calls are sent in arrays on the proposeCalls function.
The option 1 is always the default negative option, to vote against a proposal the vote goes on option 1.
A minimum of two options is required, where 1 == NO and 2 == YES.
Any options that are not 1 can be used for positive decisions with different calls to execute.
The calls that will be executed are the ones that located in the batch of calls of the winner option.
If there is 10 calls and 2 options it means that the 10 calls would be executed if option 2 wins.
if there is 10 calls and 3 options it means that if options 2 wins it will execute calls [0,4] and in case option 3 wins it will execute calls [5,9].
When a proposal is created it is registered in the voting machine.
Once the governance process ends on the voting machine the voting machine can execute the proposal winning option.
If the wining option cant be executed successfully, it can be finished without execution once the maxTimesForExecution time passes._

### ProposalState

```solidity
enum ProposalState {
  None,
  Submitted,
  Rejected,
  Passed
}
```

### Proposal

```solidity
struct Proposal {
  address[] to;
  bytes[] callData;
  uint256[] value;
  uint256 totalOptions;
  enum Scheme.ProposalState state;
  string title;
  string descriptionHash;
  uint256 submittedTime;
}
```

### proposals

```solidity
mapping(bytes32 => struct Scheme.Proposal) proposals
```

### proposalsList

```solidity
bytes32[] proposalsList
```

### avatar

```solidity
contract DAOAvatar avatar
```

### permissionRegistry

```solidity
contract PermissionRegistry permissionRegistry
```

### schemeName

```solidity
string schemeName
```

### maxRepPercentageChange

```solidity
uint256 maxRepPercentageChange
```

### executingProposal

```solidity
bool executingProposal
```

Boolean that is true when is executing a proposal, to avoid re-entrancy attacks.

### ProposalStateChange

```solidity
event ProposalStateChange(bytes32 proposalId, uint256 state)
```

### Scheme__CannotInitTwice

```solidity
error Scheme__CannotInitTwice()
```

Emitted when its initialized twice

### Scheme__AvatarAddressCannotBeZero

```solidity
error Scheme__AvatarAddressCannotBeZero()
```

Emitted if avatar address is zero

### Scheme__ControllerAddressCannotBeZero

```solidity
error Scheme__ControllerAddressCannotBeZero()
```

Emitted if controller address is zero

### Scheme_InvalidParameterArrayLength

```solidity
error Scheme_InvalidParameterArrayLength()
```

to, callData and value must have all the same length

### Scheme__InvalidTotalOptionsOrActionsCallsLength

```solidity
error Scheme__InvalidTotalOptionsOrActionsCallsLength()
```

Emitted when the totalOptions paramers is invalid

### Scheme__ProposalExecutionAlreadyRunning

```solidity
error Scheme__ProposalExecutionAlreadyRunning()
```

Emitted when the proposal is already being executed

### Scheme__ProposalMustBeSubmitted

```solidity
error Scheme__ProposalMustBeSubmitted()
```

Emitted when the proposal isn't submitted

### Scheme__CallFailed

```solidity
error Scheme__CallFailed(string reason)
```

Emitted when the call failed. Returns the revert error

### Scheme__MaxRepPercentageChangePassed

```solidity
error Scheme__MaxRepPercentageChangePassed()
```

Emitted when the maxRepPercentageChange is exceeded

### Scheme__ERC20LimitsPassed

```solidity
error Scheme__ERC20LimitsPassed()
```

Emitted if the ERC20 limits are exceeded

### initialize

```solidity
function initialize(address payable avatarAddress, address votingMachineAddress, address controllerAddress, address permissionRegistryAddress, string _schemeName, uint256 _maxRepPercentageChange) external
```

_Initialize Scheme contract_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| avatarAddress | address payable | The avatar address |
| votingMachineAddress | address | The voting machine address |
| controllerAddress | address | The controller address |
| permissionRegistryAddress | address | The address of the permission registry contract |
| _schemeName | string | The name of the scheme |
| _maxRepPercentageChange | uint256 | The maximum percentage allowed to be changed in REP total supply after proposal execution |

### proposeCalls

```solidity
function proposeCalls(address[] to, bytes[] callData, uint256[] value, uint256 totalOptions, string title, string descriptionHash) public virtual returns (bytes32 proposalId)
```

_Propose calls to be executed, the calls have to be allowed by the permission registry_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to | address[] | The addresses to call |
| callData | bytes[] | The abi encode data for the calls |
| value | uint256[] | Value (ETH) to transfer with the calls |
| totalOptions | uint256 | The amount of options to be voted on |
| title | string | Title of proposal |
| descriptionHash | string | Proposal description hash |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | ID which represents the proposal |

### executeProposal

```solidity
function executeProposal(bytes32 proposalId, uint256 winningOption) public virtual returns (bool success)
```

_Execution of proposals, can only be called by the voting machine in which the vote is held._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The ID of the voting in the voting machine |
| winningOption | uint256 | The winning option in the voting machine |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | Success of the execution |

### finishProposal

```solidity
function finishProposal(bytes32 proposalId, uint256 winningOption) public virtual returns (bool success)
```

_Finish a proposal and set the final state in storage_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The ID of the voting in the voting machine |
| winningOption | uint256 | The winning option in the voting machine |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | Proposal finish successfully |

### getProposal

```solidity
function getProposal(bytes32 proposalId) external view returns (struct Scheme.Proposal proposal)
```

_Get the information of a proposal by id_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The ID of the proposal |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposal | struct Scheme.Proposal | The proposal for given `proposalId` |

### getProposalByIndex

```solidity
function getProposalByIndex(uint256 proposalIndex) external view returns (struct Scheme.Proposal proposal)
```

_Get the information of a proposal by index_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalIndex | uint256 | The index of the proposal in the proposals list |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposal | struct Scheme.Proposal | The proposal located at given `proposalIndex` |

### getFuncSignature

```solidity
function getFuncSignature(bytes data) public pure returns (bytes4 functionSignature)
```

_Get call data signature_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| data | bytes | The bytes data of the data to get the signature |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| functionSignature | bytes4 | The signature for given data hash |

### getOrganizationProposalsLength

```solidity
function getOrganizationProposalsLength() external view returns (uint256 proposalsLength)
```

_Get the proposals length_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalsLength | uint256 | The amount of proposals |

### getOrganizationProposals

```solidity
function getOrganizationProposals() external view returns (bytes32[] proposalsIds)
```

_Get the proposals ids_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalsIds | bytes32[] | List containing all proposals ids |

### getSchemeType

```solidity
function getSchemeType() external view virtual returns (string)
```

_Get the scheme type_

