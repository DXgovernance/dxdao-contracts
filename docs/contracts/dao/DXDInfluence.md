# Solidity API

## DXDInfluence

_Keeps track of the time commitment of accounts that have staked. The more DXD is staked and
the more time the DXD tokens are staked, the more influence the user will have on the DAO. The influence
formula is:
     influence = sum(stake.a.tc + stake.b.tc^k) over all stakes for a given account
               = a * sum(stake.tc) + b * sum(stake.tc^k)
     where:
         a: linearMultiplier      --> configurable by governance (signed 59.18-decimal fixed-point number).
         b: exponentialMultiplier --> configurable by governance (signed 59.18-decimal fixed-point number).
         k: exponent          --> constant set at initialization (unsigned 59.18-decimal fixed-point number).
         tc: time commitment  --> defined by the user at each stake.
         stake: tokens locked --> defined by the user at each stake.

In order to allow the governor to change the parameters of the formula, sum(stake.tc) and sum(stake.tc^k)
are stored for each snapshot and the influence balance is calculated on the fly when queried. Notice that
changes in the formula are retroactive in the sense that all snapshots balances will be updated when queried
if `a` and `b` change.

DXDInfluence notifies the Voting Power contract of any stake changes._

### FORMULA_SNAPSHOT_SLOT

```solidity
address FORMULA_SNAPSHOT_SLOT
```

### CumulativeStake

```solidity
struct CumulativeStake {
  uint256 linearElement;
  uint256 exponentialElement;
}
```

### FormulaMutableParams

```solidity
struct FormulaMutableParams {
  SD59x18 linearMultiplier;
  SD59x18 exponentialMultiplier;
}
```

### dxdStake

```solidity
contract DXDStake dxdStake
```

### votingPower

```solidity
contract VotingPower votingPower
```

### formulaMutableParams

```solidity
mapping(uint256 => struct DXDInfluence.FormulaMutableParams) formulaMutableParams
```

_influence formula parameters. formulaMutableParams[snapshotId]_

### exponent

```solidity
UD60x18 exponent
```

### cumulativeStakesSnapshots

```solidity
mapping(address => mapping(uint256 => struct DXDInfluence.CumulativeStake)) cumulativeStakesSnapshots
```

_cumulativeStakesSnapshots[account][snapshotId]
keeps track of the influence parameters of each account at the snapshot the account's stake was modified._

### totalStakeSnapshots

```solidity
mapping(uint256 => struct DXDInfluence.CumulativeStake) totalStakeSnapshots
```

_totalStakeSnapshots[snapshotId]
keeps track of the influence parameters of the total stake at each snapshot._

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(address _dxdStake, address _votingPower, int256 _linearMultiplier, int256 _exponentialMultiplier, uint256 _exponent) external
```

### changeFormula

```solidity
function changeFormula(int256 _linearMultiplier, int256 _exponentialMultiplier) external
```

_Changes the influence formula parameters. The owner modifying the formula parameters must make sure
that the parameters are safe, i.e. that the dxd influence space is bounded to positive values. Negative
influence values will make balanceOf(), balanceOfAt(), totalSupply() and totalSupplyAt() revert.
Influence should also be a monotonically non-decreasing function with respect to time. The longer a user
commits to stake, the greater the influence._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _linearMultiplier | int256 | Factor that will multiply the linear element of the influence. 18 decimals. |
| _exponentialMultiplier | int256 | Factor that will multiply the exponential element of the influence. 18 decimals. |

### mint

```solidity
function mint(address _account, uint256 _amount, uint256 _timeCommitment) external
```

_Mints influence tokens according to the amount staked and takes a snapshot. The influence value
is not stored, only the linear and exponential elements of the formula are updated, which are then used
to compute the influence on the fly in the balance and total supply getters._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Account that has staked the tokens. |
| _amount | uint256 | Amount of tokens to have been staked. |
| _timeCommitment | uint256 | Time that the user commits to lock the tokens. |

### burn

```solidity
function burn(address _account, uint256 _amount, uint256 _timeCommitment) external
```

_Burns influence tokens according to the amount withdrawn and takes a snapshot. The influence value
is not stored, only the linear and exponential elements of the formula are updated, which are then used
to compute the influence on the fly in the balance and total supply getters._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Account that has staked the tokens. |
| _amount | uint256 | Amount of tokens to have been staked. |
| _timeCommitment | uint256 | Time that the user commits to lock the tokens. |

### getLastCumulativeStake

```solidity
function getLastCumulativeStake(address _account) internal view returns (struct DXDInfluence.CumulativeStake)
```

_Returns the last snapshot Id registered for a given account._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Account that has staked. |

### totalSupply

```solidity
function totalSupply() public view returns (uint256)
```

_Returns the amount of influence in existence._

### totalSupplyAt

```solidity
function totalSupplyAt(uint256 snapshotId) public view returns (uint256)
```

_Retrieves the influence total supply at the time `snapshotId` was created._

### balanceOf

```solidity
function balanceOf(address account) public view returns (uint256)
```

_Returns the amount of influence owned by `account`._

### balanceOfAt

```solidity
function balanceOfAt(address account, uint256 snapshotId) public view returns (uint256)
```

_Retrieves the influence balance of `account` at the time `snapshotId` was created._

### calculateInfluence

```solidity
function calculateInfluence(struct DXDInfluence.CumulativeStake _cumulativeStake, uint256 _snapshotId) internal view returns (uint256)
```

_Calculates influence for the given cumulative stake data point._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _cumulativeStake | struct DXDInfluence.CumulativeStake | Accumulated stake information on a specific snapshot. |
| _snapshotId | uint256 | Id of the snapshot. |

### getFormulaMutableParamsAt

```solidity
function getFormulaMutableParamsAt(uint256 _snapshotId) public view returns (SD59x18, SD59x18)
```

_Retrieves the influence formula parameters at the time `_snapshotId` was created._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _snapshotId | uint256 | Id of the snapshot. |

### decimals

```solidity
function decimals() external pure returns (uint8)
```

_Returns the number of decimals used (only used for display purposes)_

