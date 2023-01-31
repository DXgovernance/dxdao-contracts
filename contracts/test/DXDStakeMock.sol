// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../dao/VotingPowerToken.sol";

/**
 * @title DXDStake
 * @dev DXD wrapper contract. DXD tokens converted into DXDStake tokens get locked and are not transferable.
 */
contract DXDStakeMock is OwnableUpgradeable, ERC20SnapshotUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IERC20Upgradeable public dxd;
    address public votingPowerToken;

    /// @notice Error when trying to transfer reputation
    error DXDStake__NoTransfer();

    constructor() {}

    function initialize(
        address _dxd,
        address _owner,
        string memory name,
        string memory symbol,
        address votingPowerTokenAddress
    ) external initializer {
        __ERC20_init(name, symbol);
        __Ownable_init();

        _transferOwnership(_owner);
        dxd = IERC20Upgradeable(_dxd);
        votingPowerToken = votingPowerTokenAddress;
    }

    /// @dev Not allow the transfer of tokens
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        revert DXDStake__NoTransfer();
    }

    /// @dev Stakes tokens from the user.
    /// @param _amount Amount of tokens to stake.
    function stake(uint256 _amount) external {
        // Stake DXD tokens
        // dxd.safeTransferFrom(msg.sender, address(this), _amount);
        _mint(msg.sender, _amount);
        _snapshot();

        // Notify Voting Power contract.
        VotingPowerToken(votingPowerToken).callback();
    }

    /// @dev Withdraw the tokens to the user.
    /// @param _amount Amount of tokens to withdraw.
    function withdraw(uint256 _amount) external {
        // Unstake DXD tokens
        // dxd.safeTransfer(msg.sender, _amount);
        _burn(msg.sender, _amount);
        _snapshot();

        // Notify Voting Power contract.
        VotingPowerToken(votingPowerToken).callback();
    }

    /// @dev Get the current snapshotId
    function getCurrentSnapshotId() external view returns (uint256) {
        return _getCurrentSnapshotId();
    }
}