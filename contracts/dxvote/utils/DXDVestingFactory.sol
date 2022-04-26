pragma solidity ^0.5.4;

import "openzeppelin-solidity/contracts/drafts/TokenVesting.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";

contract DXDVestingFactory {
    using SafeERC20 for IERC20;
    event VestingCreated(address vestingContractAddress);

    IERC20 public DXD;
    address public DXdao;

    constructor(address _DXD, address _DXdao) public {
        DXD = IERC20(_DXD);
        DXdao = _DXdao;
    }

    function create(
        address beneficiary,
        uint256 start,
        uint256 cliffDuration,
        uint256 duration,
        uint256 value
    ) external {
        TokenVesting newVestingContract = new TokenVesting(beneficiary, start, cliffDuration, duration, true);

        DXD.transferFrom(msg.sender, address(newVestingContract), value);
        require(DXD.balanceOf(address(newVestingContract)) >= value, "DXDVestingFactory: token transfer unsuccessful");

        newVestingContract.transferOwnership(DXdao);
        emit VestingCreated(address(newVestingContract));
    }
}
