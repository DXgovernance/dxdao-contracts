// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
  @title DXAvatar
  @author 
  @dev 
*/

contract DXAvatar is OwnableUpgradeable {
    event CallExecuted(address indexed _to, bytes _data, uint256 _value, bool _success);

    function initialize(address _owner) public initializer {
        __Ownable_init();
        // By default ownable init process assign sender as owner so we transfer the ownership to the received _owner
        super.transferOwnership(_owner);
    }

    fallback() external payable {}

    /**
     * @dev Perform a call to an arbitrary contract
     * @param _to  The contract's address to call
     * @param _data ABI-encoded contract call to call `_to` address.
     * @param _value Value (ETH) to transfer with the transaction
     * @return bool  Success or fail
     */
    function executeCall(
        address _to,
        bytes _data,
        uint256 _value
    ) public onlyOwner returns (bool) {
        (bool success, bytes memory data) = _to.call{value: _value}(_data);
        emit CallExecuted(_to, _data, _value, success);
        return success;
    }
}
