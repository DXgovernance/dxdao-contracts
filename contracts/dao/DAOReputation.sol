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
contract DAOReputation is OwnableUpgradeable, ERC20SnapshotUpgradeable {
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    /// @notice Error when trying to transfer reputation
    error DAOReputation__NoTransfer();

    function initialize(string memory name, string memory symbol) external initializer {
        __ERC20_init(name, symbol);
        __Ownable_init();
    }

    /// @dev Not allow the transfer of tokens
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        revert DAOReputation__NoTransfer();
    }

    /**
     * @dev Generates `amount` reputation that are assigned to `account`
     * @param account The address that will be assigned the new reputation
     * @param amount The quantity of reputation generated
     * @return success True if the reputation are generated correctly
     */
    function mint(address account, uint256 amount) external onlyOwner returns (bool success) {
        _mint(account, amount);
        _snapshot();
        emit Mint(account, amount);
        return true;
    }

    /**
     * @dev Mint reputation for multiple accounts
     * @param accounts The accounts that will be assigned the new reputation
     * @param amount The quantity of reputation generated for each account
     * @return success True if the reputation are generated correctly
     */
    function mintMultiple(address[] memory accounts, uint256[] memory amount)
        external
        onlyOwner
        returns (bool success)
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            _mint(accounts[i], amount[i]);
            _snapshot();
            emit Mint(accounts[i], amount[i]);
        }
        return true;
    }

    /**
     * @dev Burns ` amount` reputation from ` account`
     * @param  account The address that will lose the reputation
     * @param  amount The quantity of reputation to burn
     * @return success True if the reputation are burned correctly
     */
    function burn(address account, uint256 amount) external onlyOwner returns (bool success) {
        _burn(account, amount);
        _snapshot();
        emit Burn(account, amount);
        return true;
    }

    /**
     * @dev Burn reputation from multiple accounts
     * @param  accounts The accounts that will lose the reputation
     * @param  amount The quantity of reputation to burn for each account
     * @return success True if the reputation are generated correctly
     */
    function burnMultiple(address[] memory accounts, uint256[] memory amount)
        external
        onlyOwner
        returns (bool success)
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            _burn(accounts[i], amount[i]);
            _snapshot();
            emit Burn(accounts[i], amount[i]);
        }
        return true;
    }

    /// @dev Get the current snapshotId
    function getCurrentSnapshotId() public view returns (uint256) {
        return _getCurrentSnapshotId();
    }
}
