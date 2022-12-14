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
        if (_totalOptions != 2) {
            revert WalletScheme__TotalOptionsMustBeTwo();
        }

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
        if (controller.getSchemeCanMakeAvatarCalls(address(this))) {
            revert WalletScheme__CannotMakeAvatarCalls();
        }

        return super.executeProposal(_proposalId, _winningOption);
    }

    /**
     * @dev Get the scheme type
     */
    function getSchemeType() external pure override returns (string memory) {
        return "WalletScheme_v1";
    }
}
