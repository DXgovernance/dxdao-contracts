// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "./NFTGuildInitializable.sol";
import "../../utils/PermissionRegistry.sol";
import "../utils/ipoap.sol";

/*
  @title POAPGuild
  @author github:rossneilson
  @dev Extends the NFTGuildInitializable functionalities into a guild that is controlled by whitelisted POAP
  collections. Collections in the POAP contract are known as "events". More than one collection can be added
  to the guild's governance.
*/
contract POAPGuild is NFTGuildInitializable {
    mapping(uint256 => bool) public isEventRegistered;

    event PoapEventStatusChanged(uint256 indexed eventId, bool registered);

    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        string calldata _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint128 _maxActiveProposals,
        address _permissionRegistry,
        uint256[] calldata _eventsIds
    ) public virtual initializer {
        require(_proposalTime > 0, "POAPGuild: proposal time has to be more than 0");
        require(_votingPowerForProposalExecution > 0, "POAPGuild: voting power for execution has to be more than 0");
        require(_eventsIds.length > 0, "POAPGuild: at least 1 event id has to be registered");
        token = IERC721Upgradeable(_token);
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerForProposalExecution = _votingPowerForProposalExecution;
        name = _name;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
        permissionRegistry = PermissionRegistry(_permissionRegistry);

        for (uint256 i = 0; i < _eventsIds.length; i++) {
            isEventRegistered[_eventsIds[i]] = true;
            emit PoapEventStatusChanged(_eventsIds[i], true);
        }

        setEIP712DomainSeparator();
    }

    // @dev Register events to include tokens for voting
    function registerEvent(uint256 eventId) external virtual {
        require(msg.sender == address(this), "POAPGuild: Only callable by the guild itself");
        isEventRegistered[eventId] = true;
        emit PoapEventStatusChanged(eventId, true);
    }

    // @dev Remove events to include tokens for voting
    function removeEvent(uint256 eventId) external virtual {
        require(msg.sender == address(this), "POAPGuild: Only callable by the guild itself");
        isEventRegistered[eventId] = false;
        emit PoapEventStatusChanged(eventId, false);
    }

    // @dev Create a proposal with an static call data and extra information
    // @param to The receiver addresses of each call to be executed
    // @param data The data to be executed on each call to be executed
    // @param value The ETH value to be sent on each call to be executed
    // @param totalOptions The amount of options that would be offered to the voters
    // @param title The title of the proposal
    // @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        TxData[] calldata txDatas,
        uint256 totalOptions,
        string calldata title,
        string calldata contentHash,
        uint256 ownedTokenId
    ) public override returns (bytes32) {
        uint256 eventId = IPoap(address(token)).tokenEvent(ownedTokenId);
        require(isEventRegistered[eventId], "POAPGuild: Invalid event");
        return super.createProposal(txDatas, totalOptions, title, contentHash, ownedTokenId);
    }

    // @dev Set the voting power to vote in a proposal
    // @param proposalId The id of the proposal to set the vote
    // @param option The proposal option to be voted
    // @param votingPower The votingPower to use in the proposal
    function setVote(
        bytes32 proposalId,
        uint256 option,
        uint256[] calldata tokenIds
    ) public virtual override {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 eventId = IPoap(address(token)).tokenEvent(tokenIds[i]);
            require(isEventRegistered[eventId], "POAPGuild: Invalid event");
        }
        super.setVote(proposalId, option, tokenIds);
    }

    // @dev Set the voting power to vote in a proposal using a signed vote
    // @dev EIP-712:
    //   struct setSignedVote {
    //       bytes32 proposalId;
    //       uint256 option;
    //       uint256[] tokenIds;
    //   }
    // @param proposalId The id of the proposal to set the vote
    // @param option The proposal option to be voted
    // @param tokenIds The token ids to use in the proposal
    // @param signature The signature of the hashed vote
    function setSignedVote(
        bytes32 proposalId,
        uint256 option,
        uint256[] calldata tokenIds,
        bytes calldata signature
    ) public virtual override {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 eventId = IPoap(address(token)).tokenEvent(tokenIds[i]);
            require(isEventRegistered[eventId], "POAPGuild: Invalid event");
        }
        super.setSignedVote(proposalId, option, tokenIds, signature);
    }
}
