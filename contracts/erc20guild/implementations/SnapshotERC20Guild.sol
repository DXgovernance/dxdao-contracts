// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "../ERC20GuildUpgradeable.sol";
import "../../utils/Arrays.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

/*
  @title SnapshotERC20Guild
  @author github:AugustoL
  @dev An ERC20Guild designed to work with a snapshotted locked tokens.
  It is an extension over the ERC20GuildUpgradeable where the voters can vote 
  with the voting power used at the moment of the proposal creation.
*/
contract SnapshotERC20Guild is ERC20GuildUpgradeable {
    using SafeMathUpgradeable for uint256;
    using Arrays for uint256[];
    using ECDSAUpgradeable for bytes32;

    // Proposal id => Snapshot id
    mapping(bytes32 => uint256) public proposalsSnapshots;

    // Snapshotted values have arrays of ids and the value corresponding to that id. These could be an array of a
    // Snapshot struct, but that would impede usage of functions that work on an array.
    struct Snapshots {
        uint256[] ids;
        uint256[] values;
    }

    // The snapshots used for votes and total tokens locked.
    mapping(address => Snapshots) private _votesSnapshots;
    Snapshots private _totalLockedSnapshots;

    // Snapshot ids increase monotonically, with the first value being 1. An id of 0 is invalid.
    uint256 private _currentSnapshotId = 1;

    /// @dev Set the voting power to vote in a proposal
    /// @param proposalId The id of the proposal to set the vote
    /// @param option The proposal option to be voted
    /// @param votingPower The votingPower to use in the proposal
    function setVote(
        bytes32 proposalId,
        uint256 option,
        uint256 votingPower
    ) public virtual override {
        require(proposals[proposalId].endTime > block.timestamp, "SnapshotERC20Guild: Proposal ended, cannot be voted");
        require(
            votingPowerOfAt(msg.sender, proposalsSnapshots[proposalId]) >= votingPower &&
                (votingPower > proposalVotes[proposalId][msg.sender].votingPower),
            "SnapshotERC20Guild: Invalid votingPower amount"
        );
        require(
            (proposalVotes[proposalId][msg.sender].option == 0 &&
                proposalVotes[proposalId][msg.sender].votingPower == 0) ||
                (proposalVotes[proposalId][msg.sender].option == option),
            "SnapshotERC20Guild: Cannot change option voted, only increase votingPower"
        );
        _setVote(msg.sender, proposalId, option, votingPower);
    }

    /// @dev Set the voting power to vote in a proposal using a signed vote
    /// @param proposalId The id of the proposal to set the vote
    /// @param option The proposal option to be voted
    /// @param votingPower The votingPower to use in the proposal
    /// @param voter The address of the voter
    /// @param signature The signature of the hashed vote
    function setSignedVote(
        bytes32 proposalId,
        uint256 option,
        uint256 votingPower,
        address voter,
        bytes memory signature
    ) public virtual override {
        require(proposals[proposalId].endTime > block.timestamp, "SnapshotERC20Guild: Proposal ended, cannot be voted");
        bytes32 hashedVote = hashVote(voter, proposalId, option, votingPower);
        require(!signedVotes[hashedVote], "SnapshotERC20Guild: Already voted");
        require(voter == hashedVote.toEthSignedMessageHash().recover(signature), "SnapshotERC20Guild: Wrong signer");
        signedVotes[hashedVote] = true;
        require(
            (votingPowerOfAt(voter, proposalsSnapshots[proposalId]) >= votingPower) &&
                (votingPower > proposalVotes[proposalId][voter].votingPower),
            "SnapshotERC20Guild: Invalid votingPower amount"
        );
        require(
            (proposalVotes[proposalId][voter].option == 0 && proposalVotes[proposalId][voter].votingPower == 0) ||
                (proposalVotes[proposalId][voter].option == option),
            "SnapshotERC20Guild: Cannot change option voted"
        );
        _setVote(voter, proposalId, option, votingPower);
    }

    /// @dev Lock tokens in the guild to be used as voting power
    /// @param tokenAmount The amount of tokens to be locked
    function lockTokens(uint256 tokenAmount) external virtual override {
        require(tokenAmount > 0, "SnapshotERC20Guild: Tokens to lock should be higher than 0");
        if (tokensLocked[msg.sender].amount == 0) totalMembers = totalMembers.add(1);
        _updateAccountSnapshot(msg.sender);
        _updateTotalSupplySnapshot();
        tokenVault.deposit(msg.sender, tokenAmount);
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.add(tokenAmount);
        tokensLocked[msg.sender].timestamp = block.timestamp.add(lockTime);
        totalLocked = totalLocked.add(tokenAmount);
        emit TokensLocked(msg.sender, tokenAmount);
    }

    /// @dev Release tokens locked in the guild, this will decrease the voting power
    /// @param tokenAmount The amount of tokens to be withdrawn
    function withdrawTokens(uint256 tokenAmount) external virtual override {
        require(
            votingPowerOf(msg.sender) >= tokenAmount,
            "SnapshotERC20Guild: Unable to withdraw more tokens than locked"
        );
        require(tokensLocked[msg.sender].timestamp < block.timestamp, "SnapshotERC20Guild: Tokens still locked");
        require(tokenAmount > 0, "SnapshotERC20Guild: amount of tokens to withdraw must be greater than 0");
        _updateAccountSnapshot(msg.sender);
        _updateTotalSupplySnapshot();
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.sub(tokenAmount);
        totalLocked = totalLocked.sub(tokenAmount);
        tokenVault.withdraw(msg.sender, tokenAmount);
        if (tokensLocked[msg.sender].amount == 0) totalMembers = totalMembers.sub(1);
        emit TokensWithdrawn(msg.sender, tokenAmount);
    }

    /// @dev Create a proposal with an static call data and extra information
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param totalOptions The amount of Options that would be offered to the voters
    /// @param title The title of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        uint256 totalOptions,
        string memory title,
        string memory contentHash
    ) public virtual override returns (bytes32) {
        bytes32 proposalId = super.createProposal(to, data, value, totalOptions, title, contentHash);
        _currentSnapshotId = _currentSnapshotId.add(1);
        proposalsSnapshots[proposalId] = _currentSnapshotId;
        return proposalId;
    }

    /// @dev Executes a proposal that is not votable anymore and can be finished
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public virtual override {
        require(!isExecutingProposal, "SnapshotERC20Guild: Proposal under execution");
        require(proposals[proposalId].state == ProposalState.Active, "SnapshotERC20Guild: Proposal already executed");
        require(proposals[proposalId].endTime < block.timestamp, "SnapshotERC20Guild: Proposal hasn't ended yet");
        uint256 winningOption = 0;
        uint256 i = 0;
        for (i = 0; i < proposals[proposalId].totalVotes.length; i++) {
            if (
                proposals[proposalId].totalVotes[i] >=
                getVotingPowerForProposalExecution(proposalsSnapshots[proposalId]) &&
                proposals[proposalId].totalVotes[i] > proposals[proposalId].totalVotes[winningOption]
            ) winningOption = i;
        }

        if (winningOption == 0) {
            proposals[proposalId].state = ProposalState.Rejected;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Rejected));
        } else if (proposals[proposalId].endTime.add(timeForExecution) < block.timestamp) {
            proposals[proposalId].state = ProposalState.Failed;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Failed));
        } else {
            proposals[proposalId].state = ProposalState.Executed;

            uint256 callsPerOption = proposals[proposalId].to.length.div(
                proposals[proposalId].totalVotes.length.sub(1)
            );
            i = callsPerOption.mul(winningOption.sub(1));
            uint256 endCall = i.add(callsPerOption);

            permissionRegistry.setERC20Balances();

            for (i; i < endCall; i++) {
                if (proposals[proposalId].to[i] != address(0) && proposals[proposalId].data[i].length > 0) {
                    bytes memory _data = proposals[proposalId].data[i];
                    bytes4 callDataFuncSignature;
                    assembly {
                        callDataFuncSignature := mload(add(_data, 32))
                    }
                    // The permission registry keeps track of all value transferred and checks call permission
                    try
                        permissionRegistry.setETHPermissionUsed(
                            address(this),
                            proposals[proposalId].to[i],
                            bytes4(callDataFuncSignature),
                            proposals[proposalId].value[i]
                        )
                    {} catch Error(string memory reason) {
                        revert(reason);
                    }

                    isExecutingProposal = true;
                    // We use isExecutingProposal variable to avoid re-entrancy in proposal execution
                    // slither-disable-next-line all
                    (bool success, ) = proposals[proposalId].to[i].call{value: proposals[proposalId].value[i]}(
                        proposals[proposalId].data[i]
                    );
                    require(success, "ERC20Guild: Proposal call failed");
                    isExecutingProposal = false;
                }
            }

            permissionRegistry.checkERC20Limits(address(this));

            emit ProposalStateChanged(proposalId, uint256(ProposalState.Executed));
        }
        activeProposalsNow = activeProposalsNow.sub(1);
    }

    /// @dev Get the voting power of an address at a certain snapshotId
    /// @param account The address of the account
    /// @param snapshotId The snapshotId to be used
    function votingPowerOfAt(address account, uint256 snapshotId) public view virtual returns (uint256) {
        (bool snapshotted, uint256 value) = _valueAt(snapshotId, _votesSnapshots[account]);
        if (snapshotted) return value;
        else return votingPowerOf(account);
    }

    /// @dev Get the voting power of multiple addresses at a certain snapshotId
    /// @param accounts The addresses of the accounts
    /// @param snapshotIds The snapshotIds to be used
    function votingPowerOfMultipleAt(address[] memory accounts, uint256[] memory snapshotIds)
        external
        view
        virtual
        returns (uint256[] memory)
    {
        require(
            accounts.length == snapshotIds.length,
            "SnapshotERC20Guild: SnapshotIds and accounts must have the same length"
        );
        uint256[] memory votes = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) votes[i] = votingPowerOfAt(accounts[i], snapshotIds[i]);
        return votes;
    }

    /// @dev Get the total amount of tokes locked at a certain snapshotId
    /// @param snapshotId The snapshotId to be used
    function totalLockedAt(uint256 snapshotId) public view virtual returns (uint256) {
        (bool snapshotted, uint256 value) = _valueAt(snapshotId, _totalLockedSnapshots);
        if (snapshotted) return value;
        else return totalLocked;
    }

    /// @dev Get minimum amount of votingPower needed for proposal execution
    function getVotingPowerForProposalExecution(uint256 snapshotId) public view virtual returns (uint256) {
        return totalLockedAt(snapshotId).mul(votingPowerPercentageForProposalExecution).div(10000);
    }

    /// @dev Get the proposal snapshot id
    function getProposalSnapshotId(bytes32 proposalId) external view returns (uint256) {
        return proposalsSnapshots[proposalId];
    }

    /// @dev Get the current snapshot id
    function getCurrentSnapshotId() external view returns (uint256) {
        return _currentSnapshotId;
    }

    ///
    // Private functions used to take track of snapshots in contract storage
    ///

    function _valueAt(uint256 snapshotId, Snapshots storage snapshots) private view returns (bool, uint256) {
        require(snapshotId > 0, "SnapshotERC20Guild: id is 0");
        // solhint-disable-next-line max-line-length
        require(snapshotId <= _currentSnapshotId, "SnapshotERC20Guild: nonexistent id");

        uint256 index = snapshots.ids.findUpperBound(snapshotId);

        if (index == snapshots.ids.length) {
            return (false, 0);
        } else {
            return (true, snapshots.values[index]);
        }
    }

    function _updateAccountSnapshot(address account) private {
        _updateSnapshot(_votesSnapshots[account], votingPowerOf(account));
    }

    function _updateTotalSupplySnapshot() private {
        _updateSnapshot(_totalLockedSnapshots, totalLocked);
    }

    function _updateSnapshot(Snapshots storage snapshots, uint256 currentValue) private {
        uint256 currentId = _currentSnapshotId;
        if (_lastSnapshotId(snapshots.ids) < currentId) {
            snapshots.ids.push(currentId);
            snapshots.values.push(currentValue);
        }
    }

    function _lastSnapshotId(uint256[] storage ids) private view returns (uint256) {
        if (ids.length == 0) {
            return 0;
        } else {
            return ids[ids.length - 1];
        }
    }
}
