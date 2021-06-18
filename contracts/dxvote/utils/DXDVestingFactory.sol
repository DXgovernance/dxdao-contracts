pragma solidity ^0.5.4;

import "openzeppelin-solidity/contracts/drafts/TokenVesting.sol";


contract DXDVestingFactory {
    
    event VestingCreated(address vestingContractAddress);
    
    IERC20 public DXD;
    
    constructor(address _DXD) public{
      DXD = IERC20(_DXD);
    }

    function create(
      address beneficiary,
      uint256 start,
      uint256 cliffDuration,
      uint256 duration,
      uint256 value
    ) public {
        TokenVesting newVestingContract = new TokenVesting(beneficiary, start, cliffDuration, duration, true);
        DXD.transferFrom(msg.sender, address(newVestingContract), value);
        emit VestingCreated(address(newVestingContract));
    }
    
}
