// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/utils/ArraysUpgradeable.sol";

/**
 * @dev Inspired in ERC20Snapshot from openzeppelin. Keeps track of which account has been updated at which snapshot.
 **/

contract AccountSnapshot {
    using ArraysUpgradeable for uint256[];

    mapping(address => uint256[]) internal _snapshotIds;

    // Snapshot ids increase monotonically, with the first value being 1. An id of 0 is invalid.
    uint256 private _currentSnapshotId;

    uint256[48] private __gap;

    /**
     * @dev Emitted by {_snapshot} when a snapshot identified by `id` is created.
     */
    event Snapshot(uint256 id);

    function _snapshot(address _account) internal returns (uint256 currentId) {
        unchecked {
            currentId = ++_currentSnapshotId;
        }
        _snapshotIds[_account].push(currentId);
        emit Snapshot(currentId);
        return currentId;
    }

    function _snapshot() internal returns (uint256 currentId) {
        unchecked {
            currentId = ++_currentSnapshotId;
        }
        emit Snapshot(currentId);
        return currentId;
    }

    function _lastRegisteredSnapshotIdAt(uint256 _snapshotId, address _account) internal view returns (uint256) {
        require(_snapshotId <= _currentSnapshotId, "ERC20Snapshot: nonexistent id");

        // When a valid snapshot is queried, there are three possibilities:
        //  a) The queried value was not modified after the snapshot was taken. Therefore, a snapshot entry was never
        //  created for this id, and all stored snapshot ids are smaller than the requested one. The value that corresponds
        //  to this id is the current one.
        //  b) The queried value was modified after the snapshot was taken. Therefore, there will be an entry with the
        //  requested id, and its value is the one to return.
        //  c) More snapshots were created after the requested one, and the queried value was later modified. There will be
        //  no entry for the requested id: the value that corresponds to it is that of the smallest snapshot id that is
        //  larger than the requested one.
        //
        // In summary, we need to find an element in an array, returning the index of the largest value that is smaller if
        // it is not found, unless said value doesn't exist (e.g. when all values are greater).

        uint256 index = findLowerBound(_snapshotIds[_account], _snapshotId);

        if (index == type(uint256).max) {
            return 0;
        } else {
            return _snapshotIds[_account][index];
        }
    }

    function _lastSnapshotId(address _account) internal view returns (uint256) {
        if (_snapshotIds[_account].length == 0) {
            return 0;
        } else {
            return _snapshotIds[_account][_snapshotIds[_account].length - 1];
        }
    }

    /// @dev Get the current snapshotId
    function getCurrentSnapshotId() public view returns (uint256) {
        return _currentSnapshotId;
    }

    /**
     * @dev Searches a sorted `array` and returns the greatest index that contains
     * a value smaller or equal to `element`. If no such index exists (i.e. all
     * values in the array are strictly bigger than `element`), type(uint256).max is
     * returned. Time complexity O(log n).
     *
     * `array` is expected to be sorted in ascending order, and to contain no
     * repeated elements.
     */
    function findLowerBound(uint256[] storage array, uint256 element) internal view returns (uint256) {
        uint256 low = 0;
        uint256 high = array.length;

        if (high == 0) {
            return type(uint256).max;
        }

        while (low < high) {
            uint256 mid = MathUpgradeable.average(low, high);

            // Note that mid will always be strictly less than high (i.e. it will be a valid array index)
            // because Math.average rounds down (it does integer division with truncation).
            if (unsafeAccess(array, mid).value > element) {
                high = mid;
            } else {
                unchecked {
                    low = mid + 1;
                }
            }
        }

        unchecked {
            return low - 1;
        }
    }

    struct Uint256Slot {
        uint256 value;
    }

    /**
     * @dev Access an array in an "unsafe" way. Skips solidity "index-out-of-range" check.
     *
     * WARNING: Only use if you are certain `pos` is lower than the array length.
     */
    function unsafeAccess(uint256[] storage arr, uint256 pos) internal pure returns (Uint256Slot storage value) {
        /// @solidity memory-safe-assembly
        assembly {
            mstore(0, arr.slot)
            value.slot := add(keccak256(0, 0x20), pos)
        }
    }
}
