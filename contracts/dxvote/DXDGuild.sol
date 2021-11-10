// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

pragma experimental ABIEncoderV2;

import "../erc20guild/implementations/LockableERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

/// @title DXDGuild
/// @author github:AugustoL
/// An ERC20Guild for the DXD token designed to execute votes on Genesis Protocol Voting Machine.
contract DXDGuild is LockableERC20Guild, OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

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
    /// @param _permissionDelay The amount of seconds that are going to be added over the timestamp of the block when
    /// a permission is allowed
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
        uint256 _permissionDelay,
        uint256 _lockTime,
        address _votingMachine
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
            "DXDGuild",
            _voteGas,
            _maxGasPrice,
            _permissionDelay
        );
        tokenVault = new TokenVault();
        tokenVault.initialize(address(token), address(this));
        lockTime = _lockTime;
        callPermissions[address(this)][
            bytes4(
                keccak256(
                    "setLockTime(uint256)"
                )
            )
        ] = block.timestamp;
        callPermissions[_votingMachine][bytes4(keccak256("vote(bytes32,uint256,uint256,address)"))] = block.timestamp;
        initialized = true;
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
