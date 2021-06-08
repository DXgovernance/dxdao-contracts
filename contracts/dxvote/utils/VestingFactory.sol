pragma solidity ^0.5.4;

import "openzeppelin-solidity/contracts/drafts/TokenVesting.sol";


contract VestingFactory {
    
    event VestingCreated(address vestingContractAddress);

    function create(address beneficiary, uint256 start, uint256 cliffDuration, uint256 duration, bool revocable) public {
        TokenVesting newVestingContract = new TokenVesting(beneficiary, start, cliffDuration, duration, revocable);
        emit VestingCreated(address(newVestingContract));
    }
    
}
