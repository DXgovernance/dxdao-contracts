# Solidity API

## SnapshotRepERC20Guild

### proposalsSnapshots

```solidity
mapping(bytes32 => uint256) proposalsSnapshots
```

### initialize

```solidity
function initialize(address _token, uint256 _proposalTime, uint256 _timeForExecution, uint256 _votingPowerPercentageForProposalExecution, uint256 _votingPowerPercentageForProposalCreation, string _name, uint256 _voteGas, uint256 _maxGasPrice, uint256 _maxActiveProposals, uint256 _lockTime, address _permissionRegistry) public
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address |  |
| _proposalTime | uint256 |  |
| _timeForExecution | uint256 |  |
| _votingPowerPercentageForProposalExecution | uint256 |  |
| _votingPowerPercentageForProposalCreation | uint256 | The percentage of voting power in base 10000 needed to create a proposal |
| _name | string | The name of the ERC20Guild |
| _voteGas | uint256 | The amount of gas in wei unit used for vote refunds |
| _maxGasPrice | uint256 | The maximum gas price used for vote refunds |
| _maxActiveProposals | uint256 | The maximum amount of proposals to be active at the same time |
| _lockTime | uint256 | The minimum amount of seconds that the tokens would be locked |
| _permissionRegistry | address | The address of the permission registry contract to be used |

### setVote

```solidity
function setVote(bytes32 proposalId, uint256 option, uint256 votingPower) public virtual
```

_Set the voting power to vote in a proposal_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to set the vote |
| option | uint256 | The proposal option to be voted |
| votingPower | uint256 | The votingPower to use in the proposal |

### setSignedVote

```solidity
function setSignedVote(bytes32 proposalId, uint256 option, uint256 votingPower, address voter, bytes signature) public virtual
```

_Set the voting power to vote in a proposal using a signed vote_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to set the vote |
| option | uint256 | The proposal option to be voted |
| votingPower | uint256 | The votingPower to use in the proposal |
| voter | address | The address of the voter |
| signature | bytes | The signature of the hashed vote |

### lockTokens

```solidity
function lockTokens(uint256) external virtual
```

_Override and disable lock of tokens, not needed in SnapshotRepERC20Guild_

### withdrawTokens

```solidity
function withdrawTokens(uint256) external virtual
```

_Override and disable withdraw of tokens, not needed in SnapshotRepERC20Guild_

### createProposal

```solidity
function createProposal(address[] to, bytes[] data, uint256[] value, uint256 totalOptions, string title, string contentHash) public virtual returns (bytes32)
```

_Create a proposal with an static call data and extra information_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to | address[] | The receiver addresses of each call to be executed |
| data | bytes[] | The data to be executed on each call to be executed |
| value | uint256[] | The ETH value to be sent on each call to be executed |
| totalOptions | uint256 | The amount of options that would be offered to the voters |
| title | string | The title of the proposal |
| contentHash | string | The content hash of the content reference of the proposal for the proposal to be executed |

### endProposal

```solidity
function endProposal(bytes32 proposalId) public virtual
```

_Executes a proposal that is not votable anymore and can be finished_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| proposalId | bytes32 | The id of the proposal to be executed |

### votingPowerOfMultipleAt

```solidity
function votingPowerOfMultipleAt(address[] accounts, uint256[] snapshotIds) external view virtual returns (uint256[])
```

_Get the voting power of multiple addresses at a certain snapshotId_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The addresses of the accounts |
| snapshotIds | uint256[] | The snapshotIds to be used |

### votingPowerOfAt

```solidity
function votingPowerOfAt(address account, uint256 snapshotId) public view virtual returns (uint256)
```

_Get the voting power of an address at a certain snapshotId_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account |
| snapshotId | uint256 | The snapshotId to be used |

### votingPowerOf

```solidity
function votingPowerOf(address account) public view virtual returns (uint256)
```

_Get the voting power of an account_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account |

### getProposalSnapshotId

```solidity
function getProposalSnapshotId(bytes32 proposalId) public view returns (uint256)
```

_Get the proposal snapshot id_

### getTotalLocked

```solidity
function getTotalLocked() public view virtual returns (uint256)
```

_Get the totalLocked_

### getSnapshotVotingPowerForProposalExecution

```solidity
function getSnapshotVotingPowerForProposalExecution(bytes32 proposalId) public view virtual returns (uint256)
```

_Get minimum amount of votingPower needed for proposal execution_

