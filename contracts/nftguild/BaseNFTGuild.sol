// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../utils/PermissionRegistry.sol";

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
contract BaseNFTGuild {
    using MathUpgradeable for uint256;
    using ECDSAUpgradeable for bytes32;

    // This configuration value is defined as constant to be protected against a malicious proposal
    // changing it.
    uint8 public constant MAX_OPTIONS_PER_PROPOSAL = 10;

    // The EIP-712 domainSeparator specific to this deployed instance.
    bytes32 private DOMAIN_SEPARATOR;
    // The EIP-712 typeHash of setSignedVote:
    // keccak256("setSignedVote(bytes32 proposalId,uint256 option,address voter,uint256[] tokenIds)").
    bytes32 private constant VOTE_TYPEHASH = 0xc74f86518c139bb658f6d370c960db1befa159b34ebf74e88444e9cdb950b8fb;

    enum ProposalState {
        None,
        Active,
        Rejected,
        Executed,
        Failed
    }

    // The ERC721 token that will be used as source of voting power
    IERC721Upgradeable public token;

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
    uint256 public votingPowerForProposalExecution;

    uint256 public votingPowerForInstantProposalExecution;

    // The amount of gas in wei unit used for vote refunds
    uint256 public voteGas;

    // The maximum gas price used for vote refunds
    uint256 public maxGasPrice;

    // The maximum amount of proposals to be active at the same time
    uint128 public maxActiveProposals;

    // The total amount of proposals created, used as nonce for proposals creation
    uint128 public totalProposals;

    // The amount of active proposals
    uint256 public activeProposalsNow;

    // Vote and Proposal structs used in the proposals mapping
    struct Vote {
        uint248 option;
        bool hasVoted;
    }

    struct TxData {
        address to;
        uint256 value;
        bytes data;
    }

    struct Proposal {
        mapping(uint256 => uint256) totalVotes;
        uint40 startTime;
        uint40 endTime;
        uint16 totalOptions;
        ProposalState state;
    }

    // Mapping of proposal votes
    mapping(bytes32 => mapping(uint256 => Vote)) public proposalVotes;

    // Mapping of all proposals created indexed by proposal id
    mapping(bytes32 => Proposal) public proposals;

    // Array to keep track of the proposals ids in contract storage
    mapping(uint256 => bytes32) public proposalsIds;

    bool internal isExecutingProposal;

    // BaseERC20Guild is upgrade compatible. If new variables are added in an upgrade, make sure to update __gap.
    uint256[50] private __gap;

    event NewProposal(
        bytes32 indexed proposalId,
        uint256 indexed proposalIndex,
        TxData[] txData,
        string title,
        string contentHash
    );
    event ProposalStateChanged(bytes32 indexed proposalId, uint256 newState);
    event VoteAdded(bytes32 indexed proposalId, uint256 indexed option, address voter, uint256[] votingPower);

    fallback() external payable {}

    constructor() {
        setEIP712DomainSeparator();
    }

    function setEIP712DomainSeparator() internal {
        // EIP-712.
        // DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)").
        bytes32 DOMAIN_TYPEHASH = 0x8cad95687ba82c2ce50e74f7b754645e5117c3a5bec8151c0726d5857980a866;
        DOMAIN_SEPARATOR = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("NFT Guild"), block.chainid, address(this)));
    }

    // @dev Set the ERC20Guild configuration, can be called only executing a proposal or when it is initialized
    // @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    // @param _timeForExecution The amount of time in seconds that a proposal option will have to execute successfully
    // @param _votingPowerForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal
    // option
    // @param _votingPowerForInstantProposalExecution The percentage of voting power in base 10000 needed to execute a
    // proposal option without waiting till the votation period ends.
    // @param _voteGas The amount of gas in wei unit used for vote refunds.
    // Can't be higher than the gas used by setVote (117000)
    // @param _maxGasPrice The maximum gas price used for vote refunds
    // @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    function setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForInstantProposalExecution,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint128 _maxActiveProposals
    ) external virtual {
        require(msg.sender == address(this), "ERC20Guild: Only callable by ERC20guild itself");
        require(_proposalTime > 0, "ERC20Guild: proposal time has to be more than 0");
        require(_voteGas <= 117000, "ERC20Guild: vote gas has to be equal or lower than 117000");
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerForProposalExecution = _votingPowerForProposalExecution;
        votingPowerForInstantProposalExecution = _votingPowerForInstantProposalExecution;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
    }

    // @dev Create a proposal with an static call data and extra information
    // @param txDatas array containing the receiver addresses, the data to be executed and the ETH value for each call.
    // @param totalOptions The amount of options that would be offered to the voters
    // @param title The title of the proposal
    // @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    // @param ownedTokenId The id of a token owned by the creator of this proposal.
    function createProposal(
        TxData[] calldata txDatas,
        uint256 totalOptions,
        string calldata title,
        string calldata contentHash,
        uint256 ownedTokenId
    ) public virtual returns (bytes32) {
        require(activeProposalsNow < maxActiveProposals, "ERC20Guild: Maximum amount of active proposals reached");
        require(token.ownerOf(ownedTokenId) == msg.sender, "NFTGuild: Provide an NFT you own to create a proposal");
        require(txDatas.length > 0, "ERC20Guild: to, data value arrays cannot be empty");
        require(txDatas.length % totalOptions == 0, "ERC20Guild: Invalid totalOptions or option calls length");
        require(totalOptions <= MAX_OPTIONS_PER_PROPOSAL, "ERC20Guild: Maximum amount of options per proposal reached");

        bytes32 proposalId = bytes32(uint256(totalProposals));
        for (uint256 i = 0; i < txDatas.length; i++) {
            proposalId = keccak256(abi.encodePacked(proposalId, txDatas[i].to, txDatas[i].value, txDatas[i].data));
        }

        Proposal storage newProposal = proposals[proposalId];
        newProposal.startTime = uint40(block.timestamp);
        newProposal.endTime = uint40(block.timestamp + proposalTime);
        newProposal.state = ProposalState.Active;
        newProposal.totalOptions = uint16(totalOptions + 1);

        emit NewProposal(proposalId, totalProposals, txDatas, title, contentHash);

        proposalsIds[totalProposals] = proposalId;
        activeProposalsNow = activeProposalsNow + 1;
        totalProposals = totalProposals + 1;

        emit ProposalStateChanged(proposalId, uint256(ProposalState.Active));

        return proposalId;
    }

    // @dev Executes a proposal that is not votable anymore and can be finished
    // @param proposalId The id of the proposal to be executed
    function endProposal(uint256 proposalIndex, TxData[] calldata txDatas) public virtual {
        bytes32 proposalId = bytes32(proposalIndex);
        for (uint256 i = 0; i < txDatas.length; i++) {
            proposalId = keccak256(abi.encodePacked(proposalId, txDatas[i].to, txDatas[i].value, txDatas[i].data));
        }
        (uint256 winningOption, uint256 highestVoteAmount) = getWinningOption(proposalId);
        checkProposalExecutionState(proposalId, highestVoteAmount);

        Proposal storage proposal = proposals[proposalId];
        if (winningOption == 0) {
            proposal.state = ProposalState.Rejected;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Rejected));
        } else if (proposal.endTime + timeForExecution < block.timestamp) {
            proposal.state = ProposalState.Failed;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Failed));
        } else {
            proposal.state = ProposalState.Executed;

            uint256 callsPerOption = txDatas.length / (proposal.totalOptions - 1);
            uint256 i = callsPerOption * (winningOption - 1);
            uint256 endCall = i + callsPerOption;

            permissionRegistry.setERC20Balances();
            for (i; i < endCall; i++) {
                TxData calldata txData = txDatas[i];
                if (txData.to != address(0) && txData.data.length > 0) {
                    bytes4 functionSignature = bytes4(txData.data[:4]);
                    // The permission registry keeps track of all value transferred and checks call permission
                    permissionRegistry.setETHPermissionUsed(address(this), txData.to, functionSignature, txData.value);

                    isExecutingProposal = true;
                    // We use isExecutingProposal variable to avoid re-entrancy in proposal execution
                    // slither-disable-next-line all
                    (bool success, ) = txData.to.call{value: txData.value}(txData.data);
                    require(success, "ERC20Guild: Proposal call failed");
                    isExecutingProposal = false;
                }
            }

            permissionRegistry.checkERC20Limits(address(this));
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Executed));
        }
        activeProposalsNow = activeProposalsNow - 1;
    }

    // @dev Set the voting power to vote in a proposal
    // @param proposalId The id of the proposal to set the vote
    // @param option The proposal option to be voted
    // @param votingPower The votingPower to use in the proposal
    function setVote(
        bytes32 proposalId,
        uint256 option,
        uint256[] calldata tokenIds
    ) public virtual {
        require(proposals[proposalId].endTime > block.timestamp, "ERC20Guild: Proposal ended, cannot be voted");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(token.ownerOf(tokenIds[i]) == msg.sender, "Voting with tokens you don't own");
            require(proposalVotes[proposalId][tokenIds[i]].hasVoted == false, "This NFT already voted");

            proposalVotes[proposalId][tokenIds[i]].option = uint248(option);
            proposalVotes[proposalId][tokenIds[i]].hasVoted = true;
        }
        proposals[proposalId].totalVotes[option] += tokenIds.length;
        emit VoteAdded(proposalId, option, msg.sender, tokenIds);

        if (voteGas > 0) {
            uint256 gasRefund = voteGas * tx.gasprice.min(maxGasPrice);

            if (address(this).balance >= gasRefund) {
                (bool success, ) = payable(msg.sender).call{value: gasRefund}("");
                require(success, "Failed to refund gas");
            }
        }
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
    ) public virtual {
        require(proposals[proposalId].endTime > block.timestamp, "ERC20Guild: Proposal ended, cannot be voted");

        bytes32 structHash = keccak256(
            abi.encodePacked(VOTE_TYPEHASH, proposalId, option, voter, keccak256(abi.encodePacked(tokenIds)))
        );
        bytes32 eip712Hash = ECDSAUpgradeable.toTypedDataHash(DOMAIN_SEPARATOR, structHash);
        require(voter == eip712Hash.recover(signature), "ERC20Guild: Wrong signer");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(token.ownerOf(tokenIds[i]) == voter, "Voting with tokens you don't own");
            require(proposalVotes[proposalId][tokenIds[i]].hasVoted == false, "This NFT already voted");

            proposalVotes[proposalId][tokenIds[i]].option = uint248(option);
            proposalVotes[proposalId][tokenIds[i]].hasVoted = true;
        }
        proposals[proposalId].totalVotes[option] += tokenIds.length;
        emit VoteAdded(proposalId, option, msg.sender, tokenIds);
    }

    /// @dev Reverts if proposal cannot be executed
    /// @param proposalId The id of the proposal to evaluate
    /// @param highestVoteAmount The amounts of votes received by the currently winning proposal option.
    function checkProposalExecutionState(bytes32 proposalId, uint256 highestVoteAmount) internal view virtual {
        require(!isExecutingProposal, "ERC20Guild: Proposal under execution");
        require(proposals[proposalId].state == ProposalState.Active, "ERC20Guild: Proposal already executed");

        if (votingPowerForInstantProposalExecution == 0 || highestVoteAmount < votingPowerForInstantProposalExecution) {
            require(proposals[proposalId].endTime < block.timestamp, "ERC20Guild: Proposal hasn't ended yet");
        }
    }

    /// @dev Gets the current winning option for a given proposal.
    /// @param proposalId The id of the proposal to evaluate
    /// @param highestVoteAmount The amounts of votes received by the currently winning proposal option.
    function getWinningOption(bytes32 proposalId)
        internal
        view
        virtual
        returns (uint256 winningOption, uint256 highestVoteAmount)
    {
        Proposal storage proposal = proposals[proposalId];
        highestVoteAmount = proposal.totalVotes[0];
        uint256 totalOptions = proposal.totalOptions;
        for (uint256 i = 1; i < totalOptions; i++) {
            uint256 totalVotesOptionI = proposal.totalVotes[i];
            if (totalVotesOptionI >= votingPowerForProposalExecution && totalVotesOptionI >= highestVoteAmount) {
                if (totalVotesOptionI == highestVoteAmount) {
                    winningOption = 0;
                } else {
                    winningOption = i;
                    highestVoteAmount = totalVotesOptionI;
                }
            }
        }
    }

    // @dev Get the information of a proposal
    // @param proposalId The id of the proposal to get the information
    // @return creator The address that created the proposal
    // @return startTime The time at the proposal was created
    // @return endTime The time at the proposal will end
    // @return state If the proposal state
    // @return totalVotes The total votes of the proposal
    function getProposal(bytes32 proposalId)
        external
        view
        virtual
        returns (
            uint256 startTime,
            uint256 endTime,
            uint256 totalOptions,
            ProposalState state,
            uint256[] memory totalVotes
        )
    {
        totalVotes = new uint256[](proposals[proposalId].totalOptions + 1);
        for (uint256 i = 0; i < totalVotes.length; i++) {
            totalVotes[i] = proposals[proposalId].totalVotes[i];
        }
        return (
            proposals[proposalId].startTime,
            proposals[proposalId].endTime,
            proposals[proposalId].totalOptions,
            proposals[proposalId].state,
            totalVotes
        );
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

    // @dev Get the activeProposalsNow
    function getActiveProposalsNow() external view returns (uint256) {
        return activeProposalsNow;
    }

    // @dev Get the proposalsIds array
    function getProposalsIds(uint256 from, uint256 to) external view returns (bytes32[] memory ids) {
        uint256 length = to - from;
        ids = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            ids[i] = proposalsIds[from + i];
        }
        return ids;
    }

    // @dev Get minimum amount of votingPower needed for proposal execution
    function getVotingPowerForProposalExecution() public view virtual returns (uint256) {
        return votingPowerForProposalExecution;
    }

    // @dev Get the votes of a voter in a proposal
    // @param proposalId The id of the proposal to get the information
    // @param tokenId The address of the voter to get the votes
    // @return option The selected option of teh voter
    function getProposalVoteOfTokenId(bytes32 proposalId, uint256 tokenId)
        external
        view
        virtual
        returns (uint256 option)
    {
        return proposalVotes[proposalId][tokenId].option;
    }

    // @dev Get the length of the proposalIds array
    function getProposalsIdsLength() external view virtual returns (uint256) {
        return totalProposals;
    }
}
