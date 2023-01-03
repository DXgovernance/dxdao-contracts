// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title DAO Avatar
 * @dev The avatar, representing the DAO, owned by the DAO, controls the reputation and funds of the DAO.
 */
contract DAOAvatar is OwnableUpgradeable {
    /// @notice Emitted when the call was executed
    event CallExecuted(address indexed to, bytes data, uint256 value, bool callSuccess, bytes callData);

    receive() external payable {}

    /**
     * @dev Initialize the avatar contract.
     * @param owner The address of the owner
     */
    function initialize(address owner) public initializer {
        __Ownable_init();
        transferOwnership(owner);
    }

    /**
     * @dev Perform a call to an arbitrary contract
     * @param to  The contract's address to call
     * @param data ABI-encoded contract call to call `_to` address.
     * @param value Value (ETH) to transfer with the transaction
     * @return callSuccess Whether call was executed successfully or not
     * @return callData Call data returned
     */
    function executeCall(
        address to,
        bytes memory data,
        uint256 value
    ) public onlyOwner returns (bool callSuccess, bytes memory callData) {
        (callSuccess, callData) = to.call{value: value}(data);
        emit CallExecuted(to, data, value, callSuccess, callData);
        return (callSuccess, callData);
    }
}
