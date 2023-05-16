// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../BaseNFTGuild.sol";
import "../../utils/PermissionRegistry.sol";
import "../utils/ipoap.sol";

/*
  @title POAPGuild
  @author github:rossneilson
  @dev Extends an NFT functionality into a Guild, adding a simple governance system over an NFT token.
  An NFTGuild is a simple organization that execute arbitrary calls if a minimum amount of votes is reached in a 
  proposal option while the proposal is active.
  The token used for voting needs to be locked for a minimum period of time in order to be used as voting power.
  Every time tokens are locked the timestamp of the lock is updated and increased the lock time seconds.
  Once the lock time passed the voter can withdraw his tokens.
  Each proposal has options, the voter can vote only once per proposal and cant change the chosen option, only
  increase the voting power of his vote.
  A proposal ends when the minimum amount of total voting power is reached on a proposal option before the proposal
  finish.
  When a proposal ends successfully it executes the calls of the winning option.
  The winning option has a certain amount of time to be executed successfully if that time passes and the option didn't
  executed successfully, it is marked as failed.
  The guild can execute only allowed functions, if a function is not allowed it will need to set the allowance for it.
  The allowed functions have a timestamp that marks from what time the function can be executed.
  A limit to a maximum amount of active proposals can be set, an active proposal is a proposal that is in Active state.
  Gas can be refunded to the account executing the vote, for this to happen the voteGas and maxGasPrice values need to
  be set.
  Signed votes can be executed in behalf of other users, to sign a vote the voter needs to hash it with the function
  hashVote, after signing the hash teh voter can share it to other account to be executed.
  Multiple votes and signed votes can be executed in one transaction.
*/
contract POAPGuild is BaseNFTGuild, Initializable, OwnableUpgradeable {
    using MathUpgradeable for uint256;

    mapping(uint256 => bool) public isEventRegistered;

    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        string memory _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint128 _maxActiveProposals,
        address _permissionRegistry,
        uint256[] calldata eventsIds
    ) public virtual initializer {
        require(_proposalTime > 0, "NFTGuild: proposal time has to be more than 0");
        require(_votingPowerForProposalExecution > 0, "NFTGuild: voting power for execution has to be more than 0");
        name = _name;
        token = IERC721Upgradeable(_token);
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerForProposalExecution = _votingPowerForProposalExecution;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
        permissionRegistry = PermissionRegistry(_permissionRegistry);

        for (uint256 i = 0; i < eventsIds.length; i++) {
            isEventRegistered[eventsIds[i]] = true;
        }

        setEIP712DomainSeparator();
    }

    // @dev Register events to include tokens for voting
    function registerEvent(uint256 eventId) external virtual {
        require(msg.sender == address(this), "ERC20Guild: Only callable by ERC20guild itself or when initialized");
        isEventRegistered[eventId] = true;
    }

    // @dev Remove events to include tokens for voting
    function removeEvent(uint256 eventId) external virtual {
        require(msg.sender == address(this), "ERC20Guild: Only callable by ERC20guild itself or when initialized");
        isEventRegistered[eventId] = true;
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
        require(isEventRegistered[eventId], "Invalid event");
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
            require(isEventRegistered[eventId], "Invalid event");
        }
        super.setVote(proposalId, option, tokenIds);
    }

    // @dev Set the voting power to vote in a proposal using a signed vote
    // @dev EIP-712:
    //   struct setSignedVote {
    //       bytes32 proposalId;
    //       uint256 option;
    //       address voter;
    //       uint256[] tokenIds;
    //   }
    // @param proposalId The id of the proposal to set the vote
    // @param option The proposal option to be voted
    // @param votingPower The votingPower to use in the proposal
    // @param tokenId The address of the voter
    // @param signature The signature of the hashed vote
    function setSignedVote(
        bytes32 proposalId,
        uint256 option,
        address voter,
        uint256[] calldata tokenIds,
        bytes calldata signature
    ) public virtual override {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 eventId = IPoap(address(token)).tokenEvent(tokenIds[i]);
            require(isEventRegistered[eventId], "Invalid event");
        }
        super.setSignedVote(proposalId, option, voter, tokenIds, signature);
    }
}
