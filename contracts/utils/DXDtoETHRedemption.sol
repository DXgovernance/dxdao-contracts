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

    event Redemption(address indexed sender, uint256 amount);

    receive() external payable {}

    constructor(
        uint256 _redemptionDeadline,
        uint256 _ethPerDXD,
        address _dxdTokenAddress
    ) {
        redemptionDeadline = _redemptionDeadline;
        ethPerDXD = _ethPerDXD;
        dxdToken = IERC20(_dxdTokenAddress);
    }

    function redeem(uint256 _amount) external {
        require(block.timestamp <= redemptionDeadline, "DXDToETHRedemption: Redemption period has ended");
        require(_amount > 1000000, "DXDToETHRedemption: Amount must be greater than 0");

        uint256 ethAmount = (_amount * ethPerDXD) / 1000000;

        dxdToken.safeTransferFrom(msg.sender, address(this), _amount);
        payable(msg.sender).transfer(ethAmount);

        emit Redemption(msg.sender, _amount);
    }

    function redeemWithPermit(
        uint256 _amount,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        require(block.timestamp <= redemptionDeadline, "Redemption period has ended");
        require(_amount > 1000000, "Amount must be greater than 0");

        uint256 ethAmount = (_amount * ethPerDXD) / 1000000;

        IERC20Permit(address(dxdToken)).permit(msg.sender, address(this), _amount, _deadline, _v, _r, _s);

        dxdToken.safeTransferFrom(msg.sender, address(this), _amount);
        payable(msg.sender).transfer(ethAmount);

        emit Redemption(msg.sender, _amount);
    }

    function withdrawRemainingETH() external onlyOwner {
        require(block.timestamp > redemptionDeadline, "DXDToETHRedemption: Redemption period has not ended yet");

        uint256 remainingETH = address(this).balance;
        payable(msg.sender).transfer(remainingETH);
    }
}
