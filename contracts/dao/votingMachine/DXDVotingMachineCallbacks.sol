// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../DAOController.sol";
import "../DAOReputation.sol";
import "hardhat/console.sol";
import "./IDXDVotingMachine.sol";

contract DXDVotingMachineCallbacks {
    IDXDVotingMachine public votingMachine;

    DAOController public controller;

    modifier onlyVotingMachine() {
        require(msg.sender == address(votingMachine), "DXDVotingMachineCallbacks: only VotingMachine");
        _;
    }

    mapping(bytes32 => uint256) public proposalSnapshots;

    function mintReputation(
        uint256 _amount,
        address _beneficiary,
        bytes32
    ) external onlyVotingMachine returns (bool success) {
        if (_amount > 0) controller.mintReputation(_amount, _beneficiary);
        return success;
    }

    function burnReputation(
        uint256 _amount,
        address _beneficiary,
        bytes32
    ) external onlyVotingMachine returns (bool success) {
        if (_amount > 0) controller.burnReputation(_amount, _beneficiary);
        return success;
    }

    function getReputation() public view returns (DAOReputation) {
        return controller.getDaoReputation();
    }

    function getNativeReputationTotalSupply() public view returns (uint256) {
        return getReputation().totalSupply();
    }

    function getTotalReputationSupply(bytes32 _proposalId) external view returns (uint256) {
        return getReputation().totalSupplyAt(proposalSnapshots[_proposalId]);
    }

    function reputationOf(address _owner, bytes32 _proposalId) external view returns (uint256) {
        return getReputation().balanceOfAt(_owner, proposalSnapshots[_proposalId]);
    }
}
