// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../erc20guild/ERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

/// @title OMNGuild
/// TO DO: Add description
/// @author github:AugustoL
contract OMNGuild is ERC20Guild, OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

    uint256 public maxAmountVotes;
    address public realityIO;
    bytes4 public submitAnswerByArbitratorSignature = bytes4(
      keccak256("submitAnswerByArbitrator(bytes32,bytes32,address)")
    );
    uint256 public succesfulVoteReward;
    uint256 public unsuccesfulVoteReward;
    
    enum VoteStatus {NO_VOTE, POSITIVE, NEGATIVE, REWARD_CLAIMED}
    
    struct MarketValidationProposal {
      bytes32 marketValid;
      bytes32 marketInvalid;
    }
    // Question id => valid and invalid proposals
    mapping(bytes32 => MarketValidationProposal) public marketValidationProposals;
    
    // Stores the proposalids that are for market validation
    mapping(bytes32 => bool) public proposalsForMarketValidation;

    // Saves which accounts voted in market validation proposals and their decision.
    mapping(bytes32 => mapping(address => VoteStatus)) public voteStatus;
    
    mapping(bytes32 => uint256) public positiveVotesCount;
    mapping(bytes32 => uint256) public negativeVotesCount;

    /// @dev Initilizer
    /// Sets the call permission to arbitrate markets allowed by default and create the market question tempate in 
    /// reality.io to be used on markets created with the guild
    /// @param _token The address of the token to be used
    /// @param _proposalTime The minimun time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    /// @param _votesForExecution The % of votes needed for a proposal to be executed based on the token total supply.
    /// @param _votesForCreation The % of votes needed for a proposal to be created based on the token total supply.
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    /// @param _maxAmountVotes The max amount of votes allowed ot have
    /// @param _realityIO The address of the realityIO contract
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
        address _realityIO
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
        realityIO = _realityIO;
        maxAmountVotes = _maxAmountVotes;
        callPermissions[realityIO][submitAnswerByArbitratorSignature] = true;
        callPermissions[address(this)][bytes4(keccak256("setOMNGuildConfig(uint256,address,uint256,uint256"))] = true;
    }
    
    /// @dev Set OMNGuild specific parameters
    /// @param _maxAmountVotes The max amount of votes allowed ot have
    /// @param _realityIO The address of the realityIO contract
    /// @param _succesfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a succesful 
    ///  vote
    /// @param _unsuccesfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a unsuccesful
    ///  vote
    function setOMNGuildConfig(
        uint256 _maxAmountVotes,
        address _realityIO,
        uint256 _succesfulVoteReward,
        uint256 _unsuccesfulVoteReward
    ) public isInitialized {
        realityIO = _realityIO;
        maxAmountVotes = _maxAmountVotes;
        succesfulVoteReward = _succesfulVoteReward;
        unsuccesfulVoteReward = _unsuccesfulVoteReward;
    }
    
    /// @dev Create proposals with an static call data and extra information
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param description A short description of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposals(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        string[] memory description,
        bytes[] memory contentHash
    ) public isInitialized returns(bytes32[] memory) {
        require(votesOf(msg.sender) >= getVotesForCreation(), "OMNGuild: Not enough tokens to create proposal");
        require(
            (to.length == data.length) && (to.length == value.length),
            "OMNGuild: Wrong length of to, data or value arrays"
        );
        require(
            (description.length == contentHash.length),
            "OMNGuild: Wrong length of description or contentHash arrays"
        );
        require(to.length > 0, "OMNGuild: to, data value arrays cannot be empty");
        bytes32[] memory proposalsCreated;
        uint256 proposalsToCreate = description.length;
        uint256 callsPerProposal = to.length.div(proposalsToCreate);
        for(uint proposalIndex = 0; proposalIndex < proposalsToCreate; proposalIndex ++) {
          address[] memory _to;
          bytes[] memory _data;
          uint256[] memory _value;
          uint256 callIndex;
          for(
            uint callIndexInProposals = callsPerProposal.mul(proposalIndex);
            callIndexInProposals < callsPerProposal;
            callIndexInProposals ++
          ) {
            _to[callIndex] = to[callIndexInProposals];
            _data[callIndex] = data[callIndexInProposals];
            _value[callIndex] = value[callIndexInProposals];
            callIndex ++;
          }
          proposalsCreated[proposalIndex] =
            _createProposal(_to, _data, _value, description[proposalIndex], contentHash[proposalIndex]);
        }
        return proposalsCreated;
    }
    
    /// @dev Create two proposals one to vote for the validation fo a market in realityIo
    /// @param questionId the id of the question to be validated in realitiyIo
    function createMarketValidationProposal(bytes32 questionId) public isInitialized {
      require(votesOf(msg.sender) >= getVotesForCreation(), "OMNGuild: Not enough tokens to create proposal");      
      
      address[] memory _to;
      bytes[] memory _data;
      uint256[] memory _value;
      bytes memory _contentHash = abi.encodePacked(questionId);
      _value[0] = 0;
      _to[0] = realityIO;
        
      // Create market valid proposal
      _data[0] = abi.encodeWithSelector(
        submitAnswerByArbitratorSignature, questionId, keccak256(abi.encodePacked(true)), address(this)
      );
      marketValidationProposals[questionId].marketValid = 
        _createProposal( _to, _data, _value, string("Market valid"), _contentHash );
      
      proposalsForMarketValidation[marketValidationProposals[questionId].marketValid] = true;
      // Create market invalid proposal
      _data[0] = abi.encodeWithSelector(
        submitAnswerByArbitratorSignature, questionId, keccak256(abi.encodePacked(false)), address(this)
      );
      marketValidationProposals[questionId].marketInvalid = 
        _createProposal( _to, _data, _value, string("Market invalid"), _contentHash );
      proposalsForMarketValidation[marketValidationProposals[questionId].marketInvalid] = true;

    }
    
    /// @dev Ends the market validation by executing the proposal with higher votes and rejecting the other
    /// @param questionId the proposalId of the voting machine
    function endMarketValidationProposal( bytes32 questionId ) public isInitialized {
      
      Proposal storage marketValidProposal = proposals[marketValidationProposals[questionId].marketValid];
      Proposal storage marketInvalidProposal = proposals[marketValidationProposals[questionId].marketInvalid];
      
      require(marketValidProposal.state == ProposalState.Submitted, "OMNGuild: Market valid proposal already executed");
      require(marketInvalidProposal.state == ProposalState.Submitted, "OMNGuild: Market invalid proposal already executed");
      require(marketValidProposal.endTime < block.timestamp, "OMNGuild: Market valid proposal hasnt ended yet");
      require(marketInvalidProposal.endTime < block.timestamp, "OMNGuild: Market invalid proposal hasnt ended yet");
      
      if (marketValidProposal.totalVotes > marketInvalidProposal.totalVotes) {
        _endProposal(marketValidationProposals[questionId].marketValid);
        marketInvalidProposal.state = ProposalState.Rejected;
        emit ProposalRejected(marketValidationProposals[questionId].marketInvalid);
      } else {
        _endProposal(marketValidationProposals[questionId].marketInvalid);
        marketValidProposal.state = ProposalState.Rejected;
        emit ProposalRejected(marketValidationProposals[questionId].marketValid);
      }
    }
    
    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// This function cant end market validation proposals
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) override public {
      require(
        !proposalsForMarketValidation[proposalId],
        "OMNGuild: Use endMarketValidationProposal to end proposals to validate market"
      );
      require(proposals[proposalId].state == ProposalState.Submitted, "ERC20Guild: Proposal already executed");
      require(proposals[proposalId].endTime < block.timestamp, "ERC20Guild: Proposal hasnt ended yet");
      _endProposal(proposalId);
    }
    
    /// @dev Claim the vote rewards of multiple proposals at once
    /// @param proposalIds The ids of the proposal already finished were a vote was set and vote reward not claimed
    // TO DO ,maybe claim for other accounts
    function claimVoteRewards(bytes32[] memory proposalIds) public {
      uint256 reward;
      for(uint i = 0; i < proposalIds.length; i ++) {
        require(voteStatus[proposalIds[i]][msg.sender] != VoteStatus.NO_VOTE, "OMNGuild: Didnt voted in proposal");
        require(voteStatus[proposalIds[i]][msg.sender] != VoteStatus.REWARD_CLAIMED, "OMNGuild: Vote reward already claimed");
      
        // If proposal executed and vote was positive or proposal rejected and vote was negative the vote reward is for
        // a succesful vote
        if (
          proposals[proposalIds[i]].state == ProposalState.Executed && 
          voteStatus[proposalIds[i]][msg.sender] == VoteStatus.POSITIVE
        ) {
          reward.add(succesfulVoteReward.div(positiveVotesCount[proposalIds[i]]));
        } else if (
          proposals[proposalIds[i]].state == ProposalState.Rejected && 
          voteStatus[proposalIds[i]][msg.sender] == VoteStatus.NEGATIVE
        ) {
          reward.add(succesfulVoteReward.div(negativeVotesCount[proposalIds[i]]));
          
        // If proposal executed and vote was negative or proposal rejected and vote was positive the vote reward is for
        // a unsuccesful vote
        } else if (
          proposals[proposalIds[i]].state == ProposalState.Rejected && 
          voteStatus[proposalIds[i]][msg.sender] == VoteStatus.POSITIVE
        ) {
          reward.add(unsuccesfulVoteReward.div(positiveVotesCount[proposalIds[i]]));
        } else if (
          proposals[proposalIds[i]].state == ProposalState.Executed && 
          voteStatus[proposalIds[i]][msg.sender] == VoteStatus.NEGATIVE
        ) {
          reward.add(unsuccesfulVoteReward).div(negativeVotesCount[proposalIds[i]]);
        }
        
        voteStatus[proposalIds[i]][msg.sender] = VoteStatus.REWARD_CLAIMED;
      }
      
      _sendTokenReward(msg.sender, reward);
    }
    
    /// @dev Set the amount of tokens to vote in a proposal
    /// @param proposalId The id of the proposal to set the vote
    /// @param amount The amount of votes to be set in the proposal
    function setVote(bytes32 proposalId, uint256 amount) override public virtual {
        require(
            votesOfAt(msg.sender, proposals[proposalId].snapshotId) >=  amount,
            "ERC20Guild: Invalid amount"
        );
        require(voteStatus[proposalId][msg.sender] == VoteStatus.NO_VOTE, "OMNGuild: Already voted");
        require(amount <= maxAmountVotes, "OMNGuild: Cant vote with more votes than max amount of votes");
        if (amount > 0) {
          voteStatus[proposalId][msg.sender] = VoteStatus.POSITIVE;
          positiveVotesCount[proposalId].add(1);
        } else {
          voteStatus[proposalId][msg.sender] = VoteStatus.NEGATIVE;
          negativeVotesCount[proposalId].add(1);
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
            "ERC20Guild: Wrong length of proposalIds or amounts"
        );
        for(uint i = 0; i < proposalIds.length; i ++){
            require(
                votesOfAt(msg.sender, proposals[proposalIds[i]].snapshotId) >=  amounts[i],
                "ERC20Guild: Invalid amount"
            );
            require(voteStatus[proposalIds[i]][msg.sender] == VoteStatus.NO_VOTE, "OMNGuild: Already voted");
            require(amounts[i] <= maxAmountVotes, "OMNGuild: Cant vote with more votes than max amount of votes");
            if (amounts[i] > 0) {
              voteStatus[proposalIds[i]][msg.sender] = VoteStatus.POSITIVE;
              positiveVotesCount[proposalIds[i]].add(1);
            } else {
              voteStatus[proposalIds[i]][msg.sender] = VoteStatus.NEGATIVE;
              negativeVotesCount[proposalIds[i]].add(1);
            }
            _setVote(msg.sender, proposalIds[i], amounts[i]);
          }
    }
    
    /// @dev Internal function to send a reward of OMN tokens (if the balance is enough) to an address
    /// @param to The address to recieve the token
    /// @param amount The amount of OMN tokens to be sent in wei units
    function _sendTokenReward(address to, uint256 amount) internal {
        if (token.balanceOf(address(this)) > amount) {
            token.transfer(to, amount);
        }
    }
    
    /// @dev Get minimum amount of votes needed for creation
    function getVotesForCreation() override public view returns (uint256) {
        return token.totalSupply().mul(votesForCreation).div(10000);
    }
    
    /// @dev Get minimum amount of votes needed for proposal execution
    function getVotesForExecution() override public view returns (uint256) {
        return token.totalSupply().mul(votesForExecution).div(10000);
    }

}
