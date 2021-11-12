// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "../ERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "../../utils/ERC20/ERC20SnapshotRep.sol";

/*
  @title SnapshotRepERC20Guild
  @author github:AugustoL
  @dev An ERC20Guild designed to work with a snapshotted voting token.
  When a proposal is created it saves the snapshot if at the moment of creation, the voters can vote only with the voting
  power they had at that time.
*/
contract SnapshotRepERC20Guild is ERC20Guild, OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using ECDSAUpgradeable for bytes32;

    // Proposal id => Snapshot id
    mapping(bytes32 => uint256) proposalsSnapshots;

    // @dev Set the voting power to vote in a proposal
    // @param proposalId The id of the proposal to set the vote
    // @param action The proposal action to be voted
    // @param votingPower The votingPower to use in the proposal
    function setVote(bytes32 proposalId, uint256 action, uint256 votingPower) public override virtual {
        require(
            votingPowerOfAt(msg.sender, proposalsSnapshots[proposalId]) >=
                votingPower,
            "SnapshotERC20Guild: Invalid votingPower amount"
        );
        _setVote(msg.sender, proposalId, action, votingPower);
        _refundVote(payable(msg.sender));
    }

    // @dev Set the voting power to vote in a proposal using a signed vote
    // @param proposalId The id of the proposal to set the vote
    // @param action The proposal action to be voted
    // @param votingPower The votingPower to use in the proposal
    // @param voter The address of the voter
    // @param signature The signature of the hashed vote
    function setSignedVote(
        bytes32 proposalId,
        uint256 action,
        uint256 votingPower,
        address voter,
        bytes memory signature
    ) public override virtual isInitialized {
        bytes32 hashedVote = hashVote(voter, proposalId, action, votingPower);
        require(!signedVotes[hashedVote], "SnapshotERC20Guild: Already voted");
        require(
            voter == hashedVote.toEthSignedMessageHash().recover(signature),
            "SnapshotERC20Guild: Wrong signer"
        );
        require(
            votingPowerOfAt(voter, proposalsSnapshots[proposalId]) >=
                votingPower,
            "SnapshotERC20Guild: Invalid votingPower amount"
        );
        _setVote(voter, proposalId, action, votingPower);
        signedVotes[hashedVote] = true;
    }

    // @dev Create a proposal with an static call data and extra information
    // @param to The receiver addresses of each call to be executed
    // @param data The data to be executed on each call to be executed
    // @param value The ETH value to be sent on each call to be executed
    // @param totalActions The amount of actions that would be offered to the voters
    // @param title The title of the proposal
    // @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        uint256 totalActions,
        string memory title,
        bytes memory contentHash
    ) public override virtual isInitialized returns (bytes32) {
        bytes32 proposalId = _createProposal(to, data, value, totalActions, title, contentHash);
        proposalsSnapshots[proposalId] = ERC20SnapshotRep(address(token)).getCurrentSnapshotId();
        return proposalId;
    }

    // @dev Get the voting power of multiple addresses at a certain snapshotId
    // @param accounts The addresses of the accounts
    // @param snapshotIds The snapshotIds to be used
    function votingPowerOfMultipleAt(
        address[] memory accounts,
        uint256[] memory snapshotIds
    ) public view virtual returns (uint256[] memory) {
        uint256[] memory votes = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++)
            votes[i] = votingPowerOfAt(accounts[i], snapshotIds[i]);
        return votes;
    }

    
    // @dev Get the voting power of an address at a certain snapshotId
    // @param account The address of the account
    // @param snapshotId The snapshotId to be used
    function votingPowerOfAt(address account, uint256 snapshotId)
        public
        view
        virtual
        returns (uint256)
    {
        return ERC20SnapshotRep(address(token)).balanceOfAt(account, snapshotId);
    }

    // @dev Get the proposal snapshot id
    function getProposalSnapshotId(bytes32 proposalId) public view returns(uint256) {
        return proposalsSnapshots[proposalId];
    }
}
