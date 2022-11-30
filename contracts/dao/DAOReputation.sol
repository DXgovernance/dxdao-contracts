// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";

/**
 * @title DAO Reputation
 * @dev An ERC20 token that is non-transferable, owned and controlled by the DAO.
 * Used by the DAO to vote on proposals.
 * It uses a snapshot mechanism to keep track of the reputation at the moment of
 * each modification of the supply of the token (every mint an burn).
 */

///@notice Error when trying to transfer reputation
error DAOReputation__NoTransfer();

contract DAOReputation is OwnableUpgradeable, ERC20SnapshotUpgradeable {
    event Mint(address indexed _to, uint256 _amount);
    event Burn(address indexed _from, uint256 _amount);

    function initialize(string memory name, string memory symbol) external initializer {
        __ERC20_init(name, symbol);
        __Ownable_init();
    }

    /**
     * @dev Not allow the transfer of tokens
     */
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        revert DAOReputation__NoTransfer();
    }

    /// @notice Generates `_amount` reputation that are assigned to `_account`
    /// @param _account The address that will be assigned the new reputation
    /// @param _amount The quantity of reputation generated
    /// @return True if the reputation are generated correctly
    function mint(address _account, uint256 _amount) external onlyOwner returns (bool) {
        _mint(_account, _amount);
        _snapshot();
        emit Mint(_account, _amount);
        return true;
    }

    function mintMultiple(address[] memory _accounts, uint256[] memory _amount) external onlyOwner returns (bool) {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _mint(_accounts[i], _amount[i]);
            emit Mint(_accounts[i], _amount[i]);
        }
        return true;
    }

    /// @notice Burns `_amount` reputation from `_account`
    /// @param _account The address that will lose the reputation
    /// @param _amount The quantity of reputation to burn
    /// @return True if the reputation are burned correctly
    function burn(address _account, uint256 _amount) external onlyOwner returns (bool) {
        _burn(_account, _amount);
        _snapshot();
        emit Burn(_account, _amount);
        return true;
    }

    function burnMultiple(address[] memory _accounts, uint256[] memory _amount) external onlyOwner returns (bool) {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _burn(_accounts[i], _amount[i]);
            emit Burn(_accounts[i], _amount[i]);
        }
        return true;
    }

    /**
     * @dev Get the current snapshotId
     */
    function getCurrentSnapshotId() public view returns (uint256) {
        return _getCurrentSnapshotId();
    }
}
