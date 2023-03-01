# Solidity API

## AccountSnapshot

_Inspired in ERC20Snapshot from openzeppelin. Keeps track of which account has been updated at which snapshot._

### _snapshotIds

```solidity
mapping(address => uint256[]) _snapshotIds
```

### _currentSnapshotId

```solidity
uint256 _currentSnapshotId
```

### __gap

```solidity
uint256[48] __gap
```

### Snapshot

```solidity
event Snapshot(uint256 id)
```

_Emitted by {_snapshot} when a snapshot identified by `id` is created._

### _snapshot

```solidity
function _snapshot(address _account) internal returns (uint256 currentId)
```

### _lastRegisteredSnapshotIdAt

```solidity
function _lastRegisteredSnapshotIdAt(uint256 _snapshotId, address _account) internal view returns (uint256)
```

### _lastSnapshotId

```solidity
function _lastSnapshotId(address _account) internal view returns (uint256)
```

### getCurrentSnapshotId

```solidity
function getCurrentSnapshotId() public view returns (uint256)
```

_Get the current snapshotId_

### findLowerBound

```solidity
function findLowerBound(uint256[] array, uint256 element) internal view returns (uint256)
```

_Searches a sorted `array` and returns the greatest index that contains
a value smaller or equal to `element`. If no such index exists (i.e. all
values in the array are strictly bigger than `element`), type(uint256).max is
returned. Time complexity O(log n).

`array` is expected to be sorted in ascending order, and to contain no
repeated elements._

### Uint256Slot

```solidity
struct Uint256Slot {
  uint256 value;
}
```

### unsafeAccess

```solidity
function unsafeAccess(uint256[] arr, uint256 pos) internal pure returns (struct AccountSnapshot.Uint256Slot value)
```

_Access an array in an "unsafe" way. Skips solidity "index-out-of-range" check.

WARNING: Only use if you are certain `pos` is lower than the array length._

