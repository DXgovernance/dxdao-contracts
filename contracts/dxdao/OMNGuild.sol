// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.5.17;
pragma experimental ABIEncoderV2;

import "../erc20guild/ERC20Guild.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract IRealityIO {
  function askQuestion(
    uint256 template_id, string memory question, address arbitrator, uint32 timeout, uint32 opening_ts, uint256 nonce
  ) public payable returns (bytes32);
}

/// @title OMNGuild
/// @author github:AugustoL
contract OMNGuild is ERC20Guild, Ownable {

  constructor() public ERC20Guild() {}
    
    uint256 public maxAmountVotes;
    address public realityIO;
    uint256 public realityIOTemplateIndex;
    uint32 public marketValidationTime;
    mapping(bytes32 => bytes32) public questionIds;
    bytes4 public submitAnswerByArbitratorSignature = bytes4(
      keccak256("submitAnswerByArbitrator(bytes32,bytes32,address)")
    );
    uint32 internal _questionNonce;

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
    ) public {
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
    function setOMNGuildConfig(
        uint256 _maxAmountVotes,
        address _realityIO,
        uint256 _realityIOTemplateId,
        uint32 _marketValidationTime
    ) public isInitialized {
        realityIO = _realityIO;
        realityIOTemplateIndex = _realityIOTemplateId;
        maxAmountVotes = _maxAmountVotes;
        marketValidationTime = _marketValidationTime;
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
    /// @param questionId the id of the question Id to be set as invalid
    function createMarketValidationProposal(bytes32 questionId) public isInitialized returns (bytes32) {
      require(votesOf(msg.sender) >= getVotesForCreation(), "OMNGuild: Not enough tokens to create proposal");
      string memory question = string(abi.encodePacked("Is market with ", questionId, " valid?"));

      bytes32 questionId = IRealityIO(realityIO).askQuestion(
        realityIOTemplateIndex, question, address(this), marketValidationTime, _questionNonce, now
      );
      _questionNonce ++;
      
      // question:Is this how we set the question to true? with this answer?
      bytes32 answer = keccak256(abi.encodePacked(true));
      
      address[] memory _to;
      bytes[] memory _data;
      uint256[] memory _value;
      
      // question: Should the account credited with this answer for the purpose of bond claims be this guild?
      _data[0] = abi.encodeWithSelector(
        submitAnswerByArbitratorSignature, questionId, answer, address(this)
      );
      
      _value[0] = 0;
      _to[0] = address(realityIO);
      questionIds[questionId] = _createProposal(_to, _data, _value, question, abi.encodePacked(questionId));
      return questionIds[questionId];
    }
  
    /// @dev Internal function to set the amount of tokens to vote in a proposal
    /// @param voter The address of the voter
    /// @param proposalId The id of the proposal to set the vote
    /// @param amount The amount of tokens to use as voting for the proposal
    function _setVote(address voter, bytes32 proposalId, uint256 amount) internal isInitialized {
        require(proposals[proposalId].votes[voter] == 0, "OMNGuild: Already voted");
        require(amount <= maxAmountVotes, "OMNGuild: Cant vote with more votes than max amount of votes");
        super._setVote(voter, proposalId, amount);
    }
    
    
    /// @dev Get minimum amount of votes needed for creation
    function getVotesForCreation() public view returns (uint256) {
        return token.totalSupply().mul(votesForCreation).div(100);
    }
    
    /// @dev Get minimum amount of votes needed for proposal execution
    function getVotesForExecution() public view returns (uint256) {
        return token.totalSupply().mul(votesForExecution).div(100);
    }

}
