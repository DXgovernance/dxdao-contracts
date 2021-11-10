// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "./LockableERC20Guild.sol";
import "../../utils/Arrays.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

/// @title SnapshotGuild
/// @author github:AugustoL
contract SnapshotGuild is LockableERC20Guild {
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
    uint256 private _currentSnapshotId;

    /// @dev Set the voting power to vote in a proposal
    /// @param proposalId The id of the proposal to set the vote
    /// @param action The proposal action to be voted
    /// @param votingPower The votingPower to use in the proposal
    function setVote(bytes32 proposalId, uint256 action, uint256 votingPower) public override virtual {
        require(
            votingPowerOfAt(msg.sender, proposalsSnapshots[proposalId]) >=
                votingPower,
            "SnapshotGuild: Invalid votingPower amount"
        );
        _setVote(msg.sender, proposalId, action, votingPower);
        _refundVote(payable(msg.sender));
    }

    /// @dev Set the voting power to vote in a proposal using a signed vote
    /// @param proposalId The id of the proposal to set the vote
    /// @param action The proposal action to be voted
    /// @param votingPower The votingPower to use in the proposal
    /// @param voter The address of the voter
    /// @param signature The signature of the hashed vote
    function setSignedVote(
        bytes32 proposalId,
        uint256 action,
        uint256 votingPower,
        address voter,
        bytes memory signature
    ) public override virtual isInitialized {
        bytes32 hashedVote = hashVote(voter, proposalId, action, votingPower);
        require(!signedVotes[hashedVote], "SnapshotGuild: Already voted");
        require(
            voter == hashedVote.toEthSignedMessageHash().recover(signature),
            "SnapshotGuild: Wrong signer"
        );
        require(
            votingPowerOfAt(voter, proposalsSnapshots[proposalId]) >=
                votingPower,
            "SnapshotGuild: Invalid votingPower amount"
        );
        _setVote(voter, proposalId, action, votingPower);
        signedVotes[hashedVote] = true;
    }


    /// @dev Lock tokens in the guild to be used as voting power
    /// @param tokenAmount The amount of tokens to be locked
    function lockTokens(uint256 tokenAmount) public override virtual {
        _updateAccountSnapshot(msg.sender);
        _updateTotalSupplySnapshot();
        tokenVault.deposit(msg.sender, tokenAmount);
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.add(
            tokenAmount
        );
        tokensLocked[msg.sender].timestamp = block.timestamp.add(lockTime);
        totalLocked = totalLocked.add(tokenAmount);
        emit TokensLocked(msg.sender, tokenAmount);
    }

    /// @dev Release tokens locked in the guild, this will decrease the voting power
    /// @param tokenAmount The amount of tokens to be released
    function releaseTokens(uint256 tokenAmount) public override virtual {
        require(
            votingPowerOf(msg.sender) >= tokenAmount,
            "SnapshotGuild: Unable to release more tokens than locked"
        );
        require(
            tokensLocked[msg.sender].timestamp < block.timestamp,
            "SnapshotGuild: Tokens still locked"
        );
        _updateAccountSnapshot(msg.sender);
        _updateTotalSupplySnapshot();
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.sub(
            tokenAmount
        );
        totalLocked = totalLocked.sub(tokenAmount);
        tokenVault.withdraw(msg.sender, tokenAmount);
        emit TokensReleased(msg.sender, tokenAmount);
    }

    /// @dev Create a proposal with an static call data and extra information
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param totalActions The amount of actions that would be offered to the voters
    /// @param title The title of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        uint256 totalActions,
        string memory title,
        bytes memory contentHash
    ) public override virtual isInitialized returns (bytes32) {
        bytes32 proposalId = _createProposal(to, data, value, totalActions, title, contentHash);
        proposalsSnapshots[proposalId] = _currentSnapshotId;
        return proposalId;
    }

    /// @dev Get the voting power of an address at a certain snapshotId
    /// @param account The address of the account
    /// @param snapshotId The snapshotId to be used
    function votingPowerOfAt(address account, uint256 snapshotId)
        public
        view
        virtual
        returns (uint256)
    {
        (bool snapshotted, uint256 value) =
            _valueAt(snapshotId, _votesSnapshots[account]);
        if (snapshotted) return value;
        else return votingPowerOf(account);
    }

    /// @dev Get the voting power of multiple addresses at a certain snapshotId
    /// @param accounts The addresses of the accounts
    /// @param snapshotIds The snapshotIds to be used
    function votingPowerOfMultipleAt(
        address[] memory accounts,
        uint256[] memory snapshotIds
    ) public view virtual returns (uint256[] memory) {
        uint256[] memory votes = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++)
            votes[i] = votingPowerOfAt(accounts[i], snapshotIds[i]);
        return votes;
    }

    /// @dev Get the total amount of tokes locked at a certain snapshotId
    /// @param snapshotId The snapshotId to be used
    function totalLockedAt(uint256 snapshotId)
        public
        view
        virtual
        returns (uint256)
    {
        (bool snapshotted, uint256 value) =
            _valueAt(snapshotId, _totalLockedSnapshots);
        if (snapshotted) return value;
        else return totalLocked;
    }

    ///
    /// Private functions used to take track of snapshots in contract storage
    ///

    function _valueAt(uint256 snapshotId, Snapshots storage snapshots)
        private
        view
        returns (bool, uint256)
    {
        require(snapshotId > 0, "SnapshotGuild: id is 0");
        // solhint-disable-next-line max-line-length
        require(snapshotId <= _currentSnapshotId, "SnapshotGuild: nonexistent id");

        // When a valid snapshot is queried, there are three possibilities:
        //  a) The queried value was not modified after the snapshot was taken. Therefore, a snapshot entry was never
        //  created for this id, and all stored snapshot ids are smaller than the requested one. The value that corresponds
        //  to this id is the current one.
        //  b) The queried value was modified after the snapshot was taken. Therefore, there will be an entry with the
        //  requested id, and its value is the one to return.
        //  c) More snapshots were created after the requested one, and the queried value was later modified. There will be
        //  no entry for the requested id: the value that corresponds to it is that of the smallest snapshot id that is
        //  larger than the requested one.
        //
        // In summary, we need to find an element in an array, returning the index of the smallest value that is larger if
        // it is not found, unless said value doesn't exist (e.g. when all values are smaller). Arrays.findUpperBound does
        // exactly this.

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

    function _updateSnapshot(Snapshots storage snapshots, uint256 currentValue)
        private
    {
        uint256 currentId = _currentSnapshotId;
        if (_lastSnapshotId(snapshots.ids) < currentId) {
            snapshots.ids.push(currentId);
            snapshots.values.push(currentValue);
        }
    }

    function _lastSnapshotId(uint256[] storage ids)
        private
        view
        returns (uint256)
    {
        if (ids.length == 0) {
            return 0;
        } else {
            return ids[ids.length - 1];
        }
    }
}
