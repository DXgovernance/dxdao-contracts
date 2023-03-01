# Solidity API

## VotingPower

_This contract provides a function to determine the balance (or voting power) of a specific holder based
     on the relative "weights" of two different ERC20SnapshotRep tokens: a DAOReputation token and a DXDInfluence token.
     The contract also includes the capability to manage the weights of the underlying tokens, determining the
     percentage that each token should represent of the total balance amount at the moment of getting user balance.
     Additionally, the contract sets a minimum requirement for the amount of DXDInfluence tokens that must be locked
     in order to apply weight to the DXDInfluence token._

### reputation

```solidity
address reputation
```

The reputation token that will be used as source of voting power

### influence

```solidity
address influence
```

The influence token that will be used as source of voting power

### weights

```solidity
mapping(address => mapping(uint256 => uint256)) weights
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

### VotingPower_InvalidTokenAddress

```solidity
error VotingPower_InvalidTokenAddress()
```

Revert when using other address than influence or reputation

### VotingPower_ReputationTokenAndInfluenceTokenCannotBeEqual

```solidity
error VotingPower_ReputationTokenAndInfluenceTokenCannotBeEqual()
```

Revert both reputation and influence address are the same

### VotingPower_InvalidSnapshotId

```solidity
error VotingPower_InvalidSnapshotId()
```

SnapshotId provided is bigger than current snapshotId

### VotingPower_InvalidTokenWeights

```solidity
error VotingPower_InvalidTokenWeights()
```

Revert when weights composition is wrong

### VotingPower_PercentCannotExeedMaxPercent

```solidity
error VotingPower_PercentCannotExeedMaxPercent()
```

### minStakingTokensLocked

```solidity
mapping(uint256 => uint256) minStakingTokensLocked
```

Minimum staking tokens locked to apply weight (snapshoted)

### SNAPSHOTS_SLOT

```solidity
address SNAPSHOTS_SLOT
```

### WEIGHTS_SLOT

```solidity
address WEIGHTS_SLOT
```

### MIN_STAKED_SLOT

```solidity
address MIN_STAKED_SLOT
```

### onlyInternalTokens

```solidity
modifier onlyInternalTokens(address tokenAddress)
```

_Verify if address is one of rep or staking tokens_

### initialize

```solidity
function initialize(address _reputation, address _dxdInfluence, uint256 repWeight, uint256 stakingWeight, uint256 _minStakingTokensLocked) public virtual
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
     1% == 1000000000000000000 | 0.5% == 500000000000000000_

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
function balanceOfAt(address account, uint256 snapshotId) public view returns (uint256 votingPowerPercentage)
```

_Get the balance (voting power percentage) of `account` at certain `_snapshotId`.
     Balance is expressed as percentage in base 1e+18
     1% == 1000000000000000000 | 0.5% == 500000000000000000_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | Account we want to get voting power from |
| snapshotId | uint256 | VPToken SnapshotId we want get votingPower from |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| votingPowerPercentage | uint256 | The votingPower of `account` (0 to 100*precision) |

### calculateVotingPower

```solidity
function calculateVotingPower(address account, uint256 _snapshotId) internal view returns (uint256 votingPower)
```

### getWeightOfAt

```solidity
function getWeightOfAt(address token, uint256 snapshotId) public view returns (uint256 weight)
```

_Get token weight from weights config mapping._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token we want to get weight from |
| snapshotId | uint256 |  |

### getTokenWeightAt

```solidity
function getTokenWeightAt(address token, uint256 snapshotId) public view returns (uint256 weight)
```

_Get token weight from weights config mapping.
     If influence supply > minStakingTokensLocked at given snapshotId, repWeight will default to 100%.
     If not it will retun internal weights config for given `token`_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token we want to get weight from |
| snapshotId | uint256 | VotingPower snapshotId |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| weight | uint256 | Weight percentage value (0 to 100) |

### getTokenWeight

```solidity
function getTokenWeight(address token) public view returns (uint256 weight)
```

_Get token weight from weights config mapping.
     If influence supply > minStakingTokensLocked at the time of execution repWeight will default to 100%.
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

### snapshotAt

```solidity
function snapshotAt(uint256 _snapshotId, address slot) internal view returns (uint256 snapshotId)
```

_Returns the last snapshotId stored for given `slot` based on `_snapshotId`_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _snapshotId | uint256 | VotingPower Snapshot ID |
| slot | address | Address used to emit snapshot. One of: SNAPSHOTS_SLOT, WEIGHTS_SLOT, MIN_STAKED_SLOT |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| snapshotId | uint256 | SnapshotId |

### getMinStakingTokensLockedAt

```solidity
function getMinStakingTokensLockedAt(uint256 _snapshotId) public view returns (uint256 _minStakingTokensLocked)
```

_Returns global minStakingTokensLocked at `_snapshotId`_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _snapshotId | uint256 | VotingPower Snapshot ID |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minStakingTokensLocked | uint256 | Minimum staking tokens locked to apply staking weight |

### getMinStakingTokensLocked

```solidity
function getMinStakingTokensLocked() public view returns (uint256 _minStakingTokensLocked)
```

_Returns global minStakingTokensLocked at currentSnapshotId_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minStakingTokensLocked | uint256 | Minimum staking tokens locked to apply staking weight |

### totalSupply

```solidity
function totalSupply() external pure returns (uint256 supply)
```

_Returns the total supply_

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| supply | uint256 | 100% expressed in base 1e+18. |

### totalSupplyAt

```solidity
function totalSupplyAt(uint256 snapshotId) external pure returns (uint256 supply)
```

### transfer

```solidity
function transfer(address to, uint256 amount) external pure returns (bool)
```

_Disabled transfer tokens, not needed in VotingPower_

### allowance

```solidity
function allowance(address owner, address spender) external pure returns (uint256)
```

_Disabled allowance function, not needed in VotingPower_

### approve

```solidity
function approve(address spender, uint256 amount) external pure returns (bool)
```

_Disabled approve function, not needed in VotingPower_

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 amount) external pure returns (bool)
```

_Disabled transferFrom function, not needed in VotingPower_

