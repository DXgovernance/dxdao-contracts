pragma solidity 0.5.17;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "@daostack/infra/contracts/votingMachines/IntVoteInterface.sol";
import "@daostack/infra/contracts/votingMachines/ProposalExecuteInterface.sol";
import "../daostack/votingMachines/VotingMachineCallbacks.sol";
import "./PermissionRegistry.sol";

/**
 * @title WalletScheme.
 * @dev  A scheme for proposing and executing calls to any contract except itself
 * It has a value call controller address, in case of the controller address ot be set the scheme will be doing
 * generic calls to the dao controller. If the controller address is not set it will e executing raw calls form the 
 * scheme itself.
 * The scheme can only execute calls allowed to in the permission registry, if the controller address is set
 * the permissions will be checked using the avatar address as sender, if not the scheme address will be used as
 * sender.
 */
contract WalletScheme is VotingMachineCallbacks, ProposalExecuteInterface {
    using SafeMath for uint256;

    struct Proposal {
        address[] to;
        bytes[] callData;
        uint256[] value;
        ProposalState state;
        string title;
        string descriptionHash;
        uint256 submittedTime;
    }

    mapping(bytes32 => Proposal) public proposals;
    bytes32[] public proposalsList;

    IntVoteInterface public votingMachine;
    bytes32 public voteParams;
    Avatar public avatar;
    address public controllerAddress;
    PermissionRegistry public permissionRegistry;
    string public schemeName;
    uint256 public maxProposalTime;
    
    // This mapping is used as "memory storage" in executeProposal function, to keep track of the total value
    // transfered of by asset and address, it saves both aseet and address as keccak256(asset, recipient)
    mapping(bytes32 => uint256) totalValueTransferedInCall;
    
    bytes4 public constant ERC20_TRANSFER_SIGNATURE = bytes4(keccak256("transfer(address,uint256)"));
    bytes4 public constant ANY_SIGNATURE = bytes4(0xaaaaaaaa);
    address public constant ANY_ADDRESS = address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa);

    event NewCallProposal(bytes32 indexed _proposalId);
    event ProposalExecuted(bytes32 indexed _proposalId, bool[] _callsSucessResult, bytes[] _callsDataResult);
    event ProposalExecutedByVotingMachine(bytes32 indexed _proposalId, int256 _param);
    event ProposalRejected(bytes32 indexed _proposalId);
    event ProposalExecutionTimeout(bytes32 indexed _proposalId);
    enum ProposalState {Submitted, Rejected, ExecutionSucceded, ExecutionTimeout}

    /**
     * @dev initialize
     * @param _avatar the avatar address
     * @param _votingMachine the voting machines address to
     * @param _voteParams voting machine parameters.
     * @param _controllerAddress The address to receive the calls, if address 0x0 is used it wont make generic calls
     * to the avatar
     * @param _permissionRegistry The address of the permission registry contract
     * @param _maxProposalTime The maximum amount of time in seconds a proposal without executed since submitted time
     */
    function initialize(
        Avatar _avatar,
        IntVoteInterface _votingMachine,
        bytes32 _voteParams,
        address _controllerAddress,
        address _permissionRegistry,
        string calldata _schemeName,
        uint256 _maxProposalTime
    ) external {
        require(avatar == Avatar(0), "cannot init twice");
        require(_avatar != Avatar(0), "avatar cannot be zero");
        require(_maxProposalTime >= 86400, "_maxProposalTime cant be less than 86400 seconds");
        avatar = _avatar;
        votingMachine = _votingMachine;
        voteParams = _voteParams;
        controllerAddress = _controllerAddress;
        permissionRegistry = PermissionRegistry(_permissionRegistry);
        schemeName = _schemeName;
        maxProposalTime = _maxProposalTime;
    }

    /**
     * @dev Fallback function that allows the wallet to receive ETH when the controller address is not set
     */
    function() external payable {
        require(controllerAddress == address(0), "Cant receive if it will make generic calls to avatar");
    }
    
    /**
     * @dev Set the max proposal time from the avatar address
     * @param _maxProposalTime New max proposal time in seconds to be used
     * @return bool success
     */
    function setMaxProposalTime(uint256 _maxProposalTime) external {
        require(msg.sender == address(avatar), "setMaxProposalTime is callable only form the avatar");
        require(_maxProposalTime >= 86400, "_maxProposalTime cant be less than 86400 seconds");
        maxProposalTime = _maxProposalTime;
    }

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
        
        // If the amount of time passed since submission plus max proposal time is higher than block timestamp
        // the proposal timeout execution is reached and proposal cant be executed from now on
        if (proposal.submittedTime.add(maxProposalTime) < now) {
            proposal.state = ProposalState.ExecutionTimeout;
            emit ProposalExecutionTimeout(_proposalId);
        
        // If decision is 1, it means the proposal was approved by the voting machine
        } else if (_decision == 1) {
          
            // Get the total amount transfered by asset and recipients
            // Keep track of the permissionsIds that are loaded into storage to remove them later
            bytes32 permissionHash;
            bytes32[] memory permissionHashUsed = new bytes32[](proposal.to.length);
            for (uint256 i = 0; i < proposal.to.length; i++) {
                if (ERC20_TRANSFER_SIGNATURE == getFuncSignature(proposal.callData[i])) {
                    (address _to, uint256 _value) = erc20TransferDecode(proposal.callData[i]);
                    permissionHash = keccak256(abi.encodePacked(proposal.to[i], _to));
                    totalValueTransferedInCall[permissionHash] =
                        totalValueTransferedInCall[permissionHash].add(_value);
                } else {
                    permissionHash = keccak256(abi.encodePacked(address(0), proposal.to[i]));
                    totalValueTransferedInCall[permissionHash] =
                        totalValueTransferedInCall[permissionHash].add(proposal.value[i]);
                }
                permissionHashUsed[i] = permissionHash;
            }
        
            // If one call fails the transaction will revert
            proposal.state = ProposalState.ExecutionSucceded;
            bytes[] memory callsDataResult = new bytes[](proposal.to.length);
            bool[] memory callsSucessResult = new bool[](proposal.to.length);
            
            for (uint256 i = 0; i < proposal.to.length; i++) {
              
                // Gets the time form which the call is allowed to be executed and the value to be transfered
                uint256 _fromTime;
                uint256 _valueAllowed;
                bytes4 callSignature = getFuncSignature(proposal.callData[i]);
                
                // Checks that thte value tha is transfered (in ETH or ERC20) is lower or equal to the one that is
                // allowed for the function that wants to be executed
                if (ERC20_TRANSFER_SIGNATURE == callSignature) {
                    (address _to, uint256 _) = erc20TransferDecode(proposal.callData[i]);
                    (_valueAllowed, _fromTime) = permissionRegistry
                        .getPermission(
                            proposal.to[i],
                            controllerAddress != address(0) ? address(avatar) : address(this),
                            _to,
                            callSignature
                        );
                    require(
                        _valueAllowed >= totalValueTransferedInCall[keccak256(abi.encodePacked(proposal.to[i], _to))],
                        "erc20 value call not allowed"
                    );
                } else {
                    (_valueAllowed, _fromTime) = permissionRegistry
                        .getPermission(
                            address(0),
                            controllerAddress != address(0) ? address(avatar) : address(this),
                            proposal.to[i],
                            callSignature
                        );
                    require(
                        _valueAllowed >= totalValueTransferedInCall[keccak256(abi.encodePacked(address(0), proposal.to[i]))],
                        "value call not allowed"
                    );
                }
                
                // Check that the time from which the call can be executed means is higher than zero (which means that
                // is allowed) and that is lower than the actual timestamp
                require(_fromTime > 0 && now > _fromTime, "call not allowed");
                
                // If controller address is set the code needs to be encoded to generiCall function
                if (controllerAddress != address(0) && proposal.to[i] != controllerAddress) {
                    bytes memory genericCallData = abi.encodeWithSignature(
                        "genericCall(address,bytes,address,uint256)",
                        proposal.to[i], proposal.callData[i], avatar, proposal.value[i]
                    );
                    (callsSucessResult[i], callsDataResult[i]) =
                        address(controllerAddress).call.value(0)(genericCallData);
                  
                    // The success is form the generic call, but the result data is from the call to the controller
                    (bool genericCallSucessResult,) = 
                        abi.decode(callsDataResult[i], (bool, bytes));
                    callsSucessResult[i] = genericCallSucessResult;
                  
                // If controller address is not set the call is made to
                } else {
                    (callsSucessResult[i], callsDataResult[i]) =
                        address(proposal.to[i]).call.value(proposal.value[i])(proposal.callData[i]);
                }
                
                // If the call reverted the entire execution will revert
                require(callsSucessResult[i], "call execution failed");
            
            }
            
            // Delete all totalValueTransferedInCall values saved in storage
            for (uint256 i = 0; i < permissionHashUsed.length; i++) {
                delete totalValueTransferedInCall[permissionHashUsed[i]];
            }
            
            emit ProposalExecuted(_proposalId, callsSucessResult, callsDataResult);
            
        // If decision is 2, it means the proposal was rejected by the voting machine
        } else {
            proposal.state = ProposalState.Rejected;
            emit ProposalRejected(_proposalId);
        }
        
        emit ProposalExecutedByVotingMachine(_proposalId, _decision);
        return true;
    }

    /**
    * @dev Propose calls to be executed, the calls have to be allowed by the permission registry
    * @param _to - The addresses to call
    * @param _callData - The abi encode data for the calls
    * @param _value value(ETH) to transfer with the calls
    * @param _descriptionHash proposal description hash
    * @return an id which represents the proposal
    */
    function proposeCalls(
        address[] memory _to,
        bytes[] memory _callData,
        uint256[] memory _value,
        string memory _title,
        string memory _descriptionHash
    ) public returns(bytes32) {
      
        // Check the proposal calls
        for(uint i = 0; i < _to.length; i ++) {
            bytes4 callDataFuncSignature = getFuncSignature(_callData[i]);
            require(_to[i] != address(this) || (callDataFuncSignature == bytes4(0xa169093b) && _value[i] == 0), 'invalid proposal caller');
            require(_to[i] != ANY_ADDRESS, "cant propose calls to 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa address");
            require(callDataFuncSignature != ANY_SIGNATURE, "cant propose calls with 0xaaaaaaaa signature");
            require(callDataFuncSignature != ERC20_TRANSFER_SIGNATURE || _value[i] == 0, "cant propose ERC20 trasnfers with value");
        }
        require(_to.length == _callData.length, "invalid _callData length");
        require(_to.length == _value.length, "invalid _value length");

        // Get the proposal id that will be used from the voting machine
        bytes32 proposalId = votingMachine.propose(2, voteParams, msg.sender, address(avatar));
        
        // Add the proposal to the proposals mapping, proposals list and proposals information mapping
        proposals[proposalId] = Proposal({
            to: _to,
            callData: _callData,
            value: _value,
            state: ProposalState.Submitted,
            title: _title,
            descriptionHash: _descriptionHash,
            submittedTime: now
        });
        proposalsList.push(proposalId);
        proposalsInfo[address(votingMachine)][proposalId] = ProposalInfo({blockNumber: block.number, avatar: avatar});
        emit NewCallProposal(proposalId);
        return proposalId;
    }

    /**
    * @dev Get the information of a proposal by id
    * @param proposalId the ID of the proposal
    */
    function getOrganizationProposal(bytes32 proposalId) public view returns (
        address[] memory to,
        bytes[] memory callData,
        uint256[] memory value,
        ProposalState state,
        string memory title,
        string memory descriptionHash,
        uint256 submittedTime
    ) {
      return (
        proposals[proposalId].to,
        proposals[proposalId].callData,
        proposals[proposalId].value,
        proposals[proposalId].state,
        proposals[proposalId].title,
        proposals[proposalId].descriptionHash,
        proposals[proposalId].submittedTime
      );
    }
    
    /**
    * @dev Get the information of a proposal by index
    * @param proposalIndex the index of the proposal in the proposals list
    */
    function getOrganizationProposalByIndex(uint256 proposalIndex) public view returns (
        address[] memory to,
        bytes[] memory callData,
        uint256[] memory value,
        ProposalState state,
        string memory title,
        string memory descriptionHash,
        uint256 submittedTime
    ) {
      return getOrganizationProposal(proposalsList[proposalIndex]);
    }
    
    /**
     * @dev Decodes abi encoded data with selector for "transfer(address,uint256)".
     * @param _data ERC20 Transfer encoded data.
     * @return to The account to receive the tokens
     * @return value The value of tokens to be sent
     */
    function erc20TransferDecode(bytes memory _data) public pure returns(address to, uint256 value) {
        assembly {
            to := mload(add(_data, 36))
            value := mload(add(_data, 68))
        }
    }
    
    /**
    * @dev Get call data signature
    * @param data The bytes data of the data to get the signature
    */
    function getFuncSignature(bytes memory data) public pure returns (bytes4) {
        bytes32 functionSignature = bytes32(0);
        assembly {
            functionSignature := mload(add(data, 32))
        }
        return bytes4(functionSignature);
    }
    
    /**
    * @dev Get the proposals length
    */
    function getOrganizationProposalsLength() public view returns (uint256) {
        return proposalsList.length;
    }
    
    /**
    * @dev Get the proposals ids
    */
    function getOrganizationProposals() public view returns (bytes32[] memory) {
        return proposalsList;
    }
}
