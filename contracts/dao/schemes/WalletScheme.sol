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

    /// @notice Emitted if the number of totalOptions is not 2
    error WalletScheme__TotalOptionsMustBeTwo();

    /// @notice Emitted if the WalletScheme can make avatar calls
    error WalletScheme__CannotMakeAvatarCalls();

    /**
     * @dev Receive function that allows the wallet to receive ETH when the controller address is not set
     */
    receive() external payable {}

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
    ) public override returns (bytes32 proposalId) {
        if (totalOptions != 2) {
            revert WalletScheme__TotalOptionsMustBeTwo();
        }

        return super.proposeCalls(to, callData, value, totalOptions, title, descriptionHash);
    }

    /**
     * @dev execution of proposals, can only be called by the voting machine in which the vote is held.
     * @param proposalId The ID of the proposal in the voting machine
     * @param winningOption The winning option in the voting machine
     * @return success Execution success
     */
    function executeProposal(
        bytes32 proposalId,
        uint256 winningOption
    ) public override onlyVotingMachine returns (bool success) {
        if (controller.getSchemeCanMakeAvatarCalls(address(this))) {
            revert WalletScheme__CannotMakeAvatarCalls();
        }

        return super.executeProposal(proposalId, winningOption);
    }

    /**
     * @dev Get the scheme type
     */
    function getSchemeType() external pure override returns (string memory) {
        return "WalletScheme_v1";
    }
}
