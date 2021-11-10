// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "../ERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

/// @title GuardedGuild
/// @author github:AugustoL
contract GuardedGuild is ERC20Guild, OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;
    
    address public guildGuardian;
    uint256 public extraTimeForGuardian;
    
    /// @dev Initilizer
    /// @param _token The address of the token to be used
    /// @param _proposalTime The minimun time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    /// @param _votingPowerForProposalExecution The percentage of voting power needed in a proposal to be executed
    /// @param _votingPowerForProposalCreation The percentage of voting power needed to create a proposal
    /// @param _name The the guild name
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _maxActiveProposals The maximum number of proposals to be in submitted state
    /// @param _permissionDelay The amount of seconds that are going to be added over the timestamp of the block when
    /// a permission is allowed
    /// @param _guildGuardian The address of the guild guardian
    /// @param _extraTimeForGuardian The extra time the proposals would be locked for guardian verfication
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        string memory _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        uint256 _permissionDelay,
        address _guildGuardian,
        uint256 _extraTimeForGuardian
    ) public initializer {
        require(
            address(_token) != address(0),
            "ERC20Guild: token is the zero address"
        );
        _initialize(
            _token,
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            _name,
            _voteGas,
            _maxGasPrice,
            _maxActiveProposals,
            _permissionDelay
        );
        guildGuardian = _guildGuardian;
        extraTimeForGuardian = _extraTimeForGuardian;
        initialized = true;
    }
    
    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// If this function is called by the guild guardian the proposal can end sooner after proposal endTime
    /// If this function is not called by the guild guardian the proposal can end sooner after proposal endTime plus
    /// the extraTimeForGuardian
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public override {
        require(
            proposals[proposalId].state == ProposalState.Submitted,
            "GuardedGuild: Proposal already executed"
        );
        require(
            (msg.sender == guildGuardian) && (proposals[proposalId].endTime < block.timestamp),
            "GuardedGuild: Proposal hasnt ended yet for guardian"
        );
        require(
            proposals[proposalId].endTime.add(extraTimeForGuardian) < block.timestamp,
            "GuardedGuild: Proposal hasnt ended yet for guild"
        );
        _endProposal(proposalId);
    }
    
    /// @dev Set GuardedGuild guardian configuration
    /// @param _guildGuardian The address of the guild guardian
    /// @param _extraTimeForGuardian The extra time the proposals would be locked for guardian verfication
    function setGuardianConfig(
        address _guildGuardian,
        uint256 _extraTimeForGuardian
    ) public isInitialized {
        require(
            msg.sender == address(this),
            "GuardedGuild: Only the guild can set the guardian config"
        );
        guildGuardian = _guildGuardian;
        extraTimeForGuardian = _extraTimeForGuardian;
    }
}
