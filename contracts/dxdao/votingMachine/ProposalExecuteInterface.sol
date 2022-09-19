pragma solidity ^0.8.8;

interface ProposalExecuteInterface {
    function executeProposal(bytes32 _proposalId, uint256 _decision) external returns (bool);
}
