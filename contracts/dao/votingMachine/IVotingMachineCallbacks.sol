// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

interface IVotingMachineCallbacks {
    function getTotalReputationSupply(bytes32 _proposalId) external view returns (uint256);

    function reputationOf(address _owner, bytes32 _proposalId) external view returns (uint256);
}
