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
 * The permissions for [asset][SCHEME_ADDRESS][ANY_SIGNATURE] are used for global transfer limit, if it is set,
 * it wont allowed a higher total value transfered in the proposal higher to the one set there.
 */
contract WalletScheme is VotingMachineCallbacks, ProposalExecuteInterface {
    using SafeMath for uint256;
    
    string public SCHEME_TYPE = "Wallet Scheme v1";
    bytes4 public constant ERC20_TRANSFER_SIGNATURE = bytes4(keccak256("transfer(address,uint256)"));
    bytes4 public constant ERC20_APPROVE_SIGNATURE = bytes4(keccak256("approve(address,uint256)"));
    bytes4 public constant SET_MAX_SECONDS_FOR_EXECUTION_SIGNATURE =
        bytes4(keccak256("setMaxSecondsForExecution(uint256)"));
    bytes4 public constant ANY_SIGNATURE = bytes4(0xaaaaaaaa);
    address public constant ANY_ADDRESS = address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa);

    enum ProposalState {None, Submitted, Rejected, ExecutionSucceded, ExecutionTimeout}

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
    uint256 public maxSecondsForExecution;
    uint256 public maxRepPercentageChange;
    
    // This mapping is used as "memory storage" in executeProposal function, to keep track of the total value
    // transfered of by asset and address, it saves both aseet and address as keccak256(asset, recipient)
    mapping(bytes32 => uint256) internal valueTransferedByAssetAndRecipient;
    
    // This mapping is used as "memory storage" in executeProposal function, to keep track of the total value
    // transfered of by asset in the call execution
    mapping(address => uint256) internal valueTransferedByAsset;
    
    // Boolean that is true when is executing a proposal, to avoid re-entrancy attacks.
    bool internal executingProposal;
    
    event ProposalStateChange(bytes32 indexed _proposalId, uint256 indexed _state);
    event ExecutionResults(bytes32 indexed _proposalId, bool[] _callsSucessResult, bytes[] _callsDataResult);

    /**
     * @dev initialize
     * @param _avatar the avatar address
     * @param _votingMachine the voting machines address to
     * @param _voteParams voting machine parameters.
     * @param _controllerAddress The address to receive the calls, if address 0x0 is used it wont make generic calls
     * to the avatar
     * @param _permissionRegistry The address of the permission registry contract
     * @param _maxSecondsForExecution The maximum amount of time in seconds  for a proposal without executed since
     * submitted time
     * @param _maxRepPercentageChange The maximum percentage allowed to be changed in REP total supply after proposal
     * execution
     */
    function initialize(
        Avatar _avatar,
        IntVoteInterface _votingMachine,
        bytes32 _voteParams,
        address _controllerAddress,
        address _permissionRegistry,
        string calldata _schemeName,
        uint256 _maxSecondsForExecution,
        uint256 _maxRepPercentageChange
    ) external {
        require(avatar == Avatar(0), "WalletScheme: cannot init twice");
        require(_avatar != Avatar(0), "WalletScheme: avatar cannot be zero");
        require(
            _maxSecondsForExecution >= 86400, "WalletScheme: _maxSecondsForExecution cant be less than 86400 seconds"
        );
        avatar = _avatar;
        votingMachine = _votingMachine;
        voteParams = _voteParams;
        controllerAddress = _controllerAddress;
        permissionRegistry = PermissionRegistry(_permissionRegistry);
        schemeName = _schemeName;
        maxSecondsForExecution = _maxSecondsForExecution;
        maxRepPercentageChange = _maxRepPercentageChange;
    }

    /**
     * @dev Fallback function that allows the wallet to receive ETH when the controller address is not set
     */
    function() external payable {
        require(controllerAddress == address(0), "WalletScheme: Cant receive if it will make generic calls to avatar");
    }
    
    /**
     * @dev Set the max amount of seconds that a proposal has to be executed, only callable from the avatar address
     * @param _maxSecondsForExecution New max proposal time in seconds to be used
     * @return bool success
     */
    function setMaxSecondsForExecution(uint256 _maxSecondsForExecution) external {
        require(
            msg.sender == address(avatar), "WalletScheme: setMaxSecondsForExecution is callable only form the avatar"
        );
        require(
            _maxSecondsForExecution >= 86400, "WalletScheme: _maxSecondsForExecution cant be less than 86400 seconds"
        );
        maxSecondsForExecution = _maxSecondsForExecution;
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
        require(!executingProposal, "WalletScheme: proposal execution already running");
        executingProposal = true;
        
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.state == ProposalState.Submitted, "WalletScheme: must be a submitted proposal");
        
        // If the amount of time passed since submission plus max proposal time is lower than block timestamp
        // the proposal timeout execution is reached and proposal cant be executed from now on
        if (proposal.submittedTime.add(maxSecondsForExecution) < now) {
            proposal.state = ProposalState.ExecutionTimeout;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.ExecutionTimeout));
        
        // If decision is 1, it means the proposal was approved by the voting machine
        } else if (_decision == 1) {
          
            uint256 oldRepSupply = avatar.nativeReputation().totalSupply();
            
            // Get the total amount transfered by asset and recipients
            // Keep track of the permissionsIds that are loaded into storage to remove them later
            bytes4 callDataFuncSignature;
            bytes32 permissionHash;
            bytes32[] memory permissionHashUsed = new bytes32[](proposal.to.length);
            address[] memory assetsUsed = new address[](proposal.to.length);
            for (uint256 i = 0; i < proposal.to.length; i++) {
                callDataFuncSignature = getFuncSignature(proposal.callData[i]);
                if (
                    ERC20_TRANSFER_SIGNATURE == callDataFuncSignature
                    || ERC20_APPROVE_SIGNATURE == callDataFuncSignature
                ) {
                    (address _to, uint256 _value) = erc20TransferOrApproveDecode(proposal.callData[i]);
                    permissionHash = keccak256(abi.encodePacked(proposal.to[i], _to));
                    
                    // Save asset in assets used to check later and add the used value transfered
                    if (valueTransferedByAsset[proposal.to[i]] == 0)
                      assetsUsed[i] = proposal.to[i];
                    
                    valueTransferedByAsset[proposal.to[i]] =
                      valueTransferedByAsset[proposal.to[i]].add(_value);
                    
                    // Save permission in permissions used to check later and add the value transfered
                    if (valueTransferedByAssetAndRecipient[permissionHash] == 0)
                      permissionHashUsed[i] = permissionHash;
                    
                    valueTransferedByAssetAndRecipient[permissionHash] =
                        valueTransferedByAssetAndRecipient[permissionHash].add(_value);
                } else {
                    permissionHash = keccak256(abi.encodePacked(address(0), proposal.to[i]));
                    
                    // Save asset in assets used to check later and add the used value transfered
                    if (valueTransferedByAsset[address(0)] == 0)
                      assetsUsed[i] = address(0);
                    
                    valueTransferedByAsset[address(0)] =
                      valueTransferedByAsset[address(0)].add(proposal.value[i]);
                    
                    // Save permission in permissions used to check later and add the value transfered
                    if (valueTransferedByAssetAndRecipient[permissionHash] == 0)
                      permissionHashUsed[i] = permissionHash;
                    
                    valueTransferedByAssetAndRecipient[permissionHash] =
                        valueTransferedByAssetAndRecipient[permissionHash].add(proposal.value[i]);
                }
                
            }
        
            // If one call fails the transaction will revert
            bytes[] memory callsDataResult = new bytes[](proposal.to.length);
            bool[] memory callsSucessResult = new bool[](proposal.to.length);
            uint256 _fromTime;
            uint256 _valueAllowed;
            
            // Check and delete all valueTransferedByAsset values saved in storage
            for (uint256 i = 0; i < assetsUsed.length; i++) {
              (_valueAllowed, _fromTime) = permissionRegistry
                  .getPermission(
                      assetsUsed[i],
                      controllerAddress != address(0) ? address(avatar) : address(this),
                      address(this),
                      ANY_SIGNATURE
                  );
                require(
                    (_fromTime == 0) || (_fromTime > 0 && _valueAllowed >= valueTransferedByAsset[assetsUsed[i]]),
                    "WalletScheme: total value transfered of asset in proposal not allowed"
                );
                delete valueTransferedByAsset[assetsUsed[i]];
            }
            
            for (uint256 i = 0; i < proposal.to.length; i++) {
              
                // Gets the time form which the call is allowed to be executed and the value to be transfered
                callDataFuncSignature = getFuncSignature(proposal.callData[i]);
                
                // Checks that thte value tha is transfered (in ETH or ERC20) is lower or equal to the one that is
                // allowed for the function that wants to be executed
                if (
                    ERC20_TRANSFER_SIGNATURE == callDataFuncSignature
                    || ERC20_APPROVE_SIGNATURE == callDataFuncSignature
                ) {
                    (address _to, uint256 _) = erc20TransferOrApproveDecode(proposal.callData[i]);
                    (_valueAllowed, _fromTime) = permissionRegistry
                        .getPermission(
                            proposal.to[i],
                            controllerAddress != address(0) ? address(avatar) : address(this),
                            _to,
                            callDataFuncSignature
                        );
                    require(
                        _valueAllowed
                        >=
                        valueTransferedByAssetAndRecipient[keccak256(abi.encodePacked(proposal.to[i], _to))],
                        "WalletScheme: erc20 value call not allowed"
                    );
                } else {
                    (_valueAllowed, _fromTime) = permissionRegistry
                        .getPermission(
                            address(0),
                            controllerAddress != address(0) ? address(avatar) : address(this),
                            proposal.to[i],
                            callDataFuncSignature
                        );
                    require(
                        _valueAllowed >= valueTransferedByAssetAndRecipient[
                            keccak256(abi.encodePacked(address(0), proposal.to[i]))
                        ],
                        "WalletScheme: value call not allowed"
                    );
                }
                
                // Check that the time from which the call can be executed means is higher than zero (which means that
                // is allowed) and that is lower than the actual timestamp
                require(_fromTime > 0 && now > _fromTime, "WalletScheme: call not allowed");
                
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
                require(callsSucessResult[i], "WalletScheme: call execution failed");
            
            }
            // Cant mint or burn more REP than the allowed percentaje set in the wallet scheme initialization
            require(
              (
                oldRepSupply.mul(uint256(100).add(maxRepPercentageChange)).div(100)
                >=
                avatar.nativeReputation().totalSupply()
              ) && (
                oldRepSupply.mul(uint256(100).sub(maxRepPercentageChange)).div(100)
                <=
                avatar.nativeReputation().totalSupply()
              ),
              "WalletScheme: maxRepPercentageChange passed"
            );
            
            // Delete all valueTransferedByAssetAndRecipient values saved in storage
            for (uint256 i = 0; i < permissionHashUsed.length; i++) {
                delete valueTransferedByAssetAndRecipient[permissionHashUsed[i]];
            }
            proposal.state = ProposalState.ExecutionSucceded;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.ExecutionSucceded));
            emit ExecutionResults(_proposalId, callsSucessResult, callsDataResult);
            
        // If decision is 2, it means the proposal was rejected by the voting machine
        } else {
            proposal.state = ProposalState.Rejected;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.Rejected));
        }
        
        executingProposal = false;
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
            
            // Check that no proposals are submitted to wildcard address and function signature
            require(
                _to[i] != ANY_ADDRESS,
                "WalletScheme: cant propose calls to 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa address"
            );
            require(
              callDataFuncSignature != ANY_SIGNATURE,
              "WalletScheme: cant propose calls with 0xaaaaaaaa signature"
            );
            
            // Only allow proposing calls to this address to call setMaxSecondsForExecution function
            require(
                _to[i] != address(this)
                || (callDataFuncSignature == SET_MAX_SECONDS_FOR_EXECUTION_SIGNATURE && _value[i] == 0)
                , "WalletScheme: invalid proposal caller"
            );
            
            // This will fail only when and ERC20 transfer or approve with ETH value is proposed
            require(
                (callDataFuncSignature != ERC20_TRANSFER_SIGNATURE && callDataFuncSignature != ERC20_APPROVE_SIGNATURE)
                || _value[i] == 0,
                "WalletScheme: cant propose ERC20 transfers with value"
            );
        }
        require(_to.length == _callData.length, "WalletScheme: invalid _callData length");
        require(_to.length == _value.length, "WalletScheme: invalid _value length");

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
        emit ProposalStateChange(proposalId, uint256(ProposalState.Submitted));
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
     * @param _data ERC20 addres and value encoded data.
     * @return to The account to receive the tokens
     * @return value The value of tokens to be transfered/approved
     */
    function erc20TransferOrApproveDecode(bytes memory _data) public pure returns(address to, uint256 value) {
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
