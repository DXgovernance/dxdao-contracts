// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/Address.sol";
import "./Scheme.sol";

/**
 * @title AvatarScheme.
 * @dev An implementation of Scheme where the scheme has only 2 options and execute calls from the avatar.
 * Option 1 will mark the proposal as rejected and not execute any calls.
 * Option 2 will execute all the calls that where submitted in the proposeCalls.
 */
contract AvatarScheme is Scheme {
    using Address for address;

    /// @notice Emitted when the proposal is already being executed
    error AvatarScheme__ProposalExecutionAlreadyRunning();

    /// @notice Emitted when the proposal wasn't submitted
    error AvatarScheme__ProposalMustBeSubmitted();

    /// @notice Emitted when the call to setETHPermissionUsed fails
    error AvatarScheme__SetEthPermissionUsedFailed();

    /// @notice Emitted when the avatarCall failed. Returns the revert error
    error AvatarScheme__AvatarCallFailed(string reason);

    /// @notice Emitted when exceeded the maximum rep supply % change
    error AvatarScheme__MaxRepPercentageChangePassed();

    /// @notice Emitted when ERC20 limits passed
    error AvatarScheme__ERC20LimitsPassed();

    /// @notice Emitted if the number of totalOptions is not 2
    error AvatarScheme__TotalOptionsMustBeTwo();

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
            revert AvatarScheme__TotalOptionsMustBeTwo();
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
        // We use isExecutingProposal variable to avoid re-entrancy in proposal execution
        if (executingProposal) {
            revert AvatarScheme__ProposalExecutionAlreadyRunning();
        }
        executingProposal = true;

        Proposal storage proposal = proposals[_proposalId];
        if (proposal.state != ProposalState.Submitted) {
            revert AvatarScheme__ProposalMustBeSubmitted();
        }

        if (_winningOption > 1) {
            uint256 oldRepSupply = getNativeReputationTotalSupply();

            controller.avatarCall(
                address(permissionRegistry),
                abi.encodeWithSignature("setERC20Balances()"),
                avatar,
                0
            );

            uint256 callIndex = 0;

            for (callIndex; callIndex < proposal.to.length; callIndex++) {
                bytes memory _data = proposal.callData[callIndex];
                bytes4 callDataFuncSignature;
                assembly {
                    callDataFuncSignature := mload(add(_data, 32))
                }

                bool callsSucessResult = false;
                bytes memory returnData;

                // The only three calls that can be done directly to the controller is mintReputation, burnReputation and avatarCall
                if (
                    proposal.to[callIndex] == address(controller) &&
                    (callDataFuncSignature == bytes4(keccak256("mintReputation(uint256,address)")) ||
                        callDataFuncSignature == bytes4(keccak256("burnReputation(uint256,address)")))
                ) {
                    (callsSucessResult, returnData) = address(controller).call(proposal.callData[callIndex]);
                } else {
                    // The permission registry keeps track of all value transferred and checks call permission
                    (callsSucessResult, returnData) = controller.avatarCall(
                        address(permissionRegistry),
                        abi.encodeWithSignature(
                            "setETHPermissionUsed(address,address,bytes4,uint256)",
                            avatar,
                            proposal.to[callIndex],
                            callDataFuncSignature,
                            proposal.value[callIndex]
                        ),
                        avatar,
                        0
                    );
                    if (!callsSucessResult) {
                        revert AvatarScheme__SetEthPermissionUsedFailed();
                    }
                    (callsSucessResult, returnData) = controller.avatarCall(
                        proposal.to[callIndex],
                        proposal.callData[callIndex],
                        avatar,
                        proposal.value[callIndex]
                    );
                }

                if (!callsSucessResult) {
                    revert AvatarScheme__AvatarCallFailed({reason: string(returnData)});
                }
            }

            // Cant mint or burn more REP than the allowed percentaged set in the wallet scheme initialization

            if (
                ((oldRepSupply * (uint256(100) + maxRepPercentageChange)) / 100 < getNativeReputationTotalSupply()) ||
                ((oldRepSupply * (uint256(100) - maxRepPercentageChange)) / 100 > getNativeReputationTotalSupply())
            ) {
                revert AvatarScheme__MaxRepPercentageChangePassed();
            }

            if (!permissionRegistry.checkERC20Limits(address(avatar))) {
                revert AvatarScheme__ERC20LimitsPassed();
            }
        }
        controller.endProposal(_proposalId);
        executingProposal = false;
        return true;
    }

    /**
     * @dev Get the scheme type
     */
    function getSchemeType() external view override returns (string memory) {
        return "AvatarScheme_v1";
    }
}
