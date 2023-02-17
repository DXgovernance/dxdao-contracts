// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "../utils/ERC20/ERC20SnapshotRep.sol";
import "./VotingPower.sol";

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

    /// @notice Mint or Burn shouldn’t be called if the amount is 0
    error DAOReputation__InvalidMintRepAmount();

    modifier nonZeroAmounts(uint256[] memory amounts) {
        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] == 0) revert DAOReputation__InvalidMintRepAmount();
        }
        _;
    }

    function initialize(
        string memory name,
        string memory symbol,
        address _votingPowerToken
    ) external initializer {
        __ERC20_init(name, symbol);
        __Ownable_init();
        votingPowerToken = _votingPowerToken;
    }

    /// @dev Create a new snapshot and call VPToken callback
    function snapshot() internal {
        _snapshot();
        VotingPower(votingPowerToken).callback();
    }

    /**
     * @dev Generates `amount` reputation that are assigned to `account`
     * @param account The address that will be assigned the new reputation
     * @param amount The quantity of reputation generated
     * @return success True if the reputation are generated correctly
     */
    function mint(address account, uint256 amount)
        external
        override(ERC20SnapshotRep)
        onlyOwner
        returns (bool success)
    {
        if (amount == 0) revert DAOReputation__InvalidMintRepAmount();
        _addHolder(account);
        _mint(account, amount);
        emit Mint(account, amount);
        snapshot();
        return true;
    }

    /**
     * @dev Mint reputation for multiple accounts
     * @param accounts The accounts that will be assigned the new reputation
     * @param amounts The quantity of reputation generated for each account
     * @return success True if the reputation are generated correctly
     */
    function mintMultiple(address[] memory accounts, uint256[] memory amounts)
        external
        override(ERC20SnapshotRep)
        onlyOwner
        nonZeroAmounts(amounts)
        returns (bool success)
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            _addHolder(accounts[i]);
            _mint(accounts[i], amounts[i]);
            emit Mint(accounts[i], amounts[i]);
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
    function burn(address account, uint256 amount)
        external
        override(ERC20SnapshotRep)
        onlyOwner
        returns (bool success)
    {
        if (amount == 0) revert DAOReputation__InvalidMintRepAmount();
        _burn(account, amount);
        _removeHolder(account);
        emit Burn(account, amount);
        snapshot();
        return true;
    }

    /**
     * @dev Burn reputation from multiple accounts
     * @param  accounts The accounts that will lose the reputation
     * @param  amounts The quantity of reputation to burn for each account
     * @return success True if the reputation are generated correctly
     */
    function burnMultiple(address[] memory accounts, uint256[] memory amounts)
        external
        override(ERC20SnapshotRep)
        onlyOwner
        nonZeroAmounts(amounts)
        returns (bool success)
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            _burn(accounts[i], amounts[i]);
            _removeHolder(accounts[i]);
            emit Burn(accounts[i], amounts[i]);
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
