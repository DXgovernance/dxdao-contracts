// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@gnosis.pm/zodiac/contracts/interfaces/IAvatar.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol";
import "../ERC20GuildUpgradeable.sol";

interface IPermissionRegistry {
    function setERC20Balances() external;

    function checkERC20Limits(address) external;

    function setETHPermissionUsed(
        address,
        address,
        bytes4,
        uint256
    ) external;
}

/*
  @title ERC20GuildWithERC1271
  @author github:AugustoL
  @dev The guild can sign EIP1271 messages, to do this the guild needs to call itself and allow 
    the signature to be verified with and extra signature of any account with voting power.
*/
contract ZodiacERC20Guild is ERC20GuildUpgradeable {
    bytes constant SET_ERC20_BALANCES_DATA = abi.encodeWithSelector(IPermissionRegistry.setERC20Balances.selector);
    /// @dev Address that this module will pass transactions to.
    address public avatar;
    /// @dev Address of the multisend contract that the avatar contract should use to bundle transactions.
    address public multisend;

    /// @dev Set the ERC20Guild configuration, can be called only executing a proposal or when it is initialized
    /// @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    /// @param _timeForExecution The amount of time in seconds that a proposal option will have to execute successfully
    // solhint-disable-next-line max-line-length
    /// @param _votingPowerPercentageForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal option
    // solhint-disable-next-line max-line-length
    /// @param _votingPowerPercentageForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    /// @param _voteGas The amount of gas in wei unit used for vote refunds.
    // Can't be higher than the gas used by setVote (117000)
    /// @param _maxGasPrice The maximum gas price used for vote refunds
    /// @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    function setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerPercentageForProposalExecution,
        uint256 _votingPowerPercentageForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        uint256 _lockTime,
        uint256 _minimumMembersForProposalCreation,
        uint256 _minimumTokensLockedForProposalCreation
    ) external override {
        require(
            msg.sender == address(this) || (msg.sender == avatar && isExecutingProposal),
            "ERC20Guild: Only callable by ERC20guild itself or when initialized"
        );
        require(_proposalTime > 0, "ERC20Guild: proposal time has to be more than 0");
        require(_lockTime >= _proposalTime, "ERC20Guild: lockTime has to be higher or equal to proposalTime");
        require(
            _votingPowerPercentageForProposalExecution > 0,
            "ERC20Guild: voting power for execution has to be more than 0"
        );
        require(_voteGas <= 117000, "ERC20Guild: vote gas has to be equal or lower than 117000");
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerPercentageForProposalExecution = _votingPowerPercentageForProposalExecution;
        votingPowerPercentageForProposalCreation = _votingPowerPercentageForProposalCreation;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
        lockTime = _lockTime;
        minimumMembersForProposalCreation = _minimumMembersForProposalCreation;
        minimumTokensLockedForProposalCreation = _minimumTokensLockedForProposalCreation;
    }

    /// @dev Set the ERC20Guild module configuration, can be called only executing a proposal or when it is initialized.
    /// @param _avatar Address that this module will pass transactions to.
    /// @param _multisend Address of the multisend contract that the avatar contract should use to bundle transactions.
    function setAvatar(address _avatar, address _multisend) external virtual {
        require(
            msg.sender == address(this) || (msg.sender == avatar && isExecutingProposal),
            "ERC20Guild: Only callable by ERC20guild itself or when initialized"
        );
        avatar = _avatar;
        multisend = _multisend;
    }

    /// @dev Executes a proposal that is not votable anymore and can be finished
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public override {
        require(!isExecutingProposal, "ERC20Guild: Proposal under execution");
        require(proposals[proposalId].state == ProposalState.Active, "ERC20Guild: Proposal already executed");
        require(proposals[proposalId].endTime < block.timestamp, "ERC20Guild: Proposal hasn't ended yet");

        uint256 winningOption = getWinningOption(proposalId);

        if (winningOption == 0) {
            proposals[proposalId].state = ProposalState.Rejected;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Rejected));
        } else if (proposals[proposalId].endTime + timeForExecution < block.timestamp) {
            proposals[proposalId].state = ProposalState.Failed;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Failed));
        } else {
            proposals[proposalId].state = ProposalState.Executed;

            // All calls are batched and sent together to the avatar, which will execute all of them through the multisend contract.
            bytes memory data = abi.encodePacked( /// permissionRegistry.setERC20Balances()
                uint8(Enum.Operation.Call),
                permissionRegistry, /// to as an address.
                uint256(0), /// value as an uint256.
                uint256(SET_ERC20_BALANCES_DATA.length),
                SET_ERC20_BALANCES_DATA /// data as bytes.
            );
            uint256 totalValue = 0;
            (uint256 i, uint256 endCall) = getProposalCallsRange(proposalId, winningOption);

            for (i; i < endCall; i++) {
                if (proposals[proposalId].to[i] != address(0) && proposals[proposalId].data[i].length > 0) {
                    bytes4 callDataFuncSignature = getFunctionSignature(proposals[proposalId].data[i]);

                    // The permission registry keeps track of all value transferred and checks call permission
                    bytes memory setETHPermissionUsedData = abi.encodeWithSelector(
                        IPermissionRegistry.setETHPermissionUsed.selector,
                        avatar,
                        proposals[proposalId].to[i],
                        bytes4(callDataFuncSignature),
                        proposals[proposalId].value[i]
                    );
                    data = abi.encodePacked(
                        data,
                        abi.encodePacked( /// permissionRegistry.setETHPermissionUsed(avatar, to, funcSignature, value)
                            uint8(Enum.Operation.Call),
                            permissionRegistry, /// to as an address.
                            uint256(0), /// value as an uint256.
                            uint256(setETHPermissionUsedData.length),
                            setETHPermissionUsedData /// data as bytes.
                        ),
                        abi.encodePacked(
                            uint8(Enum.Operation.Call),
                            proposals[proposalId].to[i], /// to as an address.
                            proposals[proposalId].value[i], /// value as an uint256.
                            uint256(proposals[proposalId].data[i].length),
                            proposals[proposalId].data[i] /// data as bytes.
                        )
                    );
                    totalValue += proposals[proposalId].value[i];
                }
            }

            bytes memory checkERC20LimitsData = abi.encodeWithSelector(
                IPermissionRegistry.checkERC20Limits.selector,
                avatar
            );
            data = abi.encodePacked(
                data,
                abi.encodePacked( /// permissionRegistry.checkERC20Limits(avatar)
                    uint8(Enum.Operation.Call),
                    permissionRegistry, /// to as an address.
                    uint256(0), /// value as an uint256.
                    uint256(checkERC20LimitsData.length),
                    checkERC20LimitsData /// data as bytes.
                )
            );

            data = abi.encodeWithSignature("multiSend(bytes)", data);
            isExecutingProposal = true;
            bool success = IAvatar(avatar).execTransactionFromModule(
                multisend,
                totalValue,
                data,
                Enum.Operation.DelegateCall
            );
            require(success, "ERC20Guild: Proposal call failed");
            isExecutingProposal = false;

            emit ProposalStateChanged(proposalId, uint256(ProposalState.Executed));
        }
        activeProposalsNow = activeProposalsNow - 1;
    }

    function getWinningOption(bytes32 proposalId) internal view returns (uint256 winningOption) {
        uint256 highestVoteAmount = proposals[proposalId].totalVotes[0];
        uint256 votingPowerForProposalExecution = getVotingPowerForProposalExecution();
        uint256 totalOptions = proposals[proposalId].totalVotes.length;
        for (uint256 i = 1; i < totalOptions; i++) {
            uint256 totalVotesOptionI = proposals[proposalId].totalVotes[i];
            if (
                totalVotesOptionI >= votingPowerForProposalExecution &&
                totalVotesOptionI >= highestVoteAmount
            ) {
                if (totalVotesOptionI == highestVoteAmount) {
                    winningOption = 0;
                } else {
                    winningOption = i;
                    highestVoteAmount = totalVotesOptionI;
                }
            }
        }
    }

    function getProposalCallsRange(bytes32 proposalId, uint256 winningOption)
        internal
        view
        returns (uint256 startCall, uint256 endCall)
    {
        uint256 callsPerOption = proposals[proposalId].to.length / (proposals[proposalId].totalVotes.length - 1);
        startCall = callsPerOption * (winningOption - 1);
        endCall = startCall + callsPerOption;
    }

    function getFunctionSignature(bytes storage _data) internal view returns (bytes4 callDataFuncSignature) {
        assembly {
            mstore (0, _data.slot)
            callDataFuncSignature := sload(keccak256(0, 32))
        }
    }
}
