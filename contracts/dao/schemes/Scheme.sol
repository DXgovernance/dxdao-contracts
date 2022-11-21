// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../utils/PermissionRegistry.sol";
import "../DAOReputation.sol";
import "../DAOAvatar.sol";
import "../DAOController.sol";
import "../votingMachine/DXDVotingMachineCallbacks.sol";

/**
 * @title Scheme.
 * @dev An abstract Scheme contract to be used as reference for any scheme implementation.
 * The Scheme is designed to work with a Voting Machine and allow a any amount of options and calls to be executed.
 * Each proposal contains a list of options, and each option a list of calls, each call has (to, data and value).
 * The options should have the same amount of calls, and all those calls are sent in arrays on the proposeCalls function.
 * The option 1 is always the default negative option, to vote against a proposal the vote goes on option 1.
 * A minimum of two options is required, where 1 == NO and 2 == YES.
 * Any options that are not 1 can be used for positive decisions with different calls to execute.
 * The calls that will be executed are the ones that located in the batch of calls of the winner option.
 * If there is 10 calls and 2 options it means that the 10 calls would be executed if option 2 wins.
 * if there is 10 calls and 3 options it means that if options 2 wins it will execute calls [0,4] and in case option 3 wins it will execute calls [5,9].
 * When a proposal is created it is registered in the voting machine.
 * Once the governance process ends on the voting machine the voting machine can execute the proposal winning option.
 * If the wining option cant be executed successfully, it can be finished without execution once the maxTimesForExecution time passes.
 */
