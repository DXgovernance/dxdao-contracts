// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DXDToETHRedemption is Ownable {
    using SafeERC20 for IERC20;

    uint256 public redemptionDeadline;
    uint256 public ethPerDXD; // 1000000 = 1, 500000 = 0.5, 150000 = 0.15
    IERC20 public dxdToken;
    uint256 constant PRICE_PRECISION = 1000000;

    // redemptionDeadline needs to be at least in a year
    error WrongRedemptionDeadline();
    // Redemption period has ended
    error RedemptionPeriodEnded();
    // Redemption period has not ended yet
    error RedemptionPeriodNotEnded();
    // Amount must be greater than 1000000
    error AmountTooSmall();

    event Redemption(address indexed sender, uint256 amount);

    receive() external payable {}

    constructor(
        uint256 _redemptionDeadline,
        uint256 _ethPerDXD,
        address _dxdTokenAddress
    ) {
        if ((block.timestamp + 365 days) < _redemptionDeadline) revert WrongRedemptionDeadline();

        redemptionDeadline = _redemptionDeadline;
        ethPerDXD = _ethPerDXD;
        dxdToken = IERC20(_dxdTokenAddress);
    }

    function redeem(uint256 _amount) external {
        if (block.timestamp > redemptionDeadline) revert RedemptionPeriodEnded();

        if (_amount == 0) _amount = dxdToken.balanceOf(msg.sender);

        if (_amount < PRICE_PRECISION) revert AmountTooSmall();

        uint256 ethAmount = (_amount * ethPerDXD) / PRICE_PRECISION;

        dxdToken.safeTransferFrom(msg.sender, address(this), _amount);
        payable(msg.sender).transfer(ethAmount);

        emit Redemption(msg.sender, _amount);
    }

    function withdrawRemainingETH() external onlyOwner {
        if (block.timestamp < redemptionDeadline) revert RedemptionPeriodNotEnded();

        uint256 remainingETH = address(this).balance;
        payable(msg.sender).transfer(remainingETH);
    }
}
