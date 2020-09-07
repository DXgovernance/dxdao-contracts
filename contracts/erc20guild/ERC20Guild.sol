// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.5.17;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

/// @title ERC20Guild
/// @author github:AugustoL
/// @notice This smart contract has not be audited.
/// @dev Extends an ERC20 funcionality into a Guild.
/// An ERC20Guild can make decisions by creating proposals
/// and vote on the token balance as voting power.
contract ERC20Guild {
    using SafeMath for uint256;

    IERC20 public token;
    bool public initialized = false;
    uint256 public nonce = 0;
    uint256 public minimumProposalTime;
    uint256 public tokensForExecution;
    uint256 public tokensForCreation;
    
    struct Proposal {
        address creator;
        uint256 startTime;
        uint256 endTime;
        address[] to;
        bytes[] data;
        uint256[] value;
        string description;
        bytes contentHash;
        uint256 totalTokens;
        bool executed;
        mapping(address => uint256) tokens;
    }

    mapping(bytes32 => Proposal) public proposals;
    
    event ProposalCreated(bytes32 indexed proposalId);
    event ProposalExecuted(bytes32 indexed proposalId);
    event VoteAdded(bytes32 indexed proposalId, address voter, uint256 tokens);
    event VoteRemoved(bytes32 indexed proposalId, address voter, uint256 tokens);
    
    /// @dev Initilized modifier to require the contract to be initilized
    modifier isInitialized() {
        require(initialized, "ERC20Guild: Not initilized");
        _;
    }

    /// @dev Initilizer
    /// @param _token The address of the token to be used, it is immutable and ca
    /// @param _minimumProposalTime The minimun time for a proposal to be under votation
    /// @param _tokensForExecution The token votes needed for a proposal to be executed
    /// @param _tokensForCreation The minimum balance of tokens needed to create a proposal
    function initialize(
        address _token,
        uint256 _minimumProposalTime,
        uint256 _tokensForExecution,
        uint256 _tokensForCreation
    ) public {
        require(address(_token) != address(0), "ERC20Guild: token is the zero address");
        
        token = IERC20(_token);
        setConfig(_minimumProposalTime, _tokensForExecution, _tokensForCreation);
    }
    
    /// @dev Set the ERC20Guild configuration, can be callable only executing a proposal 
    /// or when it is initilized
    /// @param _minimumProposalTime The minimun time for a proposal to be under votation
    /// @param _tokensForExecution The token votes needed for a proposal to be executed
    /// @param _tokensForCreation The minimum balance of tokens needed to create a proposal
    function setConfig(
        uint256 _minimumProposalTime,
        uint256 _tokensForExecution,
        uint256 _tokensForCreation
    ) public {
        require(
            !initialized || (msg.sender == address(this)), 
            "ERC20Guild: Only callable by ERC20guild itself when initialized"
        );
        
        initialized = true;
        minimumProposalTime = _minimumProposalTime;
        tokensForExecution = _tokensForExecution;
        tokensForCreation = _tokensForCreation;
    }

    /// @dev Create a proposal with an static call data and extra information
    /// @param _to The receiver addresses of each call to be executed
    /// @param _data The data to be executed on each call to be executed
    /// @param _value The ETH value to be sent on each call to be executed
    /// @param _description A short description of the proposal
    /// @param _contentHash The content hash of the content reference of the proposal
    /// @param _extraTime The extra time to be added to the minimumProposalTime
    /// for teh proposal to be executed
    function createProposal(
        address[] memory _to,
        bytes[] memory _data,
        uint256[] memory _value,
        string memory _description,
        bytes memory _contentHash,
        uint256 _extraTime
    ) public isInitialized {
        require(
            votesOf(msg.sender) > tokensForCreation,
            "ERC20Guild: Not enough tokens to create proposal"
        );
        require(
            (_to.length == _data.length) && (_to.length == _value.length),
            "ERC20Guild: Wrong length of to, data or value arrays"
        );
        bytes32 proposalId = keccak256(abi.encodePacked(msg.sender, now, nonce));
        proposals[proposalId] = Proposal(
            msg.sender,
            now,
            now.add(minimumProposalTime).add(_extraTime),
            _to,
            _data,
            _value,
            _description,
            _contentHash,
            votesOf(msg.sender),
            false
        );
        nonce ++;
        
        emit ProposalCreated(proposalId);
    }
    
    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// @param proposalId The id of the proposal to be executed
    function executeProposal(bytes32 proposalId) public isInitialized {
        require(!proposals[proposalId].executed, "ERC20Guild: Proposal already executed");
        require(proposals[proposalId].endTime < now, "ERC20Guild: Proposal hasnt ended yet");
        require(
            proposals[proposalId].totalTokens >= tokensForExecution,
            "ERC20Guild: Not enough tokens to execute proposal"
        );
     
        for (uint i = 0; i < proposals[proposalId].to.length; i ++) {
            (bool success,) = proposals[proposalId].to[i]
                .call.value(proposals[proposalId].value[i])(proposals[proposalId].data[i]);
            require(success, "ERC20Guild: Proposal call failed");
        }
        
        emit ProposalExecuted(proposalId);
    }
    
    /// @dev Set the amount of tokens to vote in a proposal
    /// @param proposalId The id of the proposal to set the vote
    /// @param tokens The amount of tokens to use as voting for the proposal
    function setVote(bytes32 proposalId, uint256 tokens) public isInitialized {
        require(!proposals[proposalId].executed, "ERC20Guild: Proposal already executed");
        require(votesOf(msg.sender) >=  tokens, "ERC20Guild: Invalid tokens amount");
        
        if (tokens > proposals[proposalId].tokens[msg.sender]) {
            proposals[proposalId].totalTokens = proposals[proposalId].totalTokens.add(
                tokens.sub(proposals[proposalId].tokens[msg.sender])
            );
            emit VoteAdded(
                proposalId, msg.sender, tokens.sub(proposals[proposalId].tokens[msg.sender])
            );
        } else {
            proposals[proposalId].totalTokens = proposals[proposalId].totalTokens.sub(
                proposals[proposalId].tokens[msg.sender].sub(tokens)
            );
            emit VoteRemoved(
                proposalId, msg.sender, proposals[proposalId].tokens[msg.sender].sub(tokens)
            );
        }
        proposals[proposalId].tokens[msg.sender] = tokens;
    }
    
    /// @dev Set the amount of tokens to vote in multiple proposals
    /// @param proposalIds The ids of the proposals to set the vote
    /// @param tokens The amounts of tokens to use as voting for each proposals
    function setVotes(bytes32[] memory proposalIds, uint256[] memory tokens) public {
        require(
            proposalIds.length == tokens.length,
            "ERC20Guild: Wrong length of proposalIds or tokens"
        );
        for(uint i = 0; i < proposalIds.length; i ++)
            setVote(proposalIds[i], tokens[i]);
    }
    
    /// @dev Get the ERC20 token balance of an address
    /// @param holder The address of the token holder
    function votesOf(address holder) internal view returns(uint256) {
        return token.balanceOf(holder);
    }
    
    /// @dev Get the ERC20 token balance of multiple addresses
    /// @param holders The addressede of the token holders
    function votesOf(address[] memory holders) internal view returns(uint256[] memory) {
        uint256[] memory votes;
        for(uint i = 0; i < holders.length; i ++)
            votes[i] = votesOf(holders[i]);
        return votes;
    }

}
