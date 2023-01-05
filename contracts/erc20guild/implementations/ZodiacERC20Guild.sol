// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@gnosis.pm/zodiac/contracts/interfaces/IAvatar.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol";
import "../ERC20GuildUpgradeable.sol";
import "./../../utils/IPermissionRegistry.sol";

/*
  @title ZodiacERC20Guild
  @author github:fnanni-0
  @dev This guild acts as a Zodiac Module. Proposal's transactions are relayed to a Gnosis Safe,
    never executed from this contract itself. If the owners of the Gnosis Safe are removed and
    this module is enabled, then the Safe becomes the ERC20 Guild's Safe.
*/
contract ZodiacERC20Guild is BaseERC20Guild {
    struct InitializationParams {
        address token;
        uint256 proposalTime;
        uint256 timeForExecution;
        uint256 votingPowerPercentageForProposalExecution;
        uint256 votingPowerPercentageForProposalCreation;
        string name;
        uint256 voteGas;
        uint256 maxGasPrice;
        uint256 maxActiveProposals;
        uint256 lockTime;
        uint256 minimumMembersForProposalCreation;
        uint256 minimumTokensLockedForProposalCreation;
        address permissionRegistry;
        address avatar;
        address multisend;
    }

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

    constructor(bytes memory initializeParams) {
        setUp(initializeParams);
    }

    /// @dev Initializer
    /// @param initializeParams The ERC20 token that will be used as source of voting power
    function setUp(bytes memory initializeParams) public {
        require(!initialized, "Already initialized");
        InitializationParams memory initParams = abi.decode(initializeParams, (InitializationParams));

        require(
            initParams.lockTime >= initParams.proposalTime,
            "ERC20Guild: lockTime has to be higher or equal to proposalTime"
        );
        name = initParams.name;
        token = IERC20Upgradeable(initParams.token);
        tokenVault = new TokenVault(address(token), address(this));
        permissionRegistry = PermissionRegistry(initParams.permissionRegistry);

        proposalTime = initParams.proposalTime;
        timeForExecution = initParams.timeForExecution;
        votingPowerPercentageForProposalExecution = initParams.votingPowerPercentageForProposalExecution;
        votingPowerPercentageForProposalCreation = initParams.votingPowerPercentageForProposalCreation;
        voteGas = initParams.voteGas;
        maxGasPrice = initParams.maxGasPrice;
        maxActiveProposals = initParams.maxActiveProposals;
        lockTime = initParams.lockTime;
        minimumMembersForProposalCreation = initParams.minimumMembersForProposalCreation;
        minimumTokensLockedForProposalCreation = initParams.minimumTokensLockedForProposalCreation;

        avatar = initParams.avatar;
        multisend = initParams.multisend;

        initialized = true;
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

            bytes memory data = getCheckERC20LimitsCalldata();
            uint256 totalValue = 0;
            (uint256 i, uint256 endCall) = getProposalCallsRange(proposalId, winningOption);

            for (i; i < endCall; i++) {
                if (proposals[proposalId].to[i] != address(0) && proposals[proposalId].data[i].length > 0) {
                    Proposal storage proposal = proposals[proposalId];
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
                    totalValue += proposals[proposalId].value[i];
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

    function getWinningOption(bytes32 proposalId) internal view returns (uint256 winningOption) {
        uint256 highestVoteAmount = proposals[proposalId].totalVotes[0];
        uint256 votingPowerForProposalExecution = getVotingPowerForProposalExecution();
        uint256 totalOptions = proposals[proposalId].totalVotes.length;
        for (uint256 i = 1; i < totalOptions; i++) {
            uint256 totalVotesOptionI = proposals[proposalId].totalVotes[i];
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
            mstore(0, _data.slot)
            callDataFuncSignature := sload(keccak256(0, 32))
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
            bytes4(callDataFuncSignature),
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
