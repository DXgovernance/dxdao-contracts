// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
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
    using AddressUpgradeable for address;

    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
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
        name = _name;
        poap = IPoap(_token);
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerForProposalExecution = _votingPowerForProposalExecution;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
        permissionRegistry = PermissionRegistry(_permissionRegistry);
    }

    // The ERC721 token that will be used as source of voting power
    IPoap public poap;

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
            totalOptions <= to.length && value.length % totalOptions == 0,
            "ERC20Guild: Invalid totalOptions or option calls length"
        );
        require(totalOptions <= MAX_OPTIONS_PER_PROPOSAL, "ERC20Guild: Maximum amount of options per proposal reached");

        bytes32 proposalId = keccak256(abi.encodePacked(msg.sender, block.timestamp, totalProposals));
        totalProposals = totalProposals + 1;
        Proposal storage newProposal = proposals[proposalId];
        newProposal.creator = msg.sender;
        newProposal.startTime = block.timestamp;
        newProposal.endTime = block.timestamp + proposalTime;
        newProposal.to = to;
        newProposal.data = data;
        newProposal.value = value;
        newProposal.title = title;
        newProposal.contentHash = contentHash;
        newProposal.state = ProposalState.Active;
        newProposal.totalOptions = totalOptions + 1;
        newProposal.powerForExecution = votingPowerForProposalExecution;

        activeProposalsNow = activeProposalsNow + 1;
        emit ProposalStateChanged(proposalId, uint256(ProposalState.Active));
        proposalsIds.push(proposalId);
        return proposalId;
    }
}
