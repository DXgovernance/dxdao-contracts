// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

interface ProposalExecuteInterface {
    function executeProposal(bytes32 proposalId, uint256 winningOption) external returns (bool);

    function finishProposal(bytes32 proposalId, uint256 winningOption) external returns (bool);
}
