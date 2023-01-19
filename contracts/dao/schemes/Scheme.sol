// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../utils/PermissionRegistry.sol";
import "../DAOReputation.sol";
import "../DAOAvatar.sol";
import "../DAOController.sol";
import "../votingMachine/VotingMachineCallbacks.sol";

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
abstract contract Scheme is VotingMachineCallbacks {
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

    /// @notice Boolean that is true when is executing a proposal, to avoid re-entrancy attacks.
    bool internal executingProposal;

    event ProposalStateChange(bytes32 indexed proposalId, uint256 indexed state);

    /// @notice Emitted when its initialized twice
    error Scheme__CannotInitTwice();

    /// @notice Emitted if avatar address is zero
    error Scheme__AvatarAddressCannotBeZero();

    /// @notice Emitted if controller address is zero
    error Scheme__ControllerAddressCannotBeZero();

    /// @notice to, callData and value must have all the same length
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
     * @dev Initialize Scheme contract
     * @param avatarAddress The avatar address
     * @param votingMachineAddress The voting machine address
     * @param controllerAddress The controller address
     * @param permissionRegistryAddress The address of the permission registry contract
     * @param _schemeName The name of the scheme
     * @param _maxRepPercentageChange The maximum percentage allowed to be changed in REP total supply after proposal execution
     */
    function initialize(
        address payable avatarAddress,
        address votingMachineAddress,
        address controllerAddress,
        address permissionRegistryAddress,
        string calldata _schemeName,
        uint256 _maxRepPercentageChange
    ) external {
        if (address(avatar) != address(0)) {
            revert Scheme__CannotInitTwice();
        }

        if (avatarAddress == address(0)) {
            revert Scheme__AvatarAddressCannotBeZero();
        }

        if (controllerAddress == address(0)) {
            revert Scheme__ControllerAddressCannotBeZero();
        }

        avatar = DAOAvatar(avatarAddress);
        votingMachine = IVotingMachine(votingMachineAddress);
        controller = DAOController(controllerAddress);
        permissionRegistry = PermissionRegistry(permissionRegistryAddress);
        schemeName = _schemeName;
        maxRepPercentageChange = _maxRepPercentageChange;
    }

    /**
     * @dev Propose calls to be executed, the calls have to be allowed by the permission registry
     * @param to The addresses to call
     * @param callData The abi encode data for the calls
     * @param value Value (ETH) to transfer with the calls
     * @param totalOptions The amount of options to be voted on
     * @param title Title of proposal
     * @param descriptionHash Proposal description hash
     * @return proposalId ID which represents the proposal
     */
    function proposeCalls(
        address[] calldata to,
        bytes[] calldata callData,
        uint256[] calldata value,
        uint256 totalOptions,
        string calldata title,
        string calldata descriptionHash
    ) public virtual returns (bytes32 proposalId) {
        if (to.length != callData.length || to.length != value.length) {
            revert Scheme_InvalidParameterArrayLength();
        }

        if ((value.length % (totalOptions - 1)) != 0) {
            revert Scheme__InvalidTotalOptionsOrActionsCallsLength();
        }

        bytes32 voteParams = controller.getSchemeParameters(address(this));

        // Get the proposal id that will be used from the voting machine
        proposalId = votingMachine.propose(totalOptions, voteParams, msg.sender, address(avatar));

        // Add the proposal to the proposals mapping, proposals list and proposals information mapping
        proposals[proposalId] = Proposal({
            to: to,
            callData: callData,
            value: value,
            state: ProposalState.Submitted,
            totalOptions: totalOptions,
            title: title,
            descriptionHash: descriptionHash,
            submittedTime: block.timestamp
        });
        // slither-disable-next-line all
        proposalsList.push(proposalId);
        proposalSnapshots[proposalId] = DAOReputation(getReputation()).getCurrentSnapshotId();
        emit ProposalStateChange(proposalId, uint256(ProposalState.Submitted));
        return proposalId;
    }

    /**
     * @dev Execute the proposal calls for the winning option,
     * can only be called by the voting machine in which the vote is held.
     * @param proposalId The ID of the voting in the voting machine
     * @param winningOption The winning option in the voting machine
     * @return success Success of the execution
     */
    function executeProposal(bytes32 proposalId, uint256 winningOption)
        public
        virtual
        onlyVotingMachine
        returns (bool success)
    {
        // We use isExecutingProposal variable to avoid re-entrancy in proposal execution
        if (executingProposal) {
            revert Scheme__ProposalExecutionAlreadyRunning();
        }
        executingProposal = true;

        Proposal storage proposal = proposals[proposalId];

        if (proposal.state != ProposalState.Submitted) {
            revert Scheme__ProposalMustBeSubmitted();
        }

        if (winningOption == 1) {
            proposal.state = ProposalState.Rejected;
            emit ProposalStateChange(proposalId, uint256(ProposalState.Rejected));
        } else {
            proposal.state = ProposalState.Passed;
            emit ProposalStateChange(proposalId, uint256(ProposalState.Passed));
            uint256 oldRepSupply = getNativeReputationTotalSupply();

            permissionRegistry.setERC20Balances();

            uint256 callIndex = (proposal.to.length / (proposal.totalOptions - 1)) * (winningOption - 2);
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
     * @dev Finish a proposal and set the final state in storage without any execution.
     * The only thing done here is a change in the proposal state in case the proposal was not executed.
     * @param proposalId The ID of the voting in the voting machine
     * @param winningOption The winning option in the voting machine
     * @return success Proposal finish successfully
     */
    function finishProposal(bytes32 proposalId, uint256 winningOption)
        public
        virtual
        onlyVotingMachine
        returns (bool success)
    {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.state == ProposalState.Submitted) {
            if (winningOption == 1) {
                proposal.state = ProposalState.Rejected;
                emit ProposalStateChange(proposalId, uint256(ProposalState.Rejected));
            } else {
                proposal.state = ProposalState.Passed;
                emit ProposalStateChange(proposalId, uint256(ProposalState.Passed));
            }
            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Get the information of a proposal by id
     * @param proposalId The ID of the proposal
     * @return proposal The proposal for given `proposalId`
     */
    function getProposal(bytes32 proposalId) external view returns (Proposal memory proposal) {
        return proposals[proposalId];
    }

    /**
     * @dev Get the information of a proposal by index
     * @param proposalIndex The index of the proposal in the proposals list
     * @return proposal The proposal located at given `proposalIndex`
     */
    function getProposalByIndex(uint256 proposalIndex) external view returns (Proposal memory proposal) {
        return proposals[proposalsList[proposalIndex]];
    }

    /**
     * @dev Get call data signature
     * @param data The bytes data of the data to get the signature
     * @return functionSignature The signature for given data hash
     */
    function getFuncSignature(bytes calldata data) public pure returns (bytes4 functionSignature) {
        if (data.length >= 4) {
            return bytes4(data[:4]);
        } else {
            return bytes4(0);
        }
    }

    /**
     * @dev Get the proposals length
     * @return proposalsLength The amount of proposals
     */
    function getOrganizationProposalsLength() external view returns (uint256 proposalsLength) {
        return proposalsList.length;
    }

    /**
     * @dev Get the proposals ids
     * @return proposalsIds List containing all proposals ids
     */
    function getOrganizationProposals() external view returns (bytes32[] memory proposalsIds) {
        return proposalsList;
    }

    /**
     * @dev Get the scheme type
     */
    function getSchemeType() external view virtual returns (string memory) {}
}
