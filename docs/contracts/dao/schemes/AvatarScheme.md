# Solidity API

## AvatarScheme

_An implementation of Scheme where the scheme has only 2 options and execute calls from the avatar.
Option 1 will mark the proposal as rejected and not execute any calls.
Option 2 will execute all the calls that where submitted in the proposeCalls._

### AvatarScheme\_\_ProposalExecutionAlreadyRunning

```solidity
error AvatarScheme__ProposalExecutionAlreadyRunning()
```

Emitted when the proposal is already being executed

### AvatarScheme\_\_ProposalMustBeSubmitted

```solidity
error AvatarScheme__ProposalMustBeSubmitted()
```

Emitted when the proposal wasn't submitted

### AvatarScheme\_\_SetEthPermissionUsedFailed

```solidity
error AvatarScheme__SetEthPermissionUsedFailed()
```

Emitted when the call to setETHPermissionUsed fails

### AvatarScheme\_\_AvatarCallFailed

```solidity
error AvatarScheme__AvatarCallFailed(string reason)
```

Emitted when the avatarCall failed. Returns the revert error

### AvatarScheme\_\_MaxRepPercentageChangePassed

```solidity
error AvatarScheme__MaxRepPercentageChangePassed()
```

Emitted when exceeded the maximum rep supply % change

### AvatarScheme\_\_ERC20LimitsPassed

```solidity
error AvatarScheme__ERC20LimitsPassed()
```

Emitted when ERC20 limits passed

### AvatarScheme\_\_TotalOptionsMustBeTwo

```solidity
error AvatarScheme__TotalOptionsMustBeTwo()
```

Emitted if the number of totalOptions is not 2

### proposeCalls

```solidity
function proposeCalls(address[] _to, bytes[] _callData, uint256[] _value, uint256 _totalOptions, string _title, string _descriptionHash) public returns (bytes32 proposalId)
```

_Propose calls to be executed, the calls have to be allowed by the permission registry_

#### Parameters

| Name              | Type      | Description                           |
| ----------------- | --------- | ------------------------------------- |
| \_to              | address[] | - The addresses to call               |
| \_callData        | bytes[]   | - The abi encode data for the calls   |
| \_value           | uint256[] | value(ETH) to transfer with the calls |
| \_totalOptions    | uint256   | The amount of options to be voted on  |
| \_title           | string    | title of proposal                     |
| \_descriptionHash | string    | proposal description hash             |

#### Return Values

| Name       | Type    | Description                      |
| ---------- | ------- | -------------------------------- |
| proposalId | bytes32 | id which represents the proposal |

### executeProposal

```solidity
function executeProposal(bytes32 _proposalId, uint256 _winningOption) public returns (bool)
```

_execution of proposals, can only be called by the voting machine in which the vote is held._

#### Parameters

| Name            | Type    | Description                                |
| --------------- | ------- | ------------------------------------------ |
| \_proposalId    | bytes32 | the ID of the voting in the voting machine |
| \_winningOption | uint256 | The winning option in the voting machine   |

#### Return Values

| Name | Type | Description  |
| ---- | ---- | ------------ |
| [0]  | bool | bool success |

### getSchemeType

```solidity
function getSchemeType() external view returns (string)
```

_Get the scheme type_
