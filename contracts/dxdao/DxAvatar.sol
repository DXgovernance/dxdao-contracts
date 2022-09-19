// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
  @title DxAvatar
  @author github:miltontulli
  @dev An Avatar holds tokens, reputation and ether for a controller
*/

contract DxAvatar is OwnableUpgradeable {
    event CallExecuted(address indexed _to, bytes _data, uint256 _value, bool _success);

    address public reputationToken;

    receive() external payable {}

    function initialize(address _owner, address _reputationToken) public initializer {
        __Ownable_init();
        transferOwnership(_owner);
        reputationToken = _reputationToken;
    }

    /**
     * @dev Perform a call to an arbitrary contract
     * @param _to  The contract's address to call
     * @param _data ABI-encoded contract call to call `_to` address.
     * @param _value Value (ETH) to transfer with the transaction
     * @return (bool, bytes) (Success or fail, Call data returned)
     */
    function executeCall(
        address _to,
        bytes memory _data,
        uint256 _value
    ) public onlyOwner returns (bool, bytes memory) {
        (bool success, bytes memory dataReturned) = _to.call{value: _value}(_data);
        emit CallExecuted(_to, _data, _value, success);
        return (success, dataReturned);
    }
}
