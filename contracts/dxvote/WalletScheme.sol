// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../utils/PermissionRegistry.sol";

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
contract WalletScheme {
    using SafeMath for uint256;
    using Address for address;

    string public constant SCHEME_TYPE = "Wallet Scheme v1.3";
    bytes4 public constant ERC20_TRANSFER_SIGNATURE = bytes4(keccak256("transfer(address,uint256)"));
    bytes4 public constant ERC20_APPROVE_SIGNATURE = bytes4(keccak256("approve(address,uint256)"));
    bytes4 public constant SET_MAX_SECONDS_FOR_EXECUTION_SIGNATURE =
        bytes4(keccak256("setMaxSecondsForExecution(uint256)"));

    enum ProposalState {
        None,
        Submitted,
        Rejected,
        ExecutionSucceeded,
        ExecutionTimeout
    }

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

    bool public doAvatarGenericCalls;
    address public controller;
    PermissionRegistry public permissionRegistry;
    string public schemeName;
    uint256 public maxSecondsForExecution;
    uint256 public maxRepPercentageChange;

    address public votingMachine;
    address public avatar;

    // Boolean that is true when is executing a proposal, to avoid re-entrancy attacks.
    bool internal executingProposal;

    event ProposalStateChange(bytes32 indexed _proposalId, uint256 indexed _state);
    event ExecutionResults(bytes32 indexed _proposalId, bool[] _callsSucessResult, bytes[] _callsDataResult);

    /**
     * @dev initialize
     * @param _avatar the avatar address
     * @param _votingMachine the voting machine address
     * @param _doAvatarGenericCalls will the scheme do generic calls from the avatar
     * @param _controller The controller address
     * @param _permissionRegistry The address of the permission registry contract
     * @param _maxSecondsForExecution The maximum amount of time in seconds for a proposal without executed since
     * submitted time
     * @param _maxRepPercentageChange The maximum percentage allowed to be changed in REP total supply after proposal
     * execution
     */
    function initialize(
        address _avatar,
        address _votingMachine,
        bool _doAvatarGenericCalls,
        address _controller,
        address _permissionRegistry,
        string calldata _schemeName,
        uint256 _maxSecondsForExecution,
        uint256 _maxRepPercentageChange
    ) external {
        require(avatar == address(0), "WalletScheme: cannot init twice");
        require(_avatar != address(0), "WalletScheme: avatar cannot be zero");
        require(_controller != address(0), "WalletScheme: controller cannot be zero");
        require(
            _maxSecondsForExecution >= 86400,
            "WalletScheme: _maxSecondsForExecution cant be less than 86400 seconds"
        );
        avatar = _avatar;
        votingMachine = _votingMachine;
        doAvatarGenericCalls = _doAvatarGenericCalls;
        controller = _controller;
        permissionRegistry = PermissionRegistry(_permissionRegistry);
        schemeName = _schemeName;
        maxSecondsForExecution = _maxSecondsForExecution;
        maxRepPercentageChange = _maxRepPercentageChange;
    }

    /**
     * @dev Fallback function that allows the wallet to receive ETH when the controller address is not set
     */
    receive() external payable {
        require(!doAvatarGenericCalls, "WalletScheme: Cant receive if it will make generic calls to avatar");
    }

    /**
     * @dev Set the max amount of seconds that a proposal has to be executed, only callable from the avatar address
     * @param _maxSecondsForExecution New max proposal time in seconds to be used
     */
    function setMaxSecondsForExecution(uint256 _maxSecondsForExecution) external {
        require(
            msg.sender == address(avatar),
            "WalletScheme: setMaxSecondsForExecution is callable only form the avatar"
        );
        require(
            _maxSecondsForExecution >= 86400,
            "WalletScheme: _maxSecondsForExecution cant be less than 86400 seconds"
        );
        maxSecondsForExecution = _maxSecondsForExecution;
    }

    /**
     * @dev execution of proposals, can only be called by the voting machine in which the vote is held.
        REQUIRE FROM "../daostack/votingMachines/ProposalExecuteInterface.sol" DONT REMOVE
     * @param _proposalId the ID of the voting in the voting machine
     * @param _decision a parameter of the voting result, 1 yes and 2 is no.
     * @return bool success
     */
    function executeProposal(bytes32 _proposalId, int256 _decision) external onlyVotingMachine returns (bool) {
        require(!executingProposal, "WalletScheme: proposal execution already running");
        executingProposal = true;

        Proposal storage proposal = proposals[_proposalId];
        require(proposal.state == ProposalState.Submitted, "WalletScheme: must be a submitted proposal");

        // If the amount of time passed since submission plus max proposal time is lower than block timestamp
        // the proposal timeout execution is reached and proposal cant be executed from now on
        if (proposal.submittedTime.add(maxSecondsForExecution) < block.timestamp) {
            proposal.state = ProposalState.ExecutionTimeout;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.ExecutionTimeout));

            // If decision is 1, it means the proposal was approved by the voting machine
        } else if (_decision == 1) {
            uint256 oldRepSupply = getNativeReputationTotalSupply();

            // If one call fails the transaction will revert
            bytes[] memory callsDataResult = new bytes[](proposal.to.length);
            bool[] memory callsSucessResult = new bool[](proposal.to.length);
            address _asset;
            address _to;
            bytes4 _callDataFuncSignature;
            uint256 _value;

            if (doAvatarGenericCalls) {
                address(controller).call(
                    abi.encodeWithSignature(
                        "genericCall(address,bytes,address,uint256)",
                        address(permissionRegistry),
                        abi.encodeWithSignature("setERC20Balances()"),
                        avatar,
                        0
                    )
                );
            } else {
                permissionRegistry.setERC20Balances();
            }

            for (uint256 i = 0; i < proposal.to.length; i++) {
                _asset = address(0);
                _callDataFuncSignature = this.getFuncSignature(proposal.callData[i]);

                // The permission registry keeps track of all value transferred and checks call permission
                if (doAvatarGenericCalls) {
                    (, bytes memory permissionData) = address(controller).call(
                        abi.encodeWithSignature(
                            "genericCall(address,bytes,address,uint256)",
                            address(permissionRegistry),
                            abi.encodeWithSignature(
                                "setETHPermissionUsed(address,address,bytes4,uint256)",
                                avatar,
                                proposal.to[i],
                                _callDataFuncSignature,
                                proposal.value[i]
                            ),
                            avatar,
                            0
                        )
                    );
                    // if permissionData is longer than 96 bytes this is cause it is a revert message
                    require(permissionData.length == 96, "WalletScheme: permission check failed");
                } else {
                    permissionRegistry.setETHPermissionUsed(
                        address(this),
                        proposal.to[i],
                        _callDataFuncSignature,
                        proposal.value[i]
                    );
                }

                // If controller address is set the code needs to be encoded to genericCall function
                if (doAvatarGenericCalls && proposal.to[i] != address(controller)) {
                    bytes memory genericCallData = abi.encodeWithSignature(
                        "genericCall(address,bytes,address,uint256)",
                        proposal.to[i],
                        proposal.callData[i],
                        avatar,
                        proposal.value[i]
                    );
                    (callsSucessResult[i], callsDataResult[i]) = address(controller).call{value: 0}(genericCallData);

                    // The success is form the generic call, but the result data is from the call to the controller
                    (bool genericCallSucessResult, ) = abi.decode(callsDataResult[i], (bool, bytes));
                    callsSucessResult[i] = genericCallSucessResult;

                    // If controller address is not set the call is made to
                } else {
                    (callsSucessResult[i], callsDataResult[i]) = address(proposal.to[i]).call{value: proposal.value[i]}(
                        proposal.callData[i]
                    );
                }

                // If the call reverted the entire execution will revert
                require(callsSucessResult[i], "WalletScheme: call execution failed");
            }
            // Cant mint or burn more REP than the allowed percentaged set in the wallet scheme initialization
            require(
                (oldRepSupply.mul(uint256(100).add(maxRepPercentageChange)).div(100) >=
                    getNativeReputationTotalSupply()) &&
                    (oldRepSupply.mul(uint256(100).sub(maxRepPercentageChange)).div(100) <=
                        getNativeReputationTotalSupply()),
                "WalletScheme: maxRepPercentageChange passed"
            );

            require(permissionRegistry.checkERC20Limits(doAvatarGenericCalls ? avatar : address(this)));

            proposal.state = ProposalState.ExecutionSucceeded;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.ExecutionSucceeded));
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
     * @param _title title of proposal
     * @param _descriptionHash proposal description hash
     * @return an id which represents the proposal
     */
    function proposeCalls(
        address[] calldata _to,
        bytes[] calldata _callData,
        uint256[] calldata _value,
        string calldata _title,
        string calldata _descriptionHash
    ) external returns (bytes32) {
        // Check the proposal calls
        for (uint256 i = 0; i < _to.length; i++) {
            bytes4 callDataFuncSignature = getFuncSignature(_callData[i]);

            // Only allow proposing calls to this address to call setMaxSecondsForExecution function
            require(
                _to[i] != address(this) ||
                    (callDataFuncSignature == SET_MAX_SECONDS_FOR_EXECUTION_SIGNATURE && _value[i] == 0),
                "WalletScheme: invalid proposal caller"
            );

            // This will fail only when and ERC20 transfer or approve with ETH value is proposed
            require(
                (callDataFuncSignature != ERC20_TRANSFER_SIGNATURE &&
                    callDataFuncSignature != ERC20_APPROVE_SIGNATURE) || _value[i] == 0,
                "WalletScheme: cant propose ERC20 transfers with value"
            );
        }
        require(_to.length == _callData.length, "WalletScheme: invalid _callData length");
        require(_to.length == _value.length, "WalletScheme: invalid _value length");

        bytes32 voteParams = abi.decode(
            controller.functionStaticCall(
                abi.encodeWithSignature("getSchemeParameters(address,address)", address(this), avatar),
                "WalletScheme: getSchemeParameters error"
            ),
            (bytes32)
        );

        // Get the proposal id that will be used from the voting machine
        // bytes32 proposalId = votingMachine.propose(2, voteParams, msg.sender, address(avatar));
        bytes32 proposalId = abi.decode(
            votingMachine.functionCall(
                abi.encodeWithSignature("propose(uint256,bytes32,address,address)", 2, voteParams, msg.sender, avatar),
                "WalletScheme: DXDVotingMachine callback propose error"
            ),
            (bytes32)
        );

        // Add the proposal to the proposals mapping, proposals list and proposals information mapping
        proposals[proposalId] = Proposal({
            to: _to,
            callData: _callData,
            value: _value,
            state: ProposalState.Submitted,
            title: _title,
            descriptionHash: _descriptionHash,
            submittedTime: block.timestamp
        });
        // slither-disable-next-line all
        proposalsList.push(proposalId);
        proposalsBlockNumber[proposalId] = block.number;
        emit ProposalStateChange(proposalId, uint256(ProposalState.Submitted));
        return proposalId;
    }

    /**
     * @dev Get the information of a proposal by id
     * @param proposalId the ID of the proposal
     */
    function getOrganizationProposal(bytes32 proposalId)
        public
        view
        returns (
            address[] memory to,
            bytes[] memory callData,
            uint256[] memory value,
            ProposalState state,
            string memory title,
            string memory descriptionHash,
            uint256 submittedTime
        )
    {
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
    function getOrganizationProposalByIndex(uint256 proposalIndex)
        external
        view
        returns (
            address[] memory to,
            bytes[] memory callData,
            uint256[] memory value,
            ProposalState state,
            string memory title,
            string memory descriptionHash,
            uint256 submittedTime
        )
    {
        return getOrganizationProposal(proposalsList[proposalIndex]);
    }

    /**
     * @dev Get call data signature
     * @param data The bytes data of the data to get the signature
     */
    function getFuncSignature(bytes calldata data) public pure returns (bytes4) {
        if (data.length >= 4) {
            return bytes4(data[:4]);
        } else {
            return bytes4(0);
        }
    }

    /**
     * @dev Get the proposals length
     */
    function getOrganizationProposalsLength() external view returns (uint256) {
        return proposalsList.length;
    }

    /**
     * @dev Get the proposals ids
     */
    function getOrganizationProposals() external view returns (bytes32[] memory) {
        return proposalsList;
    }

    /**
     * @dev DXDVotingMachineCallbacks DONT REMOVE
     */

    modifier onlyVotingMachine() {
        require(msg.sender == address(votingMachine), "only VotingMachine");
        _;
    }

    mapping(bytes32 => uint256) public proposalsBlockNumber;

    function mintReputation(
        uint256 _amount,
        address _beneficiary,
        bytes32
    ) external onlyVotingMachine returns (bool) {
        // return ControllerInterface(avatar.owner()).mintReputation(_amount, _beneficiary, address(avatar));
        return
            abi.decode(
                controller.functionCall(
                    abi.encodeWithSignature(
                        "mintReputation(uint256,address,address)",
                        _amount,
                        _beneficiary,
                        address(avatar)
                    ),
                    "WalletScheme: DXDVotingMachine callback mintReputation error"
                ),
                (bool)
            );
    }

    function burnReputation(
        uint256 _amount,
        address _beneficiary,
        bytes32
    ) external onlyVotingMachine returns (bool) {
        // return ControllerInterface(avatar.owner()).burnReputation(_amount, _beneficiary, address(avatar));
        return
            abi.decode(
                controller.functionCall(
                    abi.encodeWithSignature(
                        "burnReputation(uint256,address,address)",
                        _amount,
                        _beneficiary,
                        address(avatar)
                    ),
                    "WalletScheme: DXDVotingMachine callback burnReputation error"
                ),
                (bool)
            );
    }

    function stakingTokenTransfer(
        IERC20 _stakingToken,
        address _beneficiary,
        uint256 _amount,
        bytes32
    ) external onlyVotingMachine returns (bool) {
        return
            abi.decode(
                controller.functionCall(
                    abi.encodeWithSignature(
                        "externalTokenTransfer(address,address,uint256,address)",
                        address(_stakingToken),
                        _beneficiary,
                        _amount,
                        address(avatar)
                    ),
                    "WalletScheme: DXDVotingMachine callback externalTokenTransfer error"
                ),
                (bool)
            );
    }

    function getNativeReputation() public view returns (address) {
        // return Avatar(avatar).nativeReputation();
        return
            abi.decode(
                avatar.functionStaticCall(
                    abi.encodeWithSignature("nativeReputation()"),
                    "WalletScheme: DXDVotingMachine callback nativeReputation error"
                ),
                (address)
            );
    }

    function getNativeReputationTotalSupply() public view returns (uint256) {
        // return Avatar(avatar).nativeReputation().totalSupply();
        return
            abi.decode(
                getNativeReputation().functionStaticCall(
                    abi.encodeWithSignature("totalSupply()"),
                    "WalletScheme: DXDVotingMachine callback totalSupply error"
                ),
                (uint256)
            );
    }

    function balanceOfStakingToken(IERC20 _stakingToken, bytes32) external view returns (uint256) {
        return _stakingToken.balanceOf(address(avatar));
    }

    function getTotalReputationSupply(bytes32 _proposalId) external view returns (uint256) {
        // return Avatar(avatar).nativeReputation().totalSupplyAt(proposalsBlockNumber[_proposalId]);
        return
            abi.decode(
                getNativeReputation().functionStaticCall(
                    abi.encodeWithSignature("totalSupplyAt(uint256)", proposalsBlockNumber[_proposalId]),
                    "WalletScheme: DXDVotingMachine callback totalSupplyAt error"
                ),
                (uint256)
            );
    }

    function reputationOf(address _owner, bytes32 _proposalId) external view returns (uint256) {
        // return Avatar(avatar).nativeReputation().balanceOfAt(_owner, proposalsBlockNumber[_proposalId]);
        return
            abi.decode(
                getNativeReputation().functionStaticCall(
                    abi.encodeWithSignature("balanceOfAt(address,uint256)", _owner, proposalsBlockNumber[_proposalId]),
                    "WalletScheme: DXDVotingMachine callback balanceOfAt error"
                ),
                (uint256)
            );
    }
}
