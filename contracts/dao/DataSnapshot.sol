// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/utils/ArraysUpgradeable.sol";

/**
 * @dev Inspired in ERC20Snapshot from openzeppelin
 **/

contract DataSnapshot {
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
        _snapshotIds[_account].push(_currentSnapshotId);
        emit Snapshot(currentId);
        return currentId;
    }

    function _lastRegisteredSnapshotIdAt(uint256 _snapshotId, address _account) internal view returns (uint256) {
        require(_snapshotId > 0, "ERC20Snapshot: id is 0");
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
        // In summary, we need to find an element in an array, returning the index of the smallest value that is larger if
        // it is not found, unless said value doesn't exist (e.g. when all values are smaller). Arrays.findUpperBound does
        // exactly this.

        uint256 index = _snapshotIds[_account].findUpperBound(_snapshotId);

        if (index == _snapshotIds[_account].length) {
            return _snapshotIds[_account][index - 1];
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
}
