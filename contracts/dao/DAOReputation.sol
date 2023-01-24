// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "../utils/ERC20/ERC20SnapshotRep.sol";
import "../dao/VotingPowerToken.sol";

/**
 * @title DAO Reputation
 * @dev An ERC20 token that is non-transferable, owned and controlled by the DAO.
 * Used by the DAO to vote on proposals.
 * It uses a snapshot mechanism to keep track of the reputation at the moment of
 * each modification of the supply of the token (every mint an burn).
 */
contract DAOReputation is ERC20SnapshotRep {
    /// @notice Voting Power Token address
    address public votingPowerToken;

    function initialize(string memory name, string memory symbol, address _votingPowerToken) external initializer {
        __ERC20_init(name, symbol);
        __Ownable_init();
        votingPowerToken = _votingPowerToken;
    }

    /// @dev Create a new snapshot and call VPToken callback
    function snapshot() internal {
        _snapshot();
        VotingPowerToken(votingPowerToken).callback();
    }

    /**
     * @dev Generates `amount` reputation that are assigned to `account`
     * @param account The address that will be assigned the new reputation
     * @param amount The quantity of reputation generated
     * @return success True if the reputation are generated correctly
     */
    function mint(
        address account,
        uint256 amount
    ) external override(ERC20SnapshotRep) onlyOwner returns (bool success) {
        _addHolder(account);
        _mint(account, amount);
        emit Mint(account, amount);
        snapshot();
        return true;
    }

    /**
     * @dev Mint reputation for multiple accounts
     * @param accounts The accounts that will be assigned the new reputation
     * @param amount The quantity of reputation generated for each account
     * @return success True if the reputation are generated correctly
     */
    function mintMultiple(
        address[] memory accounts,
        uint256[] memory amount
    ) external override(ERC20SnapshotRep) onlyOwner returns (bool success) {
        for (uint256 i = 0; i < accounts.length; i++) {
            _addHolder(accounts[i]);
            _mint(accounts[i], amount[i]);
            emit Mint(accounts[i], amount[i]);
        }
        snapshot();
        return true;
    }

    /**
     * @dev Burns ` amount` reputation from ` account`
     * @param  account The address that will lose the reputation
     * @param  amount The quantity of reputation to burn
     * @return success True if the reputation are burned correctly
     */
    function burn(
        address account,
        uint256 amount
    ) external override(ERC20SnapshotRep) onlyOwner returns (bool success) {
        _burn(account, amount);
        _removeHolder(account);
        emit Burn(account, amount);
        snapshot();
        return true;
    }

    /**
     * @dev Burn reputation from multiple accounts
     * @param  accounts The accounts that will lose the reputation
     * @param  amount The quantity of reputation to burn for each account
     * @return success True if the reputation are generated correctly
     */
    function burnMultiple(
        address[] memory accounts,
        uint256[] memory amount
    ) external override(ERC20SnapshotRep) onlyOwner returns (bool success) {
        for (uint256 i = 0; i < accounts.length; i++) {
            _burn(accounts[i], amount[i]);
            _removeHolder(accounts[i]);
            emit Burn(accounts[i], amount[i]);
        }
        snapshot();
        return true;
    }

    /**
     * @dev Sets new Voting Power Token contract address
     * @param _votingPowerToken The address of the new VPToken contract
     */
    function setVotingPowerTokenAddress(address _votingPowerToken) external onlyOwner {
        votingPowerToken = _votingPowerToken;
    }
}
