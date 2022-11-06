// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
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
    using SafeMathUpgradeable for uint256;
    using MathUpgradeable for uint256;
    using AddressUpgradeable for address;

    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerPercentageForProposalExecution,
        string memory _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        uint256 _lockTime,
        address _permissionRegistry
    ) public virtual initializer {
        require(address(_token) != address(0), "NFTGuild: token cant be zero address");
        require(_proposalTime > 0, "NFTGuild: proposal time has to be more than 0");
        require(_lockTime >= _proposalTime, "NFTGuild: lockTime has to be higher or equal to proposalTime");
        require(
            _votingPowerPercentageForProposalExecution > 0,
            "NFTGuild: voting power for execution has to be more than 0"
        );
        name = _name;
        poap = IPoap(_token);
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerPercentageForProposalExecution = _votingPowerPercentageForProposalExecution;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
        permissionRegistry = PermissionRegistry(_permissionRegistry);
    }

    // The ERC721 token that will be used as source of voting power
    IPoap public poap;

    // Array to keep track of the events registered
    EnumerableSet.UintSet registeredEvents;

    // @dev Register token for voting
    function registerToken(uint256 tokenId) external override {
        require(EnumerableSet.contains(registeredEvents, poap.tokenEvent(tokenId)), "Event not registered");
        require(poap.ownerOf(tokenId) == msg.sender, "You do not own that token");
        EnumerableSet.add(registeredTokens, tokenId);
    }

    // @dev Remove burned/stale tokens
    function removeStaleTokens() external override {
        uint256 i = 0;
        for (i = 0; i < EnumerableSet.length(registeredTokens); i++) {
            try token.ownerOf(EnumerableSet.at(registeredTokens, i)) returns (address owner) {
                if (
                    keccak256(abi.encodePacked(owner)) ==
                    keccak256(abi.encodePacked("0x0000000000000000000000000000000000000000"))
                ) {
                    EnumerableSet.remove(registeredTokens, i);
                }
            } catch {
                EnumerableSet.remove(registeredTokens, i);
            }
        }
    }

    // @dev Register events to include tokens for voting
    function registerEvent(uint256 eventId) external virtual onlyOwner {
        EnumerableSet.add(registeredTokens, eventId);
    }

    // Copied directly only replacing token with poap
    // ----------------------------------------------

    // @dev Create a proposal with an static call data and extra information
    // @param to The receiver addresses of each call to be executed
    // @param data The data to be executed on each call to be executed
    // @param value The ETH value to be sent on each call to be executed
    // @param totalOptions The amount of options that would be offered to the voters
    // @param title The title of the proposal
    // @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        uint256 totalOptions,
        string memory title,
        string memory contentHash,
        uint256 ownedTokenId
    ) public override returns (bytes32) {
        require(activeProposalsNow < getMaxActiveProposals(), "ERC20Guild: Maximum amount of active proposals reached");
        require(
            poap.ownerOf(ownedTokenId) != msg.sender,
            "NFTGuild: Provide an NFT you currently own to create a proposal"
        );
        require(
            (to.length == data.length) && (to.length == value.length),
            "ERC20Guild: Wrong length of to, data or value arrays"
        );
        require(to.length > 0, "ERC20Guild: to, data value arrays cannot be empty");
        require(
            totalOptions <= to.length && value.length.mod(totalOptions) == 0,
            "ERC20Guild: Invalid totalOptions or option calls length"
        );
        require(totalOptions <= MAX_OPTIONS_PER_PROPOSAL, "ERC20Guild: Maximum amount of options per proposal reached");

        bytes32 proposalId = keccak256(abi.encodePacked(msg.sender, block.timestamp, totalProposals));
        totalProposals = totalProposals.add(1);
        Proposal storage newProposal = proposals[proposalId];
        newProposal.creator = msg.sender;
        newProposal.startTime = block.timestamp;
        newProposal.endTime = block.timestamp.add(proposalTime);
        newProposal.to = to;
        newProposal.data = data;
        newProposal.value = value;
        newProposal.title = title;
        newProposal.contentHash = contentHash;
        newProposal.state = ProposalState.Active;
        newProposal.totalOptions = totalOptions.add(1);
        newProposal.powerForExecution = (EnumerableSet.length(registeredTokens))
            .mul(votingPowerPercentageForProposalExecution)
            .div(10000);

        activeProposalsNow = activeProposalsNow.add(1);
        emit ProposalStateChanged(proposalId, uint256(ProposalState.Active));
        proposalsIds.push(proposalId);
        return proposalId;
    }

    // @dev Set the voting power to vote in a proposal
    // @param proposalId The id of the proposal to set the vote
    // @param option The proposal option to be voted
    // @param votingPower The votingPower to use in the proposal
    function setVote(
        bytes32 proposalId,
        uint256 option,
        uint256[] memory tokenIds
    ) public override {
        require(proposals[proposalId].endTime > block.timestamp, "ERC20Guild: Proposal ended, cannot be voted");

        uint256 i = 0;
        for (i = 0; i < tokenIds.length; i++) {
            require(poap.ownerOf(tokenIds[i]) != msg.sender, "Voting with tokens you don't own");

            uint256 x = 0;
            for (x = 0; x < proposals[proposalId].totalVotes.length; x++) {
                require(proposals[proposalId].totalVotes[x].tokenId != tokenIds[i], "This NFT already voted");
            }
            proposals[proposalId].totalVotes.push(Vote({tokenId: tokenIds[i], option: option}));
        }
        emit VoteAdded(proposalId, option, msg.sender, tokenIds);

        if (voteGas > 0) {
            uint256 gasRefund = voteGas.mul(tx.gasprice.min(maxGasPrice));

            if (address(this).balance >= gasRefund && !address(msg.sender).isContract()) {
                (bool success, ) = payable(msg.sender).call{value: gasRefund}("");
                require(success, "Failed to refund gas");
            }
        }
    }
}
