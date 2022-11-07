// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./Scheme.sol";

/**
 * @title AvatarScheme.
 * @dev An implementation of Scheme where the scheme has only 2 options and execute calls from the avatar.
 * Option 1 will execute all the calls that where submitted in the proposeCalls.
 * Option 2 will mark the proposal as rejected and not execute any calls.
 */
contract AvatarScheme is Scheme {
    using SafeMath for uint256;
    using Address for address;

    /**
     * @dev Set the max amount of seconds that a proposal has to be executed
     * only callable from the avatar address
     * @param _maxSecondsForExecution New max proposal time in seconds to be used
     */
    function setMaxSecondsForExecution(uint256 _maxSecondsForExecution) external override {
        require(
            msg.sender == address(avatar),
            "WalletScheme: setMaxSecondsForExecution is callable only from the avatar"
        );

        require(
            _maxSecondsForExecution >= 86400,
            "WalletScheme: _maxSecondsForExecution cant be less than 86400 seconds"
        );
        maxSecondsForExecution = _maxSecondsForExecution;
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
    ) public override returns (bytes32 proposalId) {
        // Check the proposal calls
        for (uint256 i = 0; i < _to.length; i++) {
            bytes4 callDataFuncSignature = getFuncSignature(_callData[i]);

            // This will fail only when and ERC20 transfer or approve with ETH value is proposed
            require(
                (callDataFuncSignature != bytes4(keccak256("transfer(address,uint256)")) &&
                    callDataFuncSignature != bytes4(keccak256("approve(address,uint256)"))) || _value[i] == 0,
                "AvatarScheme: cant propose ERC20 transfers with value"
            );
        }
        require(_to.length == _callData.length, "AvatarScheme: invalid _callData length");
        require(_to.length == _value.length, "AvatarScheme: invalid _value length");

        require(_totalOptions == 2, "AvatarScheme: The total amount of options should be 2");

        bytes32 voteParams = controller.getSchemeParameters(address(this));

        // Get the proposal id that will be used from the voting machine
        // bytes32 proposalId = votingMachine.propose(_totalOptions, voteParams, msg.sender, address(avatar));
        proposalId = abi.decode(
            votingMachine.functionCall(
                abi.encodeWithSignature(
                    "propose(uint256,bytes32,address,address)",
                    _totalOptions,
                    voteParams,
                    msg.sender,
                    avatar
                ),
                "AvatarScheme: DXDVotingMachine callback propose error"
            ),
            (bytes32)
        );

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
        external
        override
        onlyVotingMachine
        returns (bool)
    {
        // We use isExecutingProposal variable to avoid re-entrancy in proposal execution
        require(!executingProposal, "AvatarScheme: proposal execution already running");
        executingProposal = true;

        Proposal storage proposal = proposals[_proposalId];
        require(proposal.state == ProposalState.Submitted, "AvatarScheme: must be a submitted proposal");

        if (proposal.submittedTime.add(maxSecondsForExecution) < block.timestamp) {
            // If the amount of time passed since submission plus max proposal time is lower than block timestamp
            // the proposal timeout execution is reached and proposal cant be executed from now on

            proposal.state = ProposalState.ExecutionTimeout;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.ExecutionTimeout));
        } else if (_winningOption == 2) {
            proposal.state = ProposalState.Rejected;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.Rejected));
        } else {
            uint256 oldRepSupply = getNativeReputationTotalSupply();
            proposal.state = ProposalState.ExecutionSucceeded;
            emit ProposalStateChange(_proposalId, uint256(ProposalState.ExecutionSucceeded));

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
                require(callsSucessResult, string(returnData));

                (callsSucessResult, returnData) = controller.avatarCall(
                    proposal.to[callIndex],
                    proposal.callData[callIndex],
                    avatar,
                    proposal.value[callIndex]
                );
                require(callsSucessResult, string(returnData));

                proposal.state = ProposalState.ExecutionSucceeded;
            }
            // Cant mint or burn more REP than the allowed percentaged set in the wallet scheme initialization
            require(
                (oldRepSupply.mul(uint256(100).add(maxRepPercentageChange)).div(100) >=
                    getNativeReputationTotalSupply()) &&
                    (oldRepSupply.mul(uint256(100).sub(maxRepPercentageChange)).div(100) <=
                        getNativeReputationTotalSupply()),
                "AvatarScheme: maxRepPercentageChange passed"
            );
            require(permissionRegistry.checkERC20Limits(address(avatar)), "AvatarScheme: ERC20 limits passed");
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
