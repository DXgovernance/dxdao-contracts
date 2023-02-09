# Solidity API

## VotingPowerToken

_This contract provides a function to determine the balance (or voting power) of a specific holder based
     on the relative "weights" of two different ERC20SnapshotRep tokens: a Reputation token and a Staking token.
     The contract also includes the capability to manage the weights of the underlying tokens, determining the
     percentage that each token should represent of the total balance amount at the moment of getting user balance.
     Additionally, the contract sets a minimum requirement for the amount of Staking tokens that must be locked
     in order to apply weight to the Staking token._

### repToken

```solidity
contract ERC20SnapshotRep repToken
```

### stakingToken

```solidity
contract ERC20SnapshotRep stakingToken
```

### minStakingTokensLocked

```solidity
uint256 minStakingTokensLocked
```

Minimum staking tokens locked to apply weight

### currentSnapshotId

```solidity
uint256 currentSnapshotId
```

### weights

```solidity
mapping(address => uint256) weights
```

### snapshots

```solidity
mapping(address => mapping(uint256 => uint256)) snapshots
```

### decimals

```solidity
uint256 decimals
```

### precision

```solidity
uint256 precision
```

### VotingPowerToken_InvalidTokenAddress

```solidity
error VotingPowerToken_InvalidTokenAddress()
```

Revert when using other address than stakingToken or repToken

### VotingPowerToken_ReptokenAndStakingTokenCannotBeEqual

```solidity
error VotingPowerToken_ReptokenAndStakingTokenCannotBeEqual()
```

Revert both repToken and stakingToken address are the same

### VotingPowerToken_InvalidSnapshotId

```solidity
error VotingPowerToken_InvalidSnapshotId()
```

SnapshotId provided is bigger than current snapshotId

### VotingPowerToken_InvalidTokenWeights

```solidity
error VotingPowerToken_InvalidTokenWeights()
```

Revert when weights composition is wrong

### VotingPowerToken_PercentCannotExeedMaxPercent

```solidity
error VotingPowerToken_PercentCannotExeedMaxPercent()
```

### onlyInternalTokens

```solidity
modifier onlyInternalTokens(address tokenAddress)
```

_Verify if address is one of rep or staking tokens_

### initialize

```solidity
function initialize(address _repToken, address _stakingToken, uint256 repWeight, uint256 stakingWeight, uint256 _minStakingTokensLocked) public virtual
```

### setMinStakingTokensLocked

```solidity
function setMinStakingTokensLocked(uint256 _minStakingTokensLocked) public
```

_Set Minimum staking tokens locked to apply staking token weight_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minStakingTokensLocked | uint256 | Minimum staking tokens locked to apply weight |

### setComposition

```solidity
function setComposition(uint256 repWeight, uint256 stakingWeight) public
```

_Update tokens weights_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| repWeight | uint256 | Weight of DAOReputation token |
| stakingWeight | uint256 | Weight of DXDStaking token |

### callback

```solidity
function callback() external
```

_function to be executed from rep and dxdStake tokens after mint/burn
It stores a reference to the rep/stake token snapshotId from internal snapshotId_

### balanceOf

```solidity
function balanceOf(address account) public view returns (uint256 votingPowerPercentage)
```

_Get the balance (voting power percentage) of `account` at current snapshotId
     Balance is expressed as percentage in base 1e+18
     1% == 1000000000000000000 | 500000000000000000_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | Account we want to get voting power from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| votingPowerPercentage | uint256 | The votingPower of `account` (0 to 100*precision) |

### balanceOfAt

```solidity
function balanceOfAt(address account, uint256 _snapshotId) public view returns (uint256 votingPowerPercentage)
```

_Get the balance (voting power percentage) of `account` at certain `_snapshotId`.
     Balance is expressed as percentage in base 1e+18
     1% == 1000000000000000000 | 500000000000000000_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | Account we want to get voting power from |
| _snapshotId | uint256 | VPToken SnapshotId we want get votingPower from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| votingPowerPercentage | uint256 | The votingPower of `account` (0 to 100*precision) |

### getTokenSnapshotIdFromVPSnapshot

```solidity
function getTokenSnapshotIdFromVPSnapshot(address tokenAddress, uint256 tokenSnapshotId) public view returns (uint256 snapshotId)
```

_Get the external token snapshotId for given VPToken snapshotId_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAddress | address | Address of the external token (rep/dxd) we want to get snapshotId from |
| tokenSnapshotId | uint256 | SnapshotId from VPToken |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| snapshotId | uint256 | SnapshotId from `tokenAddress` stored at VPToken `tokenSnapshotId` |

### getConfigTokenWeight

```solidity
function getConfigTokenWeight(address token) public view returns (uint256 weight)
```

_Get token weight from weights config mapping._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token we want to get weight from |

### getTokenWeight

```solidity
function getTokenWeight(address token) public view returns (uint256 weight)
```

_Get token weight from weights config mapping.
     If stakingToken supply > minStakingTokensLocked at the time of execution repWeight will default to 100%.
     If not it will retun internal weights config for given `token`_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token we want to get weight from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| weight | uint256 | Weight percentage value (0 to 100) |

### getPercent

```solidity
function getPercent(uint256 numerator, uint256 denominator) public pure returns (uint256 percent)
```

_Calculates the percentage of a `numerator` over a `denominator` multiplyed by precision_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| numerator | uint256 | The part being considered |
| denominator | uint256 | The total amount |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| percent | uint256 | The percentage of the numerator over the denominator * precision |

### getWeightedVotingPowerPercentage

```solidity
function getWeightedVotingPowerPercentage(uint256 weightPercent, uint256 votingPowerPercent) public pure returns (uint256 weightedVotingPowerPercentage)
```

_Calculates the weighted voting power percentage by multiplying the voting power
     percentage by the weight percent of the token_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| weightPercent | uint256 | Weight percent of the token (0 to 100) |
| votingPowerPercent | uint256 | Voting power percentage (0 to 100 * precision) |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| weightedVotingPowerPercentage | uint256 | Weighted voting power percentage (0 to 100 * precision) |

### getCurrentSnapshotId

```solidity
function getCurrentSnapshotId() public view returns (uint256 snapshotId)
```

_Get the current VPToken snapshotId_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| snapshotId | uint256 | Current VPToken snapshotId |

### totalSupply

```solidity
function totalSupply() external view returns (uint256 totalSupply)
```

_Returns the total supply_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalSupply | uint256 | 100% expressed in base 1e+18. |

### transfer

```solidity
function transfer(address to, uint256 amount) external returns (bool)
```

_Disabled transfer tokens, not needed in VotingPowerToken_

### allowance

```solidity
function allowance(address owner, address spender) external returns (uint256)
```

_Disabled allowance function, not needed in VotingPowerToken_

### approve

```solidity
function approve(address spender, uint256 amount) external returns (bool)
```

_Disabled approve function, not needed in VotingPowerToken_

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 amount) external returns (bool)
```

_Disabled transferFrom function, not needed in VotingPowerToken_

