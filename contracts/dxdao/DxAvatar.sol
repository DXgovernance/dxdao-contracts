// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
  @title DXAvatar
  @author github:miltontulli
  @dev An Avatar holds tokens, reputation and ether for a controller
*/

contract DXAvatar is OwnableUpgradeable {
    event CallExecuted(address indexed _to, bytes _data, uint256 _value, bool _success);

    function initialize(address _owner) public initializer {
        __Ownable_init();
        transferOwnership(_owner);
    }

    /**
     * @dev Perform a call to an arbitrary contract
     * @param _to  The contract's address to call
     * @param _data ABI-encoded contract call to call `_to` address.
     * @param _value Value (ETH) to transfer with the transaction
     * @return bool  Success or fail
     */
    function executeCall(
        address _to,
        bytes memory _data,
        uint256 _value
    ) public onlyOwner returns (bool) {
        (bool success, ) = _to.call{value: _value}(_data);
        emit CallExecuted(_to, _data, _value, success);
        return success;
    }
}
