// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/Address.sol";
import "./Scheme.sol";

/**
 * @title WalletScheme.
 * @dev An implementation of Scheme where the scheme has only 2 options and execute calls form the scheme itself.
 * Option 1 will mark the proposal as rejected and not execute any calls.
 * Option 2 will execute all the calls that where submitted in the proposeCalls.
 */
contract WalletScheme is Scheme {
    using Address for address;

    /// @notice Emitted when setMaxSecondsForExecution NOT called from the scheme
    error WalletScheme__SetMaxSecondsForExecutionNotCalledFromScheme();

    /// @notice Emitted when trying to set maxSecondsForExecution to a value lower than 86400
    error WalletScheme__MaxSecondsForExecutionTooLow();

    /// @notice Emitted when trying to execute an already running proposal
    error WalletScheme__ProposalExecutionAlreadyRunning();

    /// @notice Emitted when the proposal is not a submitted proposal
    error WalletScheme__ProposalMustBeSubmitted();

    /// @notice Emitted when making a call failed
    error WalletScheme__CallFailed(string reason);

    /// @notice Emitted when exceeded the maximum rep supply % change
    error WalletScheme__MaxRepPercentageChangePassed();

    /// @notice Emitted when ERC20 limits are passed
    error WalletScheme__ERC20LimitsPassed();

    /**
     * @dev Receive function that allows the wallet to receive ETH when the controller address is not set
     */
    receive() external payable {}

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
    ) public override returns (bytes32 proposalId) {
        require(_totalOptions == 2, "WalletScheme: The total amount of options should be 2");
        return super.proposeCalls(_to, _callData, _value, _totalOptions, _title, _descriptionHash);
    }

    /**
     * @dev execution of proposals, can only be called by the voting machine in which the vote is held.
     * @param _proposalId the ID of the voting in the voting machine
     * @param _winningOption The winning option in the voting machine
     * @return bool success
     */
    function executeProposal(bytes32 _proposalId, uint256 _winningOption)
        public
        override
        onlyVotingMachine
        returns (bool)
    {
        require(
            !controller.getSchemeCanMakeAvatarCalls(address(this)),
            "WalletScheme: scheme cannot make avatar calls"
        );
        return super.executeProposal(_proposalId, _winningOption);
    }

    /**
     * @dev Get the scheme type
     */
    function getSchemeType() external view override returns (string memory) {
        return "WalletScheme_v1";
    }
}
