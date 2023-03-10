// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../DAOController.sol";
import "../DAOReputation.sol";
import "./IVotingMachine.sol";
import "../VotingPower.sol";

contract VotingMachineCallbacks {
    IVotingMachine public votingMachine;

    DAOController public controller;

    VotingPower public votingPower;

    mapping(bytes32 => uint256) public proposalSnapshots;

    uint256[45] private __gap;

    error VotingMachineCallbacks__OnlyVotingMachine();

    modifier onlyVotingMachine() {
        if (msg.sender != address(votingMachine)) revert VotingMachineCallbacks__OnlyVotingMachine();
        _;
    }

    function getReputation() public view returns (DAOReputation) {
        return controller.getDaoReputation();
    }

    function getNativeReputationTotalSupply() public view returns (uint256) {
        return getReputation().totalSupply();
    }

    function getTotalReputationSupply(bytes32 _proposalId) external view returns (uint256) {
        (uint128 repSnapshotId, ) = votingPower.snapshots(proposalSnapshots[_proposalId]);
        return getReputation().totalSupplyAt(repSnapshotId);
    }

    function reputationOf(address _owner, bytes32 _proposalId) external view returns (uint256) {
        (uint128 repSnapshotId, ) = votingPower.snapshots(proposalSnapshots[_proposalId]);
        return getReputation().balanceOfAt(_owner, repSnapshotId);
    }

    function getVotingPowerTotalSupply() public view returns (uint256) {
        return votingPower.totalSupply();
    }

    function getVotingPowerTotalSupplyAt(bytes32 _proposalId) external view returns (uint256) {
        return votingPower.totalSupplyAt(proposalSnapshots[_proposalId]);
    }

    function votingPowerOf(address _owner, bytes32 _proposalId) external view returns (uint256) {
        return votingPower.balanceOfAt(_owner, proposalSnapshots[_proposalId]);
    }
}
