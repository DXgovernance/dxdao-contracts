pragma solidity ^0.5.11;

interface ProposalExecuteInterface {
    function executeProposal(bytes32 _proposalId, int256 _decision) external returns (bool);
}