abstract contract Scheme is DXDVotingMachineCallbacks {
    using Address for address;

    enum ProposalState {
        None,
        Submitted,
        Rejected,
        Passed
    }

    struct Proposal {
        address[] to;
        bytes[] callData;
        uint256[] value;
        uint256 totalOptions;
        ProposalState state;
        string title;
        string descriptionHash;
        uint256 submittedTime;
    }

    mapping(bytes32 => Proposal) public proposals;
    bytes32[] public proposalsList;

    DAOAvatar public avatar;
    PermissionRegistry public permissionRegistry;
    string public schemeName;
    uint256 public maxRepPercentageChange;

    // Boolean that is true when is executing a proposal, to avoid re-entrancy attacks.
    bool internal executingProposal;

    event ProposalStateChange(bytes32 indexed _proposalId, uint256 indexed _state);

    /// @notice Emitted when its initialized twice
    error Scheme__CannotInitTwice();

    /// @notice Emitted if avatar address is zero
    error Scheme__AvatarAddressCannotBeZero();

    /// @notice Emitted if controller address is zero
    error Scheme__ControllerAddressCannotBeZero();

    /// @notice _to, _callData and _value must have all the same length
    error Scheme_InvalidParameterArrayLength();

    /// @notice Emitted when the totalOptions paramers is invalid
    error Scheme__InvalidTotalOptionsOrActionsCallsLength();

    /// @notice Emitted when the proposal is already being executed
    error Scheme__ProposalExecutionAlreadyRunning();

    /// @notice Emitted when the proposal isn't submitted
    error Scheme__ProposalMustBeSubmitted();

    /// @notice Emitted when the call failed. Returns the revert error
    error Scheme__CallFailed(string reason);

    /// @notice Emitted when the maxRepPercentageChange is exceeded
    error Scheme__MaxRepPercentageChangePassed();

    /// @notice Emitted if the ERC20 limits are exceeded
    error Scheme__ERC20LimitsPassed();

    /**
     * @dev initialize
     * @param _avatar the avatar address
     * @param _votingMachine the voting machine address
     * @param _controller The controller address
     * @param _permissionRegistry The address of the permission registry contract
     * @param _maxRepPercentageChange The maximum percentage allowed to be changed in REP total supply after proposal
     * execution
     */
    function initialize(
        address payable _avatar,
        address _votingMachine,
        address _controller,
        address _permissionRegistry,
        string calldata _schemeName,
        uint256 _maxRepPercentageChange
    ) external {
        if (address(avatar) != address(0)) {
            revert Scheme__CannotInitTwice();
        }

        if (_avatar == address(0)) {
            revert Scheme__AvatarAddressCannotBeZero();
        }

        if (_controller == address(0)) {
            revert Scheme__ControllerAddressCannotBeZero();
        }

        avatar = DAOAvatar(_avatar);
        votingMachine = IDXDVotingMachine(_votingMachine);
        controller = DAOController(_controller);
        permissionRegistry = PermissionRegistry(_permissionRegistry);
        schemeName = _schemeName;
        maxRepPercentageChange = _maxRepPercentageChange;
    }

    /**
     * @dev Propose calls to be executed, the calls have to be allowed by the permission registry
     * @param _to - The addresses to call
     * @param _callData - The abi encode data for the calls
     * @param _value value(ETH) to transfer with the calls
     * @param _totalOptions The amount of options to be voted on
     * @param _title title of proposal
     * @param _descriptionHash proposal description hash
     * @return proposalId id which represents the proposal
     */
    function proposeCalls(
        address[] calldata _to,
        bytes[] calldata _callData,
        uint256[] calldata _value,
        uint256 _totalOptions,
        string calldata _title,
        string calldata _descriptionHash
    ) public virtual returns (bytes32 proposalId) {
        if (_to.length != _callData.length || _to.length != _value.length) {
            revert Scheme_InvalidParameterArrayLength();
        }

        if ((_value.length % (_totalOptions - 1)) != 0) {
            revert Scheme__InvalidTotalOptionsOrActionsCallsLength();
        }

        bytes32 voteParams = controller.getSchemeParameters(address(this));

        // Get the proposal id that will be used from the voting machine
        bytes32 proposalId = votingMachine.propose(_totalOptions, voteParams, msg.sender, address(avatar));

        controller.startProposal(proposalId);

        // Add the proposal to the proposals mapping, proposals list and proposals information mapping
        proposals[proposalId] = Proposal({
            to: _to,
            callData: _callData,
            value: _value,
            state: ProposalState.Submitted,
            totalOptions: _totalOptions,
            title: _title,
            descriptionHash: _descriptionHash,
            submittedTime: block.timestamp
        });
        // slither-disable-next-line all
        proposalsList.push(proposalId);
        proposalSnapshots[proposalId] = DAOReputation(getReputation()).getCurrentSnapshotId();
        emit ProposalStateChange(proposalId, uint256(ProposalState.Submitted));
        return proposalId;
    }

    /**
     * @dev execution of proposals, can only be called by the voting machine in which the vote is held.
     * @param _proposalId the ID of the voting in the voting machine
     * @param _winningOption The winning option in the voting machine
     * @return bool success
     */
    function executeProposal(bytes32 _proposalId, uint256 _winningOption)
        public
        virtual
        onlyVotingMachine
        returns (bool)
    {
        // We use isExecutingProposal variable to avoid re-entrancy in proposal execution
        if (executingProposal) {
            revert Scheme__ProposalExecutionAlreadyRunning();
        }
        executingProposal = true;

        Proposal memory proposal = proposals[_proposalId];

        if (proposal.state != ProposalState.Submitted) {
            revert Scheme__ProposalMustBeSubmitted();
        }

        if (_winningOption > 1) {
            uint256 oldRepSupply = getNativeReputationTotalSupply();

            permissionRegistry.setERC20Balances();

            uint256 callIndex = (proposal.to.length / (proposal.totalOptions - 1)) * (_winningOption - 2);
            uint256 lastCallIndex = callIndex + (proposal.to.length / (proposal.totalOptions - 1));
            bool callsSucessResult = false;
            bytes memory returnData;

            for (callIndex; callIndex < lastCallIndex; callIndex++) {
                bytes memory _data = proposal.callData[callIndex];

                if (proposal.to[callIndex] != address(0) || proposal.value[callIndex] > 0 || _data.length > 0) {
                    bytes4 callDataFuncSignature;
                    assembly {
                        callDataFuncSignature := mload(add(_data, 32))
                    }

                    // The permission registry keeps track of all value transferred and checks call permission
                    permissionRegistry.setETHPermissionUsed(
                        address(this),
                        proposal.to[callIndex],
                        callDataFuncSignature,
                        proposal.value[callIndex]
                    );

                    (callsSucessResult, returnData) = proposal.to[callIndex].call{value: proposal.value[callIndex]}(
                        proposal.callData[callIndex]
                    );

                    if (!callsSucessResult) {
                        revert Scheme__CallFailed({reason: string(returnData)});
                    }
                }
            }

            // Cant mint or burn more REP than the allowed percentaged set in the wallet scheme initialization
            if (
                ((oldRepSupply * (uint256(100) + (maxRepPercentageChange))) / 100 < getNativeReputationTotalSupply()) ||
                ((oldRepSupply * (uint256(100) - maxRepPercentageChange)) / 100 > getNativeReputationTotalSupply())
            ) {
                revert Scheme__MaxRepPercentageChangePassed();
            }

            if (!permissionRegistry.checkERC20Limits(address(this))) {
                revert Scheme__ERC20LimitsPassed();
            }
        }
        executingProposal = false;
        return true;
    }

    /**
     * @dev Finish a proposal and set the final state in storage
     * @param _proposalId the ID of the voting in the voting machine
     * @param _winningOption The winning option in the voting machine
     * @return bool success
     */
    function finishProposal(bytes32 _proposalId, uint256 _winningOption)
        public
        virtual
        onlyVotingMachine
        returns (bool)
    {
        Proposal storage proposal = proposals[_proposalId];
        if (proposal.state != ProposalState.Submitted) {
            revert Scheme__ProposalMustBeSubmitted();
        }

        if (_winningOption == 1) {
            proposal.state = ProposalState.Rejected;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.Rejected));
        } else {
            proposal.state = ProposalState.Passed;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.Passed));
        }
        controller.endProposal(_proposalId);
        return true;
    }

    /**
     * @dev Get the information of a proposal by id
     * @param proposalId the ID of the proposal
     */
    function getProposal(bytes32 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    /**
     * @dev Get the information of a proposal by index
     * @param proposalIndex the index of the proposal in the proposals list
     */
    function getProposalByIndex(uint256 proposalIndex) external view returns (Proposal memory) {
        return proposals[proposalsList[proposalIndex]];
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
     * @dev Get the scheme type
     */
    function getSchemeType() external view virtual returns (string memory) {}
}
