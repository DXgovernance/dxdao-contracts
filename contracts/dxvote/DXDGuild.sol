// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

pragma experimental ABIEncoderV2;

import "../erc20guild/ERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

/// @title DXDGuild
/// @author github:AugustoL
/// An ERC20Guild for the DXD token designed to execute votes on Genesis Protocol Voting Machine.
contract DXDGuild is ERC20Guild, OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

    address public votingMachine;
    bytes4 public voteFuncSignature =
        bytes4(keccak256("vote(bytes32,uint256,uint256,address)"));
    uint256 private _currentSnapshotId;

    struct VotingMachineVoteProposal {
        bytes32 positiveVote;
        bytes32 negativeVote;
    }

    // VotingMachineProposalId => VotingMachineVoteProposal => ERC20Guild Proposal (Positive & Negative)
    mapping(bytes32 => VotingMachineVoteProposal)
        public votingMachineVoteProposals;

    // ERC20Guild Proposal => VotingMachineProposalId
    mapping(bytes32 => bytes32) public proposalsForVotingMachineVote;

    /// @dev Initilizer
    /// @param _token The address of the token to be used
    /// @param _proposalTime The minimun time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    /// @param _votingPowerForProposalExecution The % of total voting power needed for a proposal to be executed based
    /// on the token total supply. 10000 == 100%, 5000 == 50% and 2500 == 25%
    /// @param _votingPowerForProposalExecution The % of total voting power needed to create a proposal based on the
    /// token total supply. 10000 == 100%, 5000 == 50% and 2500 == 25%
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    /// @param _votingMachine The voting machine where the guild will vote
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _lockTime,
        address _votingMachine
    ) public initializer {
        super.initialize(
            _token,
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            "DXDGuild",
            _voteGas,
            _maxGasPrice,
            _lockTime,
            1
        );
        votingMachine = _votingMachine;
        callPermissions[votingMachine][voteFuncSignature] = block.timestamp;
    }

    /// @dev Create a proposal with an static call data and extra information
    /// The proposals created with this function cant call the voting machine.
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param description A short description of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        string memory description,
        bytes memory contentHash
    ) public override isInitialized returns (bytes32) {
        require(
            votingPowerOf(msg.sender) >= getVotingPowerForProposalCreation(),
            "DXDGuild: Not enough tokens to create proposal"
        );
        require(
            (to.length == data.length) && (to.length == value.length),
            "DXDGuild: Wrong length of to, data or value arrays"
        );
        require(
            to.length > 0,
            "DXDGuild: to, data value arrays cannot be empty"
        );
        for (uint256 i = 0; i < to.length; i++) {
            require(
                to[i] != votingMachine,
                "DXDGuild: Use createVotingMachineVoteProposal to submit proposals to voting machine"
            );
        }
        return _createProposal(to, data, value, description, contentHash);
    }

    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// This function cant end voting machine proposals
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public override {
        require(
            proposalsForVotingMachineVote[proposalId] == bytes32(0),
            "DXDGuild: Use endVotingMachineVoteProposal to end proposals to voting machine"
        );
        require(
            proposals[proposalId].state == ProposalState.Submitted,
            "ERC20Guild: Proposal already executed"
        );
        require(
            proposals[proposalId].endTime < block.timestamp,
            "ERC20Guild: Proposal hasnt ended yet"
        );
        _endProposal(proposalId);
    }

    /// @dev Create two proposals one to vote for a positive and another to vor for negative vote on a proposal on a
    /// voting machine.
    /// @param votingMachineProposalId the proposalId of the voting machine
    function createVotingMachineVoteProposal(bytes32 votingMachineProposalId)
        public
        isInitialized
    {
        require(
            votingPowerOf(msg.sender) >= getVotingPowerForProposalCreation(),
            "DXDGuild: Not enough tokens to create proposal"
        );
        address[] memory _to = new address[](1);
        _to[0] = votingMachine;
        bytes[] memory _data = new bytes[](1);
        bytes memory _contentHash = abi.encodePacked(votingMachineProposalId);
        _data[0] = abi.encodeWithSelector(
            voteFuncSignature,
            votingMachineProposalId,
            1,
            0,
            address(this)
        );
        votingMachineVoteProposals[votingMachineProposalId]
            .positiveVote = _createProposal(
            _to,
            _data,
            new uint256[](1),
            string("Positive Vote"),
            _contentHash
        );
        proposalsForVotingMachineVote[
            votingMachineVoteProposals[votingMachineProposalId].positiveVote
        ] = votingMachineProposalId;
        _data[0] = abi.encodeWithSelector(
            voteFuncSignature,
            votingMachineProposalId,
            2,
            0,
            address(this)
        );
        votingMachineVoteProposals[votingMachineProposalId]
            .negativeVote = _createProposal(
            _to,
            _data,
            new uint256[](1),
            string("Negative Vote"),
            _contentHash
        );
        proposalsForVotingMachineVote[
            votingMachineVoteProposals[votingMachineProposalId].negativeVote
        ] = votingMachineProposalId;
    }

    /// @dev End positive and negative proposals to vote on a voting machine, executing the one with the higher vote
    /// count first.
    /// @param votingMachineProposalId the proposalId of the voting machine
    function endVotingMachineVoteProposal(bytes32 votingMachineProposalId)
        public
        isInitialized
    {
        Proposal storage positiveVote =
            proposals[
                votingMachineVoteProposals[votingMachineProposalId].positiveVote
            ];
        Proposal storage negativeVote =
            proposals[
                votingMachineVoteProposals[votingMachineProposalId].negativeVote
            ];
        require(
            positiveVote.state == ProposalState.Submitted,
            "DXDGuild: Positive proposal already executed"
        );
        require(
            negativeVote.state == ProposalState.Submitted,
            "DXDGuild: Negative proposal already executed"
        );
        require(
            positiveVote.endTime < block.timestamp,
            "DXDGuild: Positive proposal hasnt ended yet"
        );
        require(
            negativeVote.endTime < block.timestamp,
            "DXDGuild: Negative proposal hasnt ended yet"
        );

        if (positiveVote.totalVotes > negativeVote.totalVotes) {
            _endProposal(
                votingMachineVoteProposals[votingMachineProposalId].positiveVote
            );
            negativeVote.state = ProposalState.Rejected;
            emit ProposalRejected(
                votingMachineVoteProposals[votingMachineProposalId].negativeVote
            );
        } else {
            _endProposal(
                votingMachineVoteProposals[votingMachineProposalId].negativeVote
            );
            positiveVote.state = ProposalState.Rejected;
            emit ProposalRejected(
                votingMachineVoteProposals[votingMachineProposalId].positiveVote
            );
        }
    }

    /// @dev Internal function to set the amount of votingPower to vote in a proposal
    /// It also checks that the vote is done only once in VotingMachienVote proposal
    /// @param voter The address of the voter
    /// @param proposalId The id of the proposal to set the vote
    /// @param votingPower The amount of votingPower to use as voting for the proposal
    function _setVote(
        address voter,
        bytes32 proposalId,
        uint256 votingPower
    ) internal override isInitialized {
        require(
            proposals[proposalId].state == ProposalState.Submitted,
            "DXDGuild: Proposal already executed"
        );
        require(
            votingPowerOf(voter) >= votingPower,
            "DXDGuild: Invalid votingPower amount"
        );

        // Check that no vote was done in the VotingMachineVote proposal
        bytes32 votingMachineVoteProposalId =
            proposalsForVotingMachineVote[proposalId];
        if (votingMachineVoteProposalId != bytes32(0)) {
            require(
                getProposalVotesOfVoter(
                    votingMachineVoteProposals[votingMachineVoteProposalId]
                        .positiveVote,
                    msg.sender
                ) == 0,
                "DXDGuild: Already voted in VotingMachine vote proposal"
            );
            require(
                getProposalVotesOfVoter(
                    votingMachineVoteProposals[votingMachineVoteProposalId]
                        .negativeVote,
                    msg.sender
                ) == 0,
                "DXDGuild: Already voted in VotingMachine vote proposal"
            );
        }
        if (votingPower > proposals[proposalId].votes[voter]) {
            proposals[proposalId].totalVotes = proposals[proposalId]
                .totalVotes
                .add(votingPower.sub(proposals[proposalId].votes[voter]));
            emit VoteAdded(
                proposalId,
                voter,
                votingPower.sub(proposals[proposalId].votes[voter])
            );
        } else {
            proposals[proposalId].totalVotes = proposals[proposalId]
                .totalVotes
                .sub(proposals[proposalId].votes[voter].sub(votingPower));
            emit VoteRemoved(
                proposalId,
                voter,
                proposals[proposalId].votes[voter].sub(votingPower)
            );
        }
        proposals[proposalId].votes[voter] = votingPower;
    }

    /// @dev Get minimum amount of votes needed for creation
    function getVotingPowerForProposalCreation()
        public
        view
        override
        returns (uint256)
    {
        return token.totalSupply().mul(votingPowerForProposalCreation).div(100);
    }

    /// @dev Get minimum amount of votes needed for proposal execution
    function getVotingPowerForProposalExecution()
        public
        view
        override
        returns (uint256)
    {
        return
            token.totalSupply().mul(votingPowerForProposalExecution).div(100);
    }
}
