// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@gnosis.pm/zodiac/contracts/interfaces/IAvatar.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "./../ERC20GuildUpgradeable.sol";
import "./../../utils/IPermissionRegistry.sol";

/*
  @title ZodiacERC20Guild
  @author github:fnanni-0
  @dev This guild acts as a Zodiac Module. Proposal's transactions are relayed to a Gnosis Safe,
    never executed from this contract itself. If the owners of the Gnosis Safe are removed and
    this module is enabled, then the Safe becomes the ERC20 Guild's Safe.
*/
contract ZodiacERC20Guild is ERC20GuildUpgradeable {
    bytes private constant SET_ERC20_BALANCES_DATA =
        abi.encodeWithSelector(IPermissionRegistry.setERC20Balances.selector);
    /// @dev Address that this module will pass transactions to.
    address public avatar;
    /// @dev Address of the multisend contract that the avatar contract should use to bundle transactions.
    address public multisend;
    /// @dev Indicates that the contract has been initialized.
    bool public initialized;

    /// @dev Emitted each time the avatar is set.
    event AvatarSet(address indexed previousAvatar, address indexed newAvatar);
    /// @dev Emitted each time the avatar is set.
    event MultisendSet(address indexed previousMultisend, address indexed newMultisend);

    constructor() {}

    /// @dev Initializer
    /// @param _token The ERC20 token that will be used as source of voting power
    /// @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    /// @param _timeForExecution The amount of time in seconds that a proposal option will have to execute successfully
    // solhint-disable-next-line max-line-length
    /// @param _votingPowerPercentageForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal action
    // solhint-disable-next-line max-line-length
    /// @param _votingPowerPercentageForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    /// @param _name The name of the ERC20Guild
    /// @param _voteGas The amount of gas in wei unit used for vote refunds
    /// @param _maxGasPrice The maximum gas price used for vote refunds
    /// @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    /// @param _permissionRegistry The address of the permission registry contract to be used
    /// @param _avatar Address that this module will pass transactions to.
    /// @param _multisend Address of the multisend contract that the avatar contract should use to bundle transactions.
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerPercentageForProposalExecution,
        uint256 _votingPowerPercentageForProposalCreation,
        string memory _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        uint256 _lockTime,
        address _permissionRegistry,
        address _avatar,
        address _multisend
    ) public virtual {
        initialize(
            _token,
            _proposalTime,
            _timeForExecution,
            _votingPowerPercentageForProposalExecution,
            _votingPowerPercentageForProposalCreation,
            _name,
            _voteGas,
            _maxGasPrice,
            _maxActiveProposals,
            _lockTime,
            _permissionRegistry
        );
        avatar = _avatar;
        multisend = _multisend;
    }

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
        require(msg.sender == avatar && isExecutingProposal, "ERC20Guild: Only callable from proposal");
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

    /// @dev Set the ERC20Guild module configuration, can be called only executing a proposal.
    /// @param _avatar Address that this module will pass transactions to.
    function setAvatar(address _avatar) external {
        require(msg.sender == avatar && isExecutingProposal, "ERC20Guild: Only callable from proposal");
        address previousAvatar = avatar;
        avatar = _avatar;
        emit AvatarSet(previousAvatar, _avatar);
    }

    /// @dev Set the ERC20Guild module configuration, can be called only executing a proposal.
    /// @param _multisend Address of the multisend contract that the avatar contract should use to bundle transactions.
    function setMultisend(address _multisend) external {
        require(msg.sender == avatar && isExecutingProposal, "ERC20Guild: Only callable from proposal");
        address previousMultisend = multisend;
        multisend = _multisend;
        emit MultisendSet(previousMultisend, _multisend);
    }

    /// @dev Guilds can refund gas expenses to voters, which means that this contract is expected to hold ETH.
    /// This contract cannot execute transactions from itself, so a function has to be provided
    /// so that the ETH balance can be recovered.
    /// @param _to Address that will receive that ETH.
    /// @param _amount ETH amount that will be sent.
    function transferETH(address _to, uint256 _amount) external {
        require(msg.sender == avatar && isExecutingProposal, "ERC20Guild: Only callable from proposal");
        (bool success, ) = payable(_to).call{value: _amount}("");
        require(success, "Failed to transfer ETH");
    }

    /// @dev Executes a proposal that is not votable anymore and can be finished
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public override {
        Proposal storage proposal = proposals[proposalId];
        require(!isExecutingProposal, "ERC20Guild: Proposal under execution");
        require(proposal.state == ProposalState.Active, "ERC20Guild: Proposal already executed");
        require(proposal.endTime < block.timestamp, "ERC20Guild: Proposal hasn't ended yet");

        uint256 winningOption = getWinningOption(proposal);

        if (winningOption == 0) {
            proposal.state = ProposalState.Rejected;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Rejected));
        } else if (proposal.endTime + timeForExecution < block.timestamp) {
            proposal.state = ProposalState.Failed;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Failed));
        } else {
            proposal.state = ProposalState.Executed;

            bytes memory data = getSetERC20BalancesCalldata();
            uint256 totalValue = 0;
            (uint256 i, uint256 endCall) = getProposalCallsRange(proposal, winningOption);

            for (; i < endCall; i++) {
                if (proposal.to[i] != address(0) && proposal.data[i].length > 0) {
                    data = abi.encodePacked(
                        data,
                        getSetETHPermissionUsedCalldata(proposal, i),
                        abi.encodePacked(
                            uint8(Enum.Operation.Call),
                            proposal.to[i], /// to as an address.
                            proposal.value[i], /// value as an uint256.
                            uint256(proposal.data[i].length),
                            proposal.data[i] /// data as bytes.
                        )
                    );
                    totalValue += proposal.value[i];
                }
            }

            data = abi.encodePacked(data, getCheckERC20LimitsCalldata());

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

    function getWinningOption(Proposal storage _proposal) internal view returns (uint256 winningOption) {
        uint256 highestVoteAmount = _proposal.totalVotes[0];
        uint256 votingPowerForProposalExecution = getVotingPowerForProposalExecution();
        uint256 totalOptions = _proposal.totalVotes.length;
        for (uint256 i = 1; i < totalOptions; i++) {
            uint256 totalVotesOptionI = _proposal.totalVotes[i];
            if (totalVotesOptionI >= votingPowerForProposalExecution && totalVotesOptionI >= highestVoteAmount) {
                if (totalVotesOptionI == highestVoteAmount) {
                    winningOption = 0;
                } else {
                    winningOption = i;
                    highestVoteAmount = totalVotesOptionI;
                }
            }
        }
    }

    function getProposalCallsRange(Proposal storage _proposal, uint256 _winningOption)
        internal
        view
        returns (uint256 startCall, uint256 endCall)
    {
        uint256 callsPerOption = _proposal.to.length / (_proposal.totalVotes.length - 1);
        startCall = callsPerOption * (_winningOption - 1);
        endCall = startCall + callsPerOption;
    }

    function getFunctionSignature(bytes storage _data) internal view returns (bytes4 callDataFuncSignature) {
        uint8 lengthBit;
        assembly {
            lengthBit := sload(_data.slot)
            lengthBit := and(lengthBit, 0x01)
            switch lengthBit
            case 0 {
                // Short bytes array. Data is stored together with length at slot.
                callDataFuncSignature := sload(_data.slot)
            }
            case 1 {
                //  Long bytes array. Data is stored at keccak256(slot).
                mstore(0, _data.slot)
                callDataFuncSignature := sload(keccak256(0, 32))
            }
        }
    }

    /// @dev Encodes permissionRegistry.checkERC20Limits(avatar)
    function getCheckERC20LimitsCalldata() internal view returns (bytes memory) {
        bytes memory checkERC20LimitsData = abi.encodeWithSelector(
            IPermissionRegistry.checkERC20Limits.selector,
            avatar
        );
        return
            abi.encodePacked(
                uint8(Enum.Operation.Call),
                permissionRegistry, /// to as an address.
                uint256(0), /// value as an uint256.
                uint256(checkERC20LimitsData.length),
                checkERC20LimitsData /// data as bytes.
            );
    }

    /// @dev Encodes permissionRegistry.setERC20Balances()
    function getSetERC20BalancesCalldata() internal view returns (bytes memory) {
        return
            abi.encodePacked(
                uint8(Enum.Operation.Call),
                permissionRegistry, /// to as an address.
                uint256(0), /// value as an uint256.
                uint256(SET_ERC20_BALANCES_DATA.length),
                SET_ERC20_BALANCES_DATA /// data as bytes.
            );
    }

    /// @dev Encodes permissionRegistry.setETHPermissionUsed(avatar, to, funcSignature, value)
    /// @param _proposal Proposal data.
    /// @param _index Call index.
    function getSetETHPermissionUsedCalldata(Proposal storage _proposal, uint256 _index)
        internal
        view
        returns (bytes memory)
    {
        address to = _proposal.to[_index];
        uint256 value = _proposal.value[_index];
        bytes4 callDataFuncSignature = getFunctionSignature(_proposal.data[_index]);

        // The permission registry keeps track of all value transferred and checks call permission
        bytes memory setETHPermissionUsedData = abi.encodeWithSelector(
            IPermissionRegistry.setETHPermissionUsed.selector,
            avatar,
            to,
            callDataFuncSignature,
            value
        );

        return
            abi.encodePacked(
                uint8(Enum.Operation.Call),
                permissionRegistry, /// to as an address.
                uint256(0), /// value as an uint256.
                uint256(setETHPermissionUsedData.length),
                setETHPermissionUsedData /// data as bytes.
            );
    }

    /// @dev For compatibility with
    /// https://github.com/gnosis/zodiac/blob/40c41372744fb1dc2f90311f1b67796ac25e57ad/contracts/core/Module.sol
    function target() external view returns (address) {
        return avatar;
    }
}
