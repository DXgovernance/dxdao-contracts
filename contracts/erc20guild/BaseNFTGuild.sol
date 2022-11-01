// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "../utils/PermissionRegistry.sol";
import "../utils/TokenVault.sol";

/*
  @title BaseERC20Guild
  @author github:rossneilson
  @dev Extends an ERC20 functionality into a Guild, adding a simple governance system over an ERC20 token.
  An ERC20Guild is a simple organization that execute arbitrary calls if a minimum amount of votes is reached in a 
  proposal option while the proposal is active.
  The token used for voting needs to be locked for a minimum period of time in order to be used as voting power.
  Every time tokens are locked the timestamp of the lock is updated and increased the lock time seconds.
  Once the lock time passed the voter can withdraw his tokens.
  Each proposal has options, the voter can vote only once per proposal and cannot change the chosen option, only
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
  The guild can sign EIP1271 messages, to do this the guild needs to call itself and allow the signature to be verified 
  with and extra signature of any account with voting power.
*/
contract BaseERC20Guild {
    using SafeMathUpgradeable for uint256;
    using MathUpgradeable for uint256;
    using ECDSAUpgradeable for bytes32;
    using AddressUpgradeable for address;

    // This configuration value is defined as constant to be protected against a malicious proposal
    // changing it.
    uint8 public constant MAX_OPTIONS_PER_PROPOSAL = 10;

    enum ProposalState {
        None,
        Active,
        Rejected,
        Executed,
        Failed
    }

    // The ERC20 token that will be used as source of voting power
    IERC20Upgradeable public token;

    // The address of the PermissionRegistry to be used
    PermissionRegistry permissionRegistry;

    // The name of the ERC20Guild
    string public name;

    // The amount of time in seconds that a proposal will be active for voting
    uint256 public proposalTime;

    // The amount of time in seconds that a proposal option will have to execute successfully
    uint256 public timeForExecution;

    // The percentage of voting power in base 10000 needed to execute a proposal option
    // 100 == 1% 2500 == 25%
    uint256 public votingPowerPercentageForProposalExecution;

    // The percentage of voting power in base 10000 needed to create a proposal
    // 100 == 1% 2500 == 25%
    uint256 public votingPowerPercentageForProposalCreation;

    // The amount of gas in wei unit used for vote refunds
    uint256 public voteGas;

    // The maximum gas price used for vote refunds
    uint256 public maxGasPrice;

    // The maximum amount of proposals to be active at the same time
    uint256 public maxActiveProposals;

    // The total amount of proposals created, used as nonce for proposals creation
    uint256 public totalProposals;

    // The total amount of members that have voting power
    uint256 totalMembers;

    // The amount of active proposals
    uint256 public activeProposalsNow;

    // Vote and Proposal structs used in the proposals mapping
    struct Vote {
        uint256 option;
        uint256 tokenId;
    }

    struct Proposal {
        address creator;
        uint256 startTime;
        uint256 endTime;
        uint256 powerForExecution;
        address[] to;
        bytes[] data;
        uint256[] value;
        string title;
        string contentHash;
        ProposalState state;
        Vote[] totalVotes;
        uint256 totalOptions;
    }

    // Mapping of all proposals created indexed by proposal id
    mapping(bytes32 => Proposal) public proposals;

    // Array to keep track of the proposals ids in contract storage
    bytes32[] public proposalsIds;

    event ProposalStateChanged(bytes32 indexed proposalId, uint256 newState);
    event VoteAdded(bytes32 indexed proposalId, uint256 indexed option, address voter, uint256 votingPower);
    event TokensLocked(address voter, uint256 value);
    event TokensWithdrawn(address voter, uint256 value);

    bool internal isExecutingProposal;

    fallback() external payable {}

    // @dev Set the ERC20Guild configuration, can be called only executing a proposal or when it is initialized
    // @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    // @param _timeForExecution The amount of time in seconds that a proposal option will have to execute successfully
    // @param _votingPowerPercentageForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal
    // option
    // @param _votingPowerPercentageForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    // @param _voteGas The amount of gas in wei unit used for vote refunds.
    // Can't be higher than the gas used by setVote (117000)
    // @param _maxGasPrice The maximum gas price used for vote refunds
    // @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    // @param _lockTime The minimum amount of seconds that the tokens would be locked
    function setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerPercentageForProposalExecution,
        uint256 _votingPowerPercentageForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        uint256 _minimumMembersForProposalCreation,
        uint256 _minimumTokensLockedForProposalCreation
    ) external virtual {
        require(msg.sender == address(this), "ERC20Guild: Only callable by ERC20guild itself or when initialized");
        require(_proposalTime > 0, "ERC20Guild: proposal time has to be more than 0");
        require(
            _votingPowerPercentageForProposalExecution > 0,
            "ERC20Guild: voting power for execution has to be more than 0"
        );
        require(_voteGas <= 117000, "ERC20Guild: vote gas has to be equal or lower than 117000");
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerPercentageForProposalExecution = _votingPowerPercentageForProposalExecution;
        votingPowerPercentageForProposalCreation = _votingPowerPercentageForProposalCreation;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
    }

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
        uint256 memory ownedTokenId
    ) public virtual returns (bytes32) {
        require(activeProposalsNow < getMaxActiveProposals(), "ERC20Guild: Maximum amount of active proposals reached");
        require(
            token.ownerOf(ownedTokenId) != msg.sender,
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
        newProposal.totalVotes = new Vote[];
        newProposal.state = ProposalState.Active;
        newProposal.totalOptions = totalOptions.add(1);

        activeProposalsNow = activeProposalsNow.add(1);
        emit ProposalStateChanged(proposalId, uint256(ProposalState.Active));
        proposalsIds.push(proposalId);
        return proposalId;
    }

    // @dev Executes a proposal that is not votable anymore and can be finished
    // @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public virtual {
        require(!isExecutingProposal, "ERC20Guild: Proposal under execution");
        require(proposals[proposalId].state == ProposalState.Active, "ERC20Guild: Proposal already executed");
        require(proposals[proposalId].endTime < block.timestamp, "ERC20Guild: Proposal hasn't ended yet");

        uint256 i = 1;
        uint8[proposals[proposalId].totalOptions] memory tally;
        for (i = 1; i < proposals[proposalId].totalVotes.length; i++) {
            tally[proposals[proposalId].totalVotes[i].option] = tally[proposals[proposalId].totalVotes[i].option] + 1;
        }

        uint256 winningOption = 0;
        uint256 highestVoteAmount = tally[0];
        for (i = 1; i < tally.length; i++) {
            if (tally[i] >= getVotingPowerForProposalExecution() && tally[i] >= highestVoteAmount) {
                if (tally[i] == highestVoteAmount) {
                    winningOption = 0;
                } else {
                    winningOption = i;
                    highestVoteAmount = tally[i];
                }
            }
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

    // @dev Set the voting power to vote in a proposal
    // @param proposalId The id of the proposal to set the vote
    // @param option The proposal option to be voted
    // @param votingPower The votingPower to use in the proposal
    function setVote(
        bytes32 proposalId,
        uint256 option,
        uint256[] tokenIds
    ) public virtual {
        require(proposals[proposalId].endTime > block.timestamp, "ERC20Guild: Proposal ended, cannot be voted");

        uint256 i = 1;
        for (i = 1; i < tokenIds.length; i++) {
            require(token.ownerOf(tokenIds[i].tokenId) != msg.sender, "Voting with tokens you don't own");

            uint256 x = 1;
            for (x = 1; x < proposals[proposalId].totalVotes.length; x++) {
                require(proposals[proposalId].totalVotes[x].tokenId != tokenIds[i], "This NFT already voted");
            }
            proposals[proposalId].totalVotes.push({tokenId: tokenIds[i], option: option});
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

    // @dev Set the voting power to vote in a proposal using a signed vote
    // @param proposalId The id of the proposal to set the vote
    // @param option The proposal option to be voted
    // @param votingPower The votingPower to use in the proposal
    // @param voter The address of the voter
    // @param signature The signature of the hashed vote
    // function setSignedVote(
    //     bytes32 proposalId,
    //     uint256 option,
    //     uint256 votingPower,
    //     address voter,
    //     bytes memory signature
    // ) public virtual {
    //     require(proposals[proposalId].endTime > block.timestamp, "ERC20Guild: Proposal ended, cannot be voted");
    //     bytes32 hashedVote = hashVote(voter, proposalId, option, votingPower);
    //     require(!signedVotes[hashedVote], "ERC20Guild: Already voted");
    //     require(voter == hashedVote.toEthSignedMessageHash().recover(signature), "ERC20Guild: Wrong signer");
    //     signedVotes[hashedVote] = true;
    //     require(
    //         (votingPowerOf(voter) >= votingPower) && (votingPower > proposalVotes[proposalId][voter].votingPower),
    //         "ERC20Guild: Invalid votingPower amount"
    //     );
    //     require(
    //         (proposalVotes[proposalId][voter].option == 0 && proposalVotes[proposalId][voter].votingPower == 0) ||
    //             (proposalVotes[proposalId][voter].option == option &&
    //                 proposalVotes[proposalId][voter].votingPower < votingPower),
    //         "ERC20Guild: Cannot change option voted, only increase votingPower"
    //     );
    //     _setVote(voter, proposalId, option, votingPower);
    // }

    // @dev Get the information of a proposal
    // @param proposalId The id of the proposal to get the information
    // @return creator The address that created the proposal
    // @return startTime The time at the proposal was created
    // @return endTime The time at the proposal will end
    // @return to The receiver addresses of each call to be executed
    // @return data The data to be executed on each call to be executed
    // @return value The ETH value to be sent on each call to be executed
    // @return title The title of the proposal
    // @return contentHash The content hash of the content reference of the proposal
    // @return state If the proposal state
    // @return totalVotes The total votes of the proposal
    function getProposal(bytes32 proposalId) external view virtual returns (Proposal memory) {
        return (proposals[proposalId]);
    }

    // @dev Get the address of the ERC20Token used for voting
    function getToken() external view returns (address) {
        return address(token);
    }

    // @dev Get the address of the permission registry contract
    function getPermissionRegistry() external view returns (address) {
        return address(permissionRegistry);
    }

    // @dev Get the name of the ERC20Guild
    function getName() external view returns (string memory) {
        return name;
    }

    // @dev Get the proposalTime
    function getProposalTime() external view returns (uint256) {
        return proposalTime;
    }

    // @dev Get the timeForExecution
    function getTimeForExecution() external view returns (uint256) {
        return timeForExecution;
    }

    // @dev Get the voteGas
    function getVoteGas() external view returns (uint256) {
        return voteGas;
    }

    // @dev Get the maxGasPrice
    function getMaxGasPrice() external view returns (uint256) {
        return maxGasPrice;
    }

    // @dev Get the maxActiveProposals
    function getMaxActiveProposals() public view returns (uint256) {
        return maxActiveProposals;
    }

    // @dev Get the totalProposals
    function getTotalProposals() external view returns (uint256) {
        return totalProposals;
    }

    // @dev Get the totalMembers
    function getTotalMembers() public view returns (uint256) {
        return totalMembers;
    }

    // @dev Get the activeProposalsNow
    function getActiveProposalsNow() external view returns (uint256) {
        return activeProposalsNow;
    }

    // @dev Get if a signed vote has been executed or not
    function getSignedVote(bytes32 signedVoteHash) external view returns (bool) {
        return signedVotes[signedVoteHash];
    }

    // @dev Get the proposalsIds array
    function getProposalsIds() external view returns (bytes32[] memory) {
        return proposalsIds;
    }

    // @dev Get the votes of a voter in a proposal
    // @param proposalId The id of the proposal to get the information
    // @param voter The address of the voter to get the votes
    // @return option The selected option of teh voter
    // @return votingPower The amount of voting power used in the vote
    function getProposalVotesOfTokenId(bytes32 proposalId, uint256 tokenId)
        external
        view
        virtual
        returns (uint256 option, uint256 votingPower)
    {
        for (uint256 i = 1; proposals[proposalId].totalVotes.length; i++) {
            return proposals[proposalId].totalVotes[i].option;
        }
    }

    // @dev Get the length of the proposalIds array
    function getProposalsIdsLength() external view virtual returns (uint256) {
        return proposalsIds.length;
    }

    // @dev Get the lockTime
    function getLockTime() external view virtual returns (uint256) {
        return lockTime;
    }

    // @dev Get the hash of the vote, this hash is later signed by the voter.
    // @param voter The address that will be used to sign the vote
    // @param proposalId The id fo the proposal to be voted
    // @param option The proposal option to be voted
    // @param votingPower The amount of voting power to be used
    function hashVote(
        address voter,
        bytes32 proposalId,
        uint256 option,
        uint256 votingPower
    ) public pure virtual returns (bytes32) {
        return keccak256(abi.encodePacked(voter, proposalId, option, votingPower));
    }
}
