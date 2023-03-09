// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "../ERC20GuildUpgradeable.sol";

/*
  @title GuardedERC20Guild
  @author github:AugustoL
  @dev An ERC20GuildUpgradeable with a guardian, the proposal time can be extended an extra 
  time for the guardian to end the proposal like it would happen normally from a base ERC20Guild or reject it directly.
*/
contract GuardedERC20Guild is ERC20GuildUpgradeable {
    address public guildGuardian;
    uint256 public extraTimeForGuardian;

    /// @dev Reverts if proposal cannot be executed
    /// @param proposalId The id of the proposal to evaluate
    /// @param highestVoteAmount The amounts of votes received by the currently winning proposal option.
    function checkProposalExecutionState(bytes32 proposalId, uint256 highestVoteAmount) internal view override {
        require(!isExecutingProposal, "ERC20Guild: Proposal under execution");
        require(proposals[proposalId].state == ProposalState.Active, "ERC20Guild: Proposal already executed");

        uint256 endTime = msg.sender == guildGuardian
            ? proposals[proposalId].endTime
            : proposals[proposalId].endTime + extraTimeForGuardian;
        require(endTime < block.timestamp, "ERC20Guild: Proposal hasn't ended yet");
    }

    /// @dev Internal function to set the amount of votingPower to vote in a proposal
    /// @param voter The address of the voter
    /// @param proposalId The id of the proposal to set the vote
    /// @param option The proposal option to be voted
    /// @param votingPower The amount of votingPower to use as voting for the proposal
    function _setVote(
        address voter,
        bytes32 proposalId,
        uint256 option,
        uint256 votingPower
    ) internal override {
        super._setVote(voter, proposalId, option, votingPower);

        if (votingPowerPercentageForInstantProposalExecution != 0) {
            // Check if the threshold for instant execution has been reached.
            uint256 votingPowerForInstantProposalExecution = (votingPowerPercentageForInstantProposalExecution *
                token.totalSupply()) / BASIS_POINT_MULTIPLIER;
            uint256 minVotingPowerThreshold = MathUpgradeable.min(
                votingPowerForInstantProposalExecution,
                getVotingPowerForProposalExecution()
            );
            for (uint256 i = 1; i < proposals[proposalId].totalVotes.length; i++) {
                if (proposals[proposalId].totalVotes[i] >= minVotingPowerThreshold) {
                    proposals[proposalId].endTime = block.timestamp;
                    break;
                }
            }
        }
    }

    /// @dev Rejects a proposal directly without execution, only callable by the guardian
    /// @param proposalId The id of the proposal to be rejected
    function rejectProposal(bytes32 proposalId) external {
        require(proposals[proposalId].state == ProposalState.Active, "GuardedERC20Guild: Proposal already executed");
        require((msg.sender == guildGuardian), "GuardedERC20Guild: Proposal can be rejected only by guardian");
        proposals[proposalId].state = ProposalState.Rejected;
        emit ProposalStateChanged(proposalId, uint256(ProposalState.Rejected));
    }

    /// @dev Set GuardedERC20Guild guardian configuration
    /// @param _guildGuardian The address of the guild guardian
    /// @param _extraTimeForGuardian The extra time the proposals would be locked for guardian verification
    function setGuardianConfig(address _guildGuardian, uint256 _extraTimeForGuardian) external {
        require(
            (guildGuardian == address(0)) || (msg.sender == address(this)),
            "GuardedERC20Guild: Only callable by the guild itself when guildGuardian is set"
        );
        require(_guildGuardian != address(0), "GuardedERC20Guild: guildGuardian cant be address 0");
        guildGuardian = _guildGuardian;
        extraTimeForGuardian = _extraTimeForGuardian;
    }

    /// @dev Get the guildGuardian address
    function getGuildGuardian() external view returns (address) {
        return guildGuardian;
    }

    /// @dev Get the extraTimeForGuardian
    function getExtraTimeForGuardian() external view returns (uint256) {
        return extraTimeForGuardian;
    }
}
