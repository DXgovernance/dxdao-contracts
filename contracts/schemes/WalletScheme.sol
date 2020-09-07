pragma solidity 0.5.17;
pragma experimental ABIEncoderV2;

import "@daostack/infra/contracts/votingMachines/IntVoteInterface.sol";
import "@daostack/infra/contracts/votingMachines/ProposalExecuteInterface.sol";
import "../votingMachines/VotingMachineCallbacks.sol";

/**
 * @title WalletScheme.
 * @dev  A scheme for proposing and executing calls to any contract except itself
 */
contract WalletScheme is VotingMachineCallbacks, ProposalExecuteInterface {
    event NewCallProposal(bytes32 indexed _proposalId);

    event ProposalExecuted(bytes32 indexed _proposalId, bool[] _callsSucessResult, bytes[] _callsDataResult);

    event ProposalExecutedByVotingMachine(bytes32 indexed _proposalId, int256 _param);

    event ProposalFailed(bytes32 indexed _proposalId);

    enum ProposalState {Submitted, Passed, Failed, Executed}

    struct Proposal {
        address[] to;
        bytes[] callData;
        uint256[] value;
        ProposalState state;
        string descriptionHash;
    }

    mapping(bytes32 => Proposal) public proposals;

    IntVoteInterface public votingMachine;
    bytes32 public voteParams;
    Avatar public avatar;
    address public toAddress;

    /**
     * @dev initialize
     * @param _avatar the avatar address
     * @param _votingMachine the voting machines address to
     * @param _voteParams voting machine parameters.
     * @param _toAddress The address to receive the calls,
     *  if address 0x0 is used it means any address.
     */
    function initialize(
        Avatar _avatar, IntVoteInterface _votingMachine, bytes32 _voteParams, address _toAddress
    ) external {
        require(avatar == Avatar(0), "can be called only one time");
        require(_avatar != Avatar(0), "avatar cannot be zero");
        avatar = _avatar;
        votingMachine = _votingMachine;
        voteParams = _voteParams;
        toAddress = _toAddress;
    }

    /**
     * @dev Fallback function that allows the wallet to receive ETH
     */
    function() external payable {}

    /**
     * @dev execution of proposals, can only be called by the voting machine in which the vote is held.
     * @param _proposalId the ID of the voting in the voting machine
     * @param _decision a parameter of the voting result, 1 yes and 2 is no.
     * @return bool success
     */
    function executeProposal(bytes32 _proposalId, int256 _decision)
      external onlyVotingMachine(_proposalId) returns(bool)
    {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.state == ProposalState.Submitted, "must be a submitted proposal");

        if (_decision == 1) {
            proposal.state = ProposalState.Passed;
        } else {
            proposal.state = ProposalState.Failed;
            emit ProposalFailed(_proposalId);
        }

        emit ProposalExecutedByVotingMachine(_proposalId, _decision);
        return true;
    }

    /**
     * @dev execution of proposals after it has been decided by the voting machine
     * @param _proposalId the ID of the voting in the voting machine
     */
    function execute(bytes32 _proposalId) public {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.state == ProposalState.Passed, "proposal must passed by voting machine");
        bytes[] memory callsDataResult = new bytes[](proposal.to.length);
        bool[] memory callsSucessResult = new bool[](proposal.to.length);
        bytes memory callDataResult;
        bool callSuccess;
        for (uint256 i = 0; i < proposal.to.length; i++) {
            (callSuccess, callDataResult) = address(proposal.to[i]).call.value(proposal.value[i])(proposal.callData[i]);
            callsDataResult[i] = callDataResult;
            callsSucessResult[i] = callSuccess;
            // Check that first 4 bytes of call return dont equal default Error(string) signature
            bytes4 callDataResultSignature = bytes4(0);
            if (callDataResult.length >= 4) {
                assembly {
                    callDataResultSignature := mload(add(callDataResult, 4))
                }
            }
            if (!callSuccess || callDataResultSignature == 0x08c379a0) break;
        }
        emit ProposalExecuted(_proposalId, callsSucessResult, callsDataResult);
        proposals[_proposalId].state = ProposalState.Executed;
    }

    /**
    * @dev propose to call an address
    *      The function trigger NewCallProposal event
    * @param _to - The addresses to call
    * @param _callData - The abi encode data for the calls
    * @param _value value(ETH) to transfer with the calls
    * @param _descriptionHash proposal description hash
    * @return an id which represents the proposal
    */
    function proposeCalls(
      address[] memory _to, bytes[] memory _callData, uint256[] memory _value, string memory _descriptionHash
    ) public returns(bytes32) {
        for(uint i = 0; i < _to.length; i ++) {
          require(_to[i] != address(this), 'invalid proposal caller');
          if (toAddress != address(0))
            require(_to[i] == toAddress, 'invalid proposal caller');
        }
        require(_to.length == _callData.length, "invalid callData length");
        require(_to.length == _value.length, "invalid _value length");

        bytes32 proposalId = votingMachine.propose(2, voteParams, msg.sender, address(avatar));
        proposals[proposalId] = Proposal({
            to: _to,
            callData: _callData,
            value: _value,
            state: ProposalState.Submitted,
            descriptionHash: _descriptionHash
        });
        proposalsInfo[address(votingMachine)][proposalId] = ProposalInfo({blockNumber: block.number, avatar: avatar});
        emit NewCallProposal(proposalId);
        return proposalId;
    }

    /**
    * @dev Get the information of a proposal by id
    * @param proposalId the ID of the proposal
    */
    function getOrganizationProposal(bytes32 proposalId) public view 
      returns (
        address[] memory to,
        bytes[] memory callData,
        uint256[] memory value,
        ProposalState state,
        string memory descriptionHash
    ) {
      return (
        proposals[proposalId].to,
        proposals[proposalId].callData,
        proposals[proposalId].value,
        proposals[proposalId].state,
        proposals[proposalId].descriptionHash
      );
    }
    
    /**
    * @dev Override mintReputation function from VotingMachineCallbacks
    */
    function mintReputation(uint256 _amount, address _beneficiary, bytes32 _proposalId)
      external onlyVotingMachine(_proposalId) returns(bool)
    {
      return false;
    }
    
    /**
    * @dev Override burnReputation function from VotingMachineCallbacks
    */
    function burnReputation(uint256 _amount, address _beneficiary, bytes32 _proposalId)
      external onlyVotingMachine(_proposalId) returns(bool)
    {
      return false;
    }
}
