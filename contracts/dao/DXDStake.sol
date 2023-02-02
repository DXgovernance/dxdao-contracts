// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./DXDInfluence.sol";

/**
 * @title DXDStake
 * @dev DXD wrapper contract. DXD tokens converted into DXDStake tokens get locked and are not transferable.
 */
contract DXDStake is OwnableUpgradeable, ERC20SnapshotUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct StakeCommitment {
        uint256 commitmentEnd;
        uint256 timeCommitment;
        uint256 stake;
    }

    uint256 public constant DIVISOR = 10_000;

    IERC20Upgradeable public dxd;
    DXDInfluence public dxdInfluence;
    uint256 public maxTimeCommitment;

    mapping(address => StakeCommitment[]) public stakeCommitments;
    mapping(address => uint256) public userTotalStakes;
    uint256 public totalStakes;
    uint256 public totalActiveStakes;

    bool public earlyWithdrawalsEnabled;
    uint256 public earlyWithdrawalPenalty; // In basis points.
    address public penaltyRecipient;

    /// @notice Error when trying to transfer reputation
    error DXDStake__NoTransfer();

    constructor() {}

    function initialize(
        address _dxd,
        address _dxdInfluence,
        address _owner,
        uint256 _maxTimeCommitment,
        string memory name,
        string memory symbol
    ) external initializer {
        __ERC20_init(name, symbol);
        __Ownable_init();

        _transferOwnership(_owner);
        dxd = IERC20Upgradeable(_dxd);
        dxdInfluence = DXDInfluence(_dxdInfluence);

        maxTimeCommitment = _maxTimeCommitment;
    }

    function changeMaxTimeCommitment(uint256 _maxTimeCommitment) external onlyOwner {
        maxTimeCommitment = _maxTimeCommitment;
    }

    function disableEarlyWithdrawal() external onlyOwner {
        earlyWithdrawalsEnabled = false;
    }

    function enableEarlyWithdrawal(uint256 _penalty, address _recipient) external onlyOwner {
        require(_penalty < DIVISOR, "DXDStake: invalid penalty");
        earlyWithdrawalsEnabled = true;
        earlyWithdrawalPenalty = _penalty;
        penaltyRecipient = _recipient;
    }

    function changeInfluenceFormula(int256 _linearFactor, int256 _exponentialFactor) external onlyOwner {
        dxdInfluence.changeFormula(_linearFactor, _exponentialFactor);
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
    function stake(uint256 _amount, uint256 _timeCommitment) external {
        require(_timeCommitment <= maxTimeCommitment, "DXDStake: timeCommitment too big");

        StakeCommitment storage stakeCommitment = stakeCommitments[msg.sender].push();
        stakeCommitment.stake = _amount;
        stakeCommitment.timeCommitment = _timeCommitment;
        stakeCommitment.commitmentEnd = block.timestamp + _timeCommitment;
        userTotalStakes[msg.sender] += 1;
        totalActiveStakes += 1;
        totalStakes += 1;

        // Mint influence tokens.
        dxdInfluence.mint(msg.sender, _amount, _timeCommitment);

        // Stake DXD tokens
        dxd.safeTransferFrom(msg.sender, address(this), _amount);
        _mint(msg.sender, _amount);
        _snapshot();
    }

    function increaseCommitment(uint256 _commitmentId, uint256 _newTimeCommitment) external {
        require(_newTimeCommitment <= maxTimeCommitment, "DXDStake: timeCommitment too big");
        StakeCommitment storage stakeCommitment = stakeCommitments[msg.sender][_commitmentId];
        require(
            stakeCommitment.commitmentEnd <= block.timestamp + _newTimeCommitment,
            "DXDStake: timeCommitment too small"
        );

        // Update influence. Burning and minting is inefficient, because an extra snapshot is taken.
        dxdInfluence.burn(msg.sender, stakeCommitment.stake, stakeCommitment.timeCommitment);
        dxdInfluence.mint(msg.sender, stakeCommitment.stake, _newTimeCommitment);

        stakeCommitment.timeCommitment = _newTimeCommitment;
        stakeCommitment.commitmentEnd = block.timestamp + _newTimeCommitment;
    }

    /// @dev Withdraw the tokens to the user.
    /// @param _commitmentId Amount of tokens to withdraw.
    function withdraw(address _account, uint256 _commitmentId) external {
        StakeCommitment storage stakeCommitment = stakeCommitments[_account][_commitmentId];
        require(block.timestamp > stakeCommitment.commitmentEnd, "DXDStake: withdrawal not allowed");

        // Burn influence tokens.
        dxdInfluence.burn(_account, stakeCommitment.stake, stakeCommitment.timeCommitment);

        // Unstake DXD tokens
        dxd.safeTransfer(_account, stakeCommitment.stake);
        _burn(_account, stakeCommitment.stake);
        _snapshot();

        stakeCommitment.stake = 0;
        stakeCommitment.timeCommitment = 0;
        stakeCommitment.commitmentEnd = 0;
        userTotalStakes[_account] -= 1;
        totalActiveStakes -= 1;
    }

    /// @dev Withdraw the tokens to the user.
    /// @param _commitmentId Amount of tokens to withdraw.
    function earlyWithdraw(uint256 _commitmentId) external {
        StakeCommitment storage stakeCommitment = stakeCommitments[msg.sender][_commitmentId];
        require(earlyWithdrawalsEnabled, "DXDStake: early withdrawals not allowed");
        require(block.timestamp < stakeCommitment.commitmentEnd, "DXDStake: normal withdrawal allowed");

        // Burn influence tokens.
        dxdInfluence.burn(msg.sender, stakeCommitment.stake, stakeCommitment.timeCommitment);

        // Unstake DXD tokens
        uint256 dxdPenalty = (stakeCommitment.stake * earlyWithdrawalPenalty) / DIVISOR;
        dxd.safeTransfer(msg.sender, stakeCommitment.stake - dxdPenalty);
        dxd.safeTransfer(penaltyRecipient, dxdPenalty);
        _burn(msg.sender, stakeCommitment.stake);
        _snapshot();

        stakeCommitment.stake = 0;
        stakeCommitment.timeCommitment = 0;
        stakeCommitment.commitmentEnd = 0;
        userTotalStakes[msg.sender] -= 1;
        totalActiveStakes -= 1;
    }

    function getAccountLastCommitmentId(address _account) external view returns (uint256) {
        return stakeCommitments[_account].length - 1;
    }

    /// @dev Get the current snapshotId
    function getCurrentSnapshotId() external view returns (uint256) {
        return _getCurrentSnapshotId();
    }
}
