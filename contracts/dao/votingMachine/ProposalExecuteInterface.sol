// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

interface ProposalExecuteInterface {
    function executeProposal(bytes32 _proposalId, uint256 _decision) external returns (bool);

    function finishProposal(bytes32 _proposalId, uint256 _decision) external returns (bool);
}
