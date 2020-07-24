pragma solidity ^0.5.11;

import "./GenesisProtocol.sol";

/**
 * @title GenesisProtocol implementation -an organization's voting machine scheme that allow batch votes with sigantures
 *
 * Allows all organizations using the voting machine to share vote signatures and use that signature to execute votes
 * from other account.
 */
contract SignedGenesisProtocol is GenesisProtocol {
  
    // Event used to share votes signatures on chain
    event VoteSigned(
      address votingMachine,
      bytes32 proposalId,
      address voter,
      uint256 vote,
      uint256 amount,
      bytes signature
    );
    
    /**
     * @dev Constructor
     */
    constructor(IERC20 _stakingToken)
    public
    // solhint-disable-next-line no-empty-blocks
    GenesisProtocol(_stakingToken) {}
    
    /**
     * @dev Share the vote of a proposal on a voting machine on a event log
     *
     * Changed by SignedGenesisProtocol implementation to allow sharing a vote signature on chain
     *
     * @param votingMachine the voting machine address
     * @param proposalId id of the proposal
     * @param vote NO(2) or YES(1).
     * @param amount the reputation amount to vote with, it needs to be specified, cant be 0
     * @param signature the encoded vote signature
     */
    function shareSignedVote(
      address votingMachine, bytes32 proposalId, uint256 vote, uint256 amount, bytes calldata signature
    ) external {
      require(amount > 0, "invalid amount");
      bytes32 voteHashed = hashVote(votingMachine, proposalId, msg.sender, vote, amount);
      require(msg.sender == voteHashed.toEthSignedMessageHash().recover(signature), "wrong signer");
      emit VoteSigned(votingMachine, proposalId, msg.sender, vote, amount, signature);
    }

    /**
     * @dev Executes a signed vote on a votable proposal
     *
     * Added by SignedGenesisProtocol implementation to allow the execution on chain of signed votes
     *
     * @param votingMachine the voting machine address
     * @param proposalId id of the proposal
     * @param voter the signer of the vote
     * @param vote NO(2) or YES(1).
     * @param amount the reputation amount to vote with, it needs to be specified, cant be 0
     * @param signature voter signature
     * @return bool if the proposal was executed
     */
    function executeSignedVote(
      address votingMachine,
      bytes32 proposalId,
      address voter,
      uint256 vote,
      uint256 amount,
      bytes calldata signature
    ) votable(proposalId) external returns (bool) {
        require(amount > 0, "wrong amount");
        require(votingMachine == address(this), "wrong votingMachine");
        require(
          voter == hashVote(votingMachine, proposalId, voter, vote, amount).toEthSignedMessageHash().recover(signature),
          "wrong signer"
        );
        return internalVote(proposalId, voter, vote, amount);
    }
    
    /**
     * @dev Hash the vote data that is used for signatures
     *
     * Added by SignedGenesisProtocol implementation to hash votes data to be used for signatures
     *
     * @param votingMachine the voting machine address
     * @param proposalId id of the proposal
     * @param voter the signer of the vote
     * @param vote NO(2) or YES(1).
     * @param amount the reputation amount to vote with, it needs to be specified, cant be 0
     */
    function hashVote(
      address votingMachine,
      bytes32 proposalId,
      address voter,
      uint256 vote,
      uint256 amount
    ) public pure returns(bytes32) {
      return keccak256(abi.encodePacked(votingMachine, proposalId, voter, vote, amount));
    }

}
