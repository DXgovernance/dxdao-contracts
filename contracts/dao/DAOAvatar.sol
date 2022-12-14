// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title DAO Avatar
 * @dev The avatar, representing the DAO, owned by the DAO, controls the reputation and funds of the DAO.
 */
contract DAOAvatar is OwnableUpgradeable {
    /// @notice Emitted when the call was executed
    event CallExecuted(address indexed _to, bytes _data, uint256 _value, bool _success);

    receive() external payable {}

    /**
     * @dev Initialize the avatar contract.
     * @param _owner The address of the owner
     */
    function initialize(address _owner) public initializer {
        __Ownable_init();
        transferOwnership(_owner);
    }

    /**
     * @dev Perform a call to an arbitrary contract
     * @param _to  The contract's address to call
     * @param _data ABI-encoded contract call to call `_to` address.
     * @param _value Value (ETH) to transfer with the transaction
     * @return success Whether call was executed successfully or not
     * @return data Call data returned
     */
    function executeCall(
        address _to,
        bytes memory _data,
        uint256 _value
    ) public onlyOwner returns (bool success, bytes memory data) {
        (success, data) = _to.call{value: _value}(_data);
        emit CallExecuted(_to, _data, _value, success);
        return (success, data);
    }
}
