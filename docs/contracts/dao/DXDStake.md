# Solidity API

## DXDStake

_DXD wrapper contract. DXD tokens converted into DXDStake tokens get locked and are not transferable.
Users staking DXD in this contract decide for how much time their tokens will be locked. This stake commitment
cannot be undone unless early withdrawals are enabled by governance, in which case a penalty might apply.
How long users commit to stake is important, given that the more time tokens are staked, the more voting power
that user gets. The DXDStake influence on governance as a function of time is handled by the DXDInfluence contract.
How long tokens can be staked, is capped by `maxTimeCommitment`. This prevents users from abusing the governance
influence formula by staking small amounts of tokens for an infinite time._

### StakeCommitment

```solidity
struct StakeCommitment {
  uint256 commitmentEnd;
  uint256 timeCommitment;
  uint256 stake;
}
```

### BASIS_POINT_DIVISOR

```solidity
uint256 BASIS_POINT_DIVISOR
```

### dxd

```solidity
contract IERC20Upgradeable dxd
```

### dxdInfluence

```solidity
contract DXDInfluence dxdInfluence
```

### maxTimeCommitment

```solidity
uint256 maxTimeCommitment
```

### stakeCommitments

```solidity
mapping(address => struct DXDStake.StakeCommitment[]) stakeCommitments
```

### userActiveStakes

```solidity
mapping(address => uint256) userActiveStakes
```

### totalActiveStakes

```solidity
uint256 totalActiveStakes
```

### earlyWithdrawalsEnabled

```solidity
bool earlyWithdrawalsEnabled
```

### penaltyRecipient

```solidity
address penaltyRecipient
```

_a penalty might apply when withdrawing a stake early. The penalty will be sent to the  `penaltyRecipient`._

### earlyWithdrawalMinTime

```solidity
uint256 earlyWithdrawalMinTime
```

_basis points. If enabled, early withdrawals are allowed after a % of the commitment time has passed._

### earlyWithdrawalPenalty

```solidity
uint256 earlyWithdrawalPenalty
```

_basis points. A % of the tokens staked will be taken away for withdrawing early._

### DXDStake__NoTransfer

```solidity
error DXDStake__NoTransfer()
```

Error when trying to transfer reputation

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(address _dxd, address _dxdInfluence, address _owner, uint256 _maxTimeCommitment, string name, string symbol) external
```

### changeMaxTimeCommitment

```solidity
function changeMaxTimeCommitment(uint256 _maxTimeCommitment) external
```

_Changes the maximum time a stake can be committed. If time commitments are not capped, the
influence formula would be vulnerable to small stakes with nonsensically huge time commitments._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _maxTimeCommitment | uint256 | new maximum value for time commitments in seconds. |

### disableEarlyWithdrawal

```solidity
function disableEarlyWithdrawal() external
```

_Disables early withdrawals of stake commitments that have not finalized yet._

### enableEarlyWithdrawal

```solidity
function enableEarlyWithdrawal(uint256 _minTime, uint256 _penalty, address _recipient) external
```

_Enables early withdrawals of stake commitments that have not finalized yet._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minTime | uint256 | Percentage, expressed in basis points, after which a stake commitment can be withdrawn. |
| _penalty | uint256 | Percentage, expressed in basis points, that will be taken from the stake as penalty. |
| _recipient | address | Recipient of the penalty. |

### changeInfluenceFormula

```solidity
function changeInfluenceFormula(int256 _linearFactor, int256 _exponentialFactor) external
```

_Changes the influence formula factors._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _linearFactor | int256 | Factor that will multiply the linear element of the DXD influence. 18 decimals. |
| _exponentialFactor | int256 | Factor that will multiply the exponential element of the DXD influence. 18 decimals. |

### _transfer

```solidity
function _transfer(address sender, address recipient, uint256 amount) internal virtual
```

_Do not allow the transfer of tokens._

### stake

```solidity
function stake(uint256 _amount, uint256 _timeCommitment) external
```

_Stakes tokens from the user._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | Amount of tokens to stake. |
| _timeCommitment | uint256 | Time that the user commits to lock the tokens in this staking contract. |

### increaseCommitmentTime

```solidity
function increaseCommitmentTime(uint256 _commitmentId, uint256 _newTimeCommitment) external
```

_Updates an existing commitment. The stake remains the same, but the time period is updated.
The influence is calculated according to the new time commited, not the original one._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _commitmentId | uint256 | Id of the commitment. The Id is an incremental variable for each account. |
| _newTimeCommitment | uint256 | Time that the user commits to lock the token in this staking contract. |

### withdraw

```solidity
function withdraw(address _account, uint256 _commitmentId) external
```

_Withdraws the tokens to the user._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Account that has staked. |
| _commitmentId | uint256 | Id of the commitment. The Id is an incremental variable for each account. |

### earlyWithdraw

```solidity
function earlyWithdraw(uint256 _commitmentId) external
```

_Withdraws the tokens to the user before the commitment is finalized,
if early withdrawals was previously enabled by governance. A penalty might apply if set._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _commitmentId | uint256 | Id of the commitment. The Id is an incremental variable for each account. |

### _withdraw

```solidity
function _withdraw(struct DXDStake.StakeCommitment _stakeCommitment, address _account) internal
```

### getAccountTotalStakes

```solidity
function getAccountTotalStakes(address _account) external view returns (uint256)
```

_Total stakes for the given address counting both active and withdrawn commitments._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Account that has staked. |

### getStakeCommitment

```solidity
function getStakeCommitment(address _account, uint256 _commitmentId) external view returns (struct DXDStake.StakeCommitment)
```

_Get a stake commitment data._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Account that has staked. |
| _commitmentId | uint256 | Id of the commitment. The Id is an incremental variable for each account. |

### getTotalStakes

```solidity
function getTotalStakes() external view returns (uint256)
```

_Get the amount of stakes ever, counting both active and inactive ones._

### getCurrentSnapshotId

```solidity
function getCurrentSnapshotId() external view returns (uint256)
```

_Get the current snapshotId_

