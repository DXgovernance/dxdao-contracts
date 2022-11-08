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
 * @dev  A scheme for proposing and executing calls to any contract except itself
 * It has a value call controller address, in case of the controller address ot be set the scheme will be doing
 * generic calls to the dao controller. If the controller address is not set it will e executing raw calls form the
 * scheme itself.
 * The scheme can only execute calls allowed to in the permission registry, if the controller address is set
 * the permissions will be checked using the avatar address as sender, if not the scheme address will be used as
 * sender.
 */
abstract contract Scheme is DXDVotingMachineCallbacks {
    using Address for address;

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
    uint256 public maxSecondsForExecution;
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

    /// @notice Emitted if maxSecondsForExecution is set lower than 86400
    error Scheme__MaxSecondsForExecutionTooLow();

    /// @notice Emitted when setMaxSecondsForExecution is being called from an address different than the avatar or the scheme
    error Scheme__SetMaxSecondsForExecutionInvalidCaller();

    /// @notice _to, _callData and _value must have all the same length
    error Scheme_InvalidParameterArrayLength();

    /// @notice Emitted when the total amount of options is not 2
    error Scheme__MustHaveTwoOptions();

    /**
     * @dev initialize
     * @param _avatar the avatar address
     * @param _votingMachine the voting machine address
     * @param _controller The controller address
     * @param _permissionRegistry The address of the permission registry contract
     * @param _maxSecondsForExecution The maximum amount of time in seconds for a proposal without executed since
     * submitted time
     * @param _maxRepPercentageChange The maximum percentage allowed to be changed in REP total supply after proposal
     * execution
     */
    function initialize(
        address payable _avatar,
        address _votingMachine,
        address _controller,
        address _permissionRegistry,
        string calldata _schemeName,
        uint256 _maxSecondsForExecution,
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

        if (_maxSecondsForExecution < 86400) {
            revert Scheme__MaxSecondsForExecutionTooLow();
        }

        avatar = DAOAvatar(_avatar);
        votingMachine = IDXDVotingMachine(_votingMachine);
        controller = DAOController(_controller);
        permissionRegistry = PermissionRegistry(_permissionRegistry);
        schemeName = _schemeName;
        maxSecondsForExecution = _maxSecondsForExecution;
        maxRepPercentageChange = _maxRepPercentageChange;
    }

    /**
     * @dev Set the max amount of seconds that a proposal has to be executed, only callable from the avatar address
     * @param _maxSecondsForExecution New max proposal time in seconds to be used
     */
    function setMaxSecondsForExecution(uint256 _maxSecondsForExecution) external virtual {
        if (msg.sender != address(avatar) || msg.sender != address(this)) {
            revert Scheme__SetMaxSecondsForExecutionInvalidCaller();
        }

        if (_maxSecondsForExecution < 86400) {
            revert Scheme__MaxSecondsForExecutionTooLow();
        }

        maxSecondsForExecution = _maxSecondsForExecution;
    }

    /**
     * @dev execution of proposals, can only be called by the voting machine in which the vote is held.
     * @param _proposalId the ID of the voting in the voting machine
     * @param _winningOption The winning option in the voting machine
     * @return bool success
     */
    function executeProposal(bytes32 _proposalId, uint256 _winningOption)
        external
        virtual
        onlyVotingMachine
        returns (bool)
    {}

    /**
     * @dev Propose calls to be executed, the calls have to be allowed by the permission registry
     * @param _to - The addresses to call
     * @param _callData - The abi encode data for the calls
     * @param _value value(ETH) to transfer with the calls
     * @param _totalOptions The amount of options to be voted on
     * @param _title title of proposal
     * @param _descriptionHash proposal description hash
     * @return an id which represents the proposal
     */
    function proposeCalls(
        address[] calldata _to,
        bytes[] calldata _callData,
        uint256[] calldata _value,
        uint256 _totalOptions,
        string calldata _title,
        string calldata _descriptionHash
    ) external returns (bytes32) {
        if (_to.length != _callData.length || _to.length != _value.length) {
            revert Scheme_InvalidParameterArrayLength();
        }

        if (_totalOptions != 2) {
            revert Scheme__MustHaveTwoOptions();
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
     * @dev Get the information of a proposal
     * @param proposalId the id of the proposal
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
