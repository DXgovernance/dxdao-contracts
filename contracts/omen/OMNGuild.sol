// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "../erc20guild/ERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

abstract contract IRealityIO {
  function askQuestion(
    uint256 template_id, string memory question, address arbitrator, uint32 timeout, uint32 opening_ts, uint256 nonce
  ) public virtual payable returns (bytes32);
}

/// @title OMNGuild
/// @author github:AugustoL
contract OMNGuild is ERC20Guild, OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

    uint256 public maxAmountVotes;
    address public realityIO;
    uint256 public realityIOTemplateIndex;
    uint32 public marketValidationTime;
    mapping(bytes32 => bytes32) public questionIds;
    bytes4 public submitAnswerByArbitratorSignature = bytes4(
      keccak256("submitAnswerByArbitrator(bytes32,bytes32,address)")
    );
    uint32 internal _questionNonce;
    uint256 public marketCreatorReward;
    uint256 public succesfulVoteReward;
    uint256 public unsuccesfulVoteReward;
    
    enum VoteStatus {NO_VOTE, POSITIVE, NEGATIVE, REWARD_CLAIMED}

    // Saves which accounts voted in market validation proposals and their decision.
    mapping(bytes32 => mapping(address => VoteStatus)) public voteStatus;

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
    /// @param _realityIOTemplateId The tempalte id to be used for the question in reality.io
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
        address _realityIO,
        uint256 _realityIOTemplateId
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
        realityIOTemplateIndex = _realityIOTemplateId;
        maxAmountVotes = _maxAmountVotes;
        marketValidationTime = 2 days;
        callPermissions[realityIO][submitAnswerByArbitratorSignature] = true;
        callPermissions[address(this)][bytes4(keccak256("setOMNGuildConfig(uint256,address,uint256,uint256"))] = true;
    }
    
    /// @dev Set OMNGuild specific parameters
    /// @param _maxAmountVotes The max amount of votes allowed ot have
    /// @param _realityIO The address of the realityIO contract
    /// @param _realityIOTemplateId The tempalte id to be used for the question in reality.io
    /// @param _marketValidationTime The amount of time in seconds for the market validation question
    /// @param _marketCreatorReward The amount of OMN tokens in wei unit to be reward to a market validation creator
    /// @param _succesfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a succesful 
    ///  vote
    /// @param _unsuccesfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a unsuccesful
    ///  vote
    function setOMNGuildConfig(
        uint256 _maxAmountVotes,
        address _realityIO,
        uint256 _realityIOTemplateId,
        uint32 _marketValidationTime,
        uint256 _marketCreatorReward,
        uint256 _succesfulVoteReward,
        uint256 _unsuccesfulVoteReward
    ) public isInitialized {
        realityIO = _realityIO;
        realityIOTemplateIndex = _realityIOTemplateId;
        maxAmountVotes = _maxAmountVotes;
        marketValidationTime = _marketValidationTime;
        marketCreatorReward = _marketCreatorReward;
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
    
    /// @dev Create a proposal that will mark an OMN market as invalid in realito.io if quorum is reached.
    /// The proposal will only be votable for two days.
    /// @param marketToValidateId the id of the question Id to be set as invalid
    function createMarketValidationProposal(bytes32 marketToValidateId) public isInitialized returns (bytes32) {
        require(votesOf(msg.sender) >= getVotesForCreation(), "OMNGuild: Not enough tokens to create proposal");
        string memory question = string(abi.encodePacked("Is market with ", marketToValidateId, " valid?"));

        bytes32 marketValidationQuestionId = IRealityIO(realityIO).askQuestion(
          realityIOTemplateIndex, question, address(this), marketValidationTime, _questionNonce, block.timestamp
        );
        _questionNonce ++;
        
        // question: Is this how we set the question to true? with this answer?
        bytes32 answer = keccak256(abi.encodePacked(true));
        
        address[] memory _to;
        bytes[] memory _data;
        uint256[] memory _value;
        
        _data[0] = abi.encodeWithSelector(
          submitAnswerByArbitratorSignature, marketValidationQuestionId, answer, msg.sender
        );
        
        _value[0] = 0;
        _to[0] = address(realityIO);
        questionIds[marketValidationQuestionId] =
          _createProposal(_to, _data, _value, question, abi.encodePacked(marketValidationQuestionId));
        return questionIds[marketValidationQuestionId];
    }
    
    /// @dev Claim the vote rewards of multiple proposals at once
    /// @param proposalIds The ids of the proposal already finished were a vote was set and vote reward not claimed
    function claimVoteRewards(bytes32[] memory proposalIds) public {
      uint256 reward;
      for(uint i = 0; i < proposalIds.length; i ++) {
        require(voteStatus[proposalIds[i]][msg.sender] != VoteStatus.NO_VOTE, "OMNGuild: Didnt voted in proposal");
        require(voteStatus[proposalIds[i]][msg.sender] != VoteStatus.REWARD_CLAIMED, "OMNGuild: Vote reward already claimed");
      
        // If proposal executed and vote was positive or proposal rejected and vote was negative the vote reward is for
        // a succesful vote
        if ((
          proposals[proposalIds[i]].state == ProposalState.Executed && 
          voteStatus[proposalIds[i]][msg.sender] == VoteStatus.POSITIVE
        ) || (
          proposals[proposalIds[i]].state == ProposalState.Rejected && 
          voteStatus[proposalIds[i]][msg.sender] == VoteStatus.NEGATIVE
        )) {
          reward.add(succesfulVoteReward);
          
        // If proposal executed and vote was negative or proposal rejected and vote was positive the vote reward is for
        // a unsuccesful vote
        } else if ((
          proposals[proposalIds[i]].state == ProposalState.Rejected && 
          voteStatus[proposalIds[i]][msg.sender] == VoteStatus.POSITIVE
        ) || (
          proposals[proposalIds[i]].state == ProposalState.Executed && 
          voteStatus[proposalIds[i]][msg.sender] == VoteStatus.NEGATIVE
        )) {
          reward.add(unsuccesfulVoteReward);
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
        } else {
          voteStatus[proposalId][msg.sender] = VoteStatus.NEGATIVE;
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
            } else {
              voteStatus[proposalIds[i]][msg.sender] = VoteStatus.NEGATIVE;
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
        return token.totalSupply().mul(votesForCreation).div(100);
    }
    
    /// @dev Get minimum amount of votes needed for proposal execution
    function getVotesForExecution() override public view returns (uint256) {
        return token.totalSupply().mul(votesForExecution).div(100);
    }

}
