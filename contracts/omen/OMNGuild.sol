// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "../erc20guild/ERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../realitio/IRealitio.sol";

/// @title OMNGuild - OMEN Token ERC20Guild
/// The OMN guild will use the OMN token for governance, having to lock the tokens, and needing a minimum amount of 
/// tokens locked to create proposals.
/// The guild will be used for OMN token governance and to arbitrate markets validation in omen, using realit.io
/// boolean question markets "Is market MARKET_ID valid?".
/// The guild will be summoned to arbitrate a market validation if required.
/// The voters who vote in market validation proposals will recieve a vote reward.
contract OMNGuild is ERC20Guild {
    using SafeMathUpgradeable for uint256;

    // The max amount of votes that can de used in a proposal
    uint256 public maxAmountVotes;
    uint256 public guildProposalCnt;
    
    // The address of the realit.io smart contract
    IRealitio public realitIO;
    
    // The function signature of function to be exeucted by the guild to resolve a question in realit.io
    bytes4 public submitAnswerByArbitratorSignature;
    
    // This amount of OMN tokens to be distributed among voters depending on their vote decision and amount
    uint256 public successfulVoteReward;
    uint256 public unsuccessfulVoteReward;
    
    // realit.io Question IDs => Market validation proposals
    struct GuildProposal {
      bytes32 Valid;
      bytes32 Invalid;
    }

    mapping(bytes32 => uint256) public proposalsForGuild;
    mapping(uint256 => GuildProposal) public guildProposals;
    event GuildProposalCreated(uint indexed guildProposalId);
    event GuildProposalExecuted(uint indexed guildProposalId);

    struct MarketValidationProposal {
      bytes32 marketValid;
      bytes32 marketInvalid;
    }
    mapping(bytes32 => MarketValidationProposal) public marketValidationProposals;
    
    // Market validation proposal ids => realit.io Question IDs
    mapping(bytes32 => bytes32) public proposalsForMarketValidation;

    // Saves which accounts claimed their market validation vote rewards
    mapping(bytes32 => mapping(address => bool)) public rewardsClaimed;
    
    // Save how much accounts voted in a proposal
    mapping(bytes32 => uint256) public positiveVotesCount;

    struct SpecialProposerPermission {
        bool exists;
        uint256 votesForCreation;
        uint256 proposalTime;
    }

    // set per proposer settings
    mapping(address => SpecialProposerPermission) public specialProposerPermissions;
    event SetSpecialProposerPermission(address _proposer, uint256 _proposalTime, uint256 _votesForCreation);

    /// @dev Initilizer
    /// Sets the call permission to arbitrate markets allowed by default and create the market question tempate in 
    /// realit.io to be used on markets created with the guild
    /// @param _token The address of the token to be used
    /// @param _proposalTime The minimum time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that a proposal has to be executed before being ended
    /// @param _votesForExecution The % of votes needed for a proposal to be executed based on the token total supply.
    /// 10000 == 100%, 5000 == 50% and 2500 == 25%
    /// @param _votesForCreation The amount of votes (in wei unit) needed for a proposal to be created
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    /// @param _maxAmountVotes The max amount of votes allowed ot have
    /// @param _realitIO The address of the realitIO contract
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votesForExecution,
        uint256 _votesForCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _lockTime,
        uint256 _maxAmountVotes,
        IRealitio _realitIO
    ) public initializer {
        super.initialize(
          _token,
          _proposalTime,
          _timeForExecution,
          _votesForExecution,
          _votesForCreation,
          "OMNGuild", 
          _voteGas,
          _maxGasPrice,
          _lockTime
        );
        realitIO = _realitIO;
        maxAmountVotes = _maxAmountVotes;
        submitAnswerByArbitratorSignature = bytes4(
          keccak256("submitAnswerByArbitrator(bytes32,bytes32,address)")
        );
        callPermissions[address(realitIO)][submitAnswerByArbitratorSignature] = true;
        callPermissions[address(this)][bytes4(keccak256("setOMNGuildConfig(uint256,address,uint256,uint256)"))]
            = true;
        callPermissions[address(this)][bytes4(keccak256("setSpecialProposerPermission(address,uint256,uint256)"))]
            = true;
    }
    
    /// @dev Set OMNGuild specific parameters
    /// @param _maxAmountVotes The max amount of votes allowed ot have
    /// @param _realitIO The address of the realitIO contract
    /// @param _successfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a succesful 
    ///  vote
    /// @param _unsuccessfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a unsuccesful
    ///  vote
    function setOMNGuildConfig(
        uint256 _maxAmountVotes,
        IRealitio _realitIO,
        uint256 _successfulVoteReward,
        uint256 _unsuccessfulVoteReward
    ) public isInitialized {
        require(msg.sender == address(this), "OMNGuild: Only the Guild can configure the guild");
        realitIO = _realitIO;
        maxAmountVotes = _maxAmountVotes;
        successfulVoteReward = _successfulVoteReward;
        unsuccessfulVoteReward = _unsuccessfulVoteReward;
    }
    
    
    /// @dev Create two proposals one to vote for the validation fo a market in realitIO
    /// @param questionId the id of the question to be validated in realitiyIo
    function createMarketValidationProposal(bytes32 questionId) public isInitialized {
        require(votesOf(msg.sender) >= getVotesForCreation(), "OMNGuild: Not enough tokens to create proposal");
        require(
            realitIO.getOpeningTS(questionId) + 60*60*24*2 > block.timestamp,
            "OMNGuild: Realit.io question is over 2 days old"
        );
        
        address[] memory _to = new address[](1);
        bytes[] memory _data = new bytes[](1);
        uint256[] memory _value  = new uint256[](1);
        bytes memory _contentHash = abi.encodePacked(questionId);

        _value[0] = 0;
        _to[0] = address(realitIO);
          
        // Create market valid proposal
        _data[0] = abi.encodeWithSelector(
            submitAnswerByArbitratorSignature, questionId, keccak256(abi.encodePacked(true)), address(this)
        );
        marketValidationProposals[questionId].marketValid = 
            _createProposal( _to, _data, _value, string("Market valid"), _contentHash );
        
        proposalsForMarketValidation[marketValidationProposals[questionId].marketValid] = questionId;
        // Create market invalid proposal
        _data[0] = abi.encodeWithSelector(
            submitAnswerByArbitratorSignature, questionId, keccak256(abi.encodePacked(false)), address(this)
        );
        marketValidationProposals[questionId].marketInvalid = 
            _createProposal( _to, _data, _value, string("Market invalid"), _contentHash );
        proposalsForMarketValidation[marketValidationProposals[questionId].marketInvalid] = questionId;

        realitIO.notifyOfArbitrationRequest(questionId, msg.sender, 0);
    }
    
    /// @dev Ends the market validation by executing the proposal with higher votes and rejecting the other
    /// @param questionId the proposalId of the voting machine
    function endMarketValidationProposal( bytes32 questionId ) public {
        bytes32 marketValidProposalId = marketValidationProposals[questionId].marketValid;
        bytes32 marketInvalidProposalId = marketValidationProposals[questionId].marketInvalid;
        _endValidationProposal(marketValidProposalId, marketInvalidProposalId);
        }
        
    function _endValidationProposal(bytes32 validId, bytes32 invalidId) private {
        Proposal storage validProposal = proposals[validId];
        Proposal storage invalidProposal = proposals[invalidId];
        
        if (validProposal.totalVotes > invalidProposal.totalVotes) {
            super.endProposal(validId);
            invalidProposal.state = ProposalState.Rejected;
            emit ProposalRejected(invalidId);
        } else {
            super.endProposal(invalidId);
            validProposal.state = ProposalState.Rejected;
            emit ProposalRejected(validId);
        }
    }
    
    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// This function cant end market validation proposals
    function endProposal(bytes32 ) override public pure {
        revert("OMNGuild: use endGuildProposal or endMarketValidationProposal");
    }
    
    /// @dev Ends a guild proposal by executing the proposal if it passed
    /// @param guildProposalId the id of the voting machine
    function endGuildProposal(uint guildProposalId) public {
        bytes32 guildValidProposalId = guildProposals[guildProposalId].Valid;
        bytes32 guildInvalidProposalId = guildProposals[guildProposalId].Invalid;
        
        _endValidationProposal(guildValidProposalId, guildInvalidProposalId);
        emit GuildProposalExecuted(guildProposalId);
    }
    
    /// @dev Claim the vote rewards of multiple proposals at once
    /// @param proposalIds The ids of the proposal already finished were a vote was set and vote reward not claimed
    /// @param voter The address of the voter to receiver the rewards
    function claimMarketValidationVoteRewards(bytes32[] memory proposalIds, address voter) public {
      uint256 reward;
      for(uint i = 0; i < proposalIds.length; i ++) {
          require(
              proposalsForMarketValidation[proposalIds[i]] != bytes32(0),
              "OMNGuild: Cant claim from proposal that isnt for market validation"
          );
          require(
              proposals[proposalIds[i]].state == ProposalState.Executed ||
              proposals[proposalIds[i]].state == ProposalState.Rejected,
              "OMNGuild: Proposal to claim should be executed or rejected"
          );
          require(!rewardsClaimed[proposalIds[i]][voter], "OMNGuild: Vote reward already claimed");
          // If proposal was executed and vote was positive the vote was for a succesful action
          if (
            proposals[proposalIds[i]].state == ProposalState.Executed && 
            proposals[proposalIds[i]].votes[voter] > 0
          ) {
            reward = reward.add(successfulVoteReward.div(positiveVotesCount[proposalIds[i]]));
          // If proposal was rejected and vote was positive the vote was for a unsuccesful action
          } else if (
            proposals[proposalIds[i]].state == ProposalState.Rejected && 
            proposals[proposalIds[i]].votes[voter] > 0
          ) {
            reward = reward.add(unsuccessfulVoteReward.div(positiveVotesCount[proposalIds[i]]));
          }
          
          // Mark reward as claimed
          rewardsClaimed[proposalIds[i]][voter] = true;
      }
      
      // Send the total reward
      _sendTokenReward(voter, reward);
    }

    function setPositiveVote(uint guildProposalId, uint256 amount) public {
        setVote(guildProposals[guildProposalId].Valid, amount);
    }
    
    /// @dev Set the amount of tokens to vote in a proposal
    /// @param proposalId The id of the proposal to set the vote
    /// @param amount The amount of votes to be set in the proposal
    function setVote(bytes32 proposalId, uint256 amount) override public virtual {
        require(
            votesOfAt(msg.sender, proposals[proposalId].snapshotId) >=  amount,
            "OMNGuild: Invalid amount"
        );

        require(proposals[proposalId].votes[msg.sender] == 0, "OMNGuild: Already voted on proposal");
        require(
            proposals[marketValidationProposals[proposalsForMarketValidation[proposalId]].marketValid]
                .votes[msg.sender] == 0,
            "OMNGuild: Already voted on market valid proprosal"
        );
        require(
            proposals[marketValidationProposals[proposalsForMarketValidation[proposalId]].marketInvalid]
                .votes[msg.sender]  == 0,
            "OMNGuild: Already voted on market invalid proposal"
        );
        require(amount <= maxAmountVotes, "OMNGuild: Cant vote with more votes than max amount of votes");
        if (amount > 0) {
          positiveVotesCount[proposalId] = positiveVotesCount[proposalId].add(1);
        }
        _setVote(msg.sender, proposalId, amount);
        _refundVote(msg.sender);
    }

    /// @dev Set the amount of tokens to vote in multiple proposals
    /// @param proposalIds The ids of the proposals to set the votes
    /// @param amounts The amount of votes to be set in each proposal
    function setVotes(bytes32[] memory proposalIds, uint256[] memory amounts) override public virtual {
        require(
            proposalIds.length == amounts.length,
            "OMNGuild: Wrong length of proposalIds or amounts"
        );
        for(uint i = 0; i < proposalIds.length; i ++){
            require(
                votesOfAt(msg.sender, proposals[proposalIds[i]].snapshotId) >=  amounts[i],
                "OMNGuild: Invalid amount"
            );
            require(proposals[proposalIds[i]].votes[msg.sender] == 0, "OMNGuild: Already voted on this proprosal");
            require(
                proposals[marketValidationProposals[proposalsForMarketValidation[proposalIds[i]]].marketValid]
                    .votes[msg.sender] == 0,
                "OMNGuild: Already voted on this market valid proposal"
            );
            require(
                proposals[marketValidationProposals[proposalsForMarketValidation[proposalIds[i]]].marketInvalid]
                    .votes[msg.sender]  == 0,
                "OMNGuild: Already voted on this market invalid proposal"
            );
            require(amounts[i] <= maxAmountVotes, "OMNGuild: Cant vote with more votes than max amount of votes");
            if (amounts[i] > 0) {
                positiveVotesCount[proposalIds[i]] = positiveVotesCount[proposalIds[i]].add(1);
            }
            _setVote(msg.sender, proposalIds[i], amounts[i]);
        }
    }
    
    /// @dev Internal function to send a reward of OMN tokens (if the balance is enough) to an address
    /// @param to The address to recieve the token
    /// @param amount The amount of OMN tokens to be sent in wei units
    function _sendTokenReward(address to, uint256 amount) internal {
        require(
            token.balanceOf(address(this)) > amount,
            "OMNGuild: Rewards are temporarily unavailable. Please try again later."
        );
        token.transfer(to, amount);
    }
    
    /// @dev Get minimum amount of votes needed for creation
    function getVotesForCreation() override public view returns (uint256) {
        return votesForCreation;
    }
    
    /// @dev Get minimum amount of votes needed for proposal execution
    function getVotesForExecution() override public view returns (uint256) {
        return totalLocked.mul(votesForExecution).div(10000);
    }
    /// @dev set special proposer permissions
    /// @param _proposer The address to allow
    /// @param _proposalTime The minimum time for a proposal to be under votation
    /// @param _votesForCreation The minimum balance of tokens needed to create a proposal
    function setSpecialProposerPermission(
        address _proposer,
        uint256 _proposalTime, 
        uint256 _votesForCreation
    ) public virtual isInitialized {
        require(msg.sender == address(this), "OMNGuild: Only callable by the guild itself");
        specialProposerPermissions[_proposer].exists = true;
        specialProposerPermissions[_proposer].proposalTime = _proposalTime;
        specialProposerPermissions[_proposer].votesForCreation = _votesForCreation;
        emit SetSpecialProposerPermission(_proposer, _proposalTime, _votesForCreation);
    }

    function createProposal (
        address[] memory ,
        bytes[] memory ,
        uint256[] memory ,
        string memory ,
        bytes memory 
    ) override public virtual isInitialized returns(bytes32) {
        require(false, "OMNGuild: use createGuildProposal");
        return bytes32(0); // to stop a warning
    }
    /// @dev Create a proposal with a static call data
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param description A short description of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createGuildProposal (
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        string memory description,
        bytes memory contentHash
    ) public virtual isInitialized returns(uint) {
        
        uint256  proposalTime_      =  proposalTime;
        uint256  votesForCreation_  =  votesForCreation;

        if ( specialProposerPermissions[msg.sender].exists ) {
            // override defaults
            proposalTime       =  specialProposerPermissions[msg.sender].proposalTime;
            votesForCreation   =  specialProposerPermissions[msg.sender].votesForCreation;
        }
        
        guildProposalCnt+=1;
            
        guildProposals[guildProposalCnt].Valid = super.createProposal(to, data, value, description, contentHash);
        bytes[] memory noop = new bytes[](1);
        guildProposals[guildProposalCnt].Invalid = super.createProposal(to, noop, value, description, contentHash);
        proposalsForGuild[guildProposals[guildProposalCnt].Valid] = guildProposalCnt;
        proposalsForGuild[guildProposals[guildProposalCnt].Invalid] = guildProposalCnt;

        // revert overrides
        proposalTime      =  proposalTime_;
        votesForCreation  =  votesForCreation_;

        emit GuildProposalCreated(guildProposalCnt);
        return guildProposalCnt;
    }
}
