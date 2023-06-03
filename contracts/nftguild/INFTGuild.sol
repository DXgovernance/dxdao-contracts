// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

interface INFTGuild {
    event NewProposal(
        bytes32 indexed proposalId,
        uint256 indexed proposalIndex,
        TxData[] txData,
        string title,
        string contentHash
    );
    event ProposalStateChanged(bytes32 indexed proposalId, uint256 newState);
    event VoteAdded(bytes32 indexed proposalId, address voter, uint256[] votingPower);
    event SetAllowance(address indexed to, bytes4 functionSignature, bool allowance);

    enum ProposalState {
        None,
        Active,
        Rejected,
        Executed,
        Failed
    }

    struct TxData {
        address to;
        uint256 value;
        bytes data;
    }

    struct Vote {
        uint256 option;
        uint256 tokenId;
    }

    struct Proposal {
        address creator;
        uint256 startTime;
        uint256 endTime;
        uint256 powerForExecution;
        address[] to;
        bytes[] data;
        uint256[] value;
        string title;
        string contentHash;
        ProposalState state;
        Vote[] totalVotes;
        uint256 totalOptions;
    }

    fallback() external payable;

    receive() external payable;

    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        string calldata _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint128 _maxActiveProposals,
        address _permissionRegistry
    ) external;

    function setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForInstantProposalExecution,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint128 _maxActiveProposals
    ) external;

    function createProposal(
        TxData[] calldata txDatas,
        uint256 totalOptions,
        string calldata title,
        string calldata contentHash,
        uint256 ownedTokenId
    ) external returns (bytes32);

    function endProposal(bytes32 proposalId, TxData[] calldata txDatas) external;

    function setVote(
        bytes32 proposalId,
        uint256 option,
        uint256[] memory tokenIds
    ) external;

    function setSignedVote(
        bytes32 proposalId,
        uint256 option,
        address voter,
        uint256[] calldata tokenIds,
        bytes calldata signature
    ) external;

    function getToken() external view returns (address);

    function getPermissionRegistry() external view returns (address);

    function getName() external view returns (string memory);

    function getProposalTime() external view returns (uint256);

    function getTimeForExecution() external view returns (uint256);

    function getVoteGas() external view returns (uint256);

    function getMaxGasPrice() external view returns (uint256);

    function getMaxActiveProposals() external view returns (uint256);

    function getTotalProposals() external view returns (uint256);

    function getActiveProposalsNow() external view returns (uint256);

    function getProposalsIds(uint256 from, uint256 to) external view returns (bytes32[] memory);

    function getProposal(bytes32 proposalId) external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 totalOptions,
        ProposalState state,
        uint256[] memory totalVotes
    );

    function getProposalVotesOfTokenId(bytes32 proposalId, uint256 tokenId) external view returns (uint256 option);

    function getVotingPowerForProposalExecution() external view returns (uint256);

    function votingPowerForInstantProposalExecution() external view returns (uint256);

    function getFuncSignature(bytes memory data) external view returns (bytes4);

    function getProposalsIdsLength() external view returns (uint256);

    function getEIP1271SignedHash(bytes32 _hash) external view returns (bool);

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4 magicValue);

    function hashVote(
        address voter,
        bytes32 proposalId,
        uint256 option,
        uint256 votingPower
    ) external pure returns (bytes32);
}
