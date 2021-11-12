// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol";
import "../utils/GlobalPermissionRegistry.sol";

/*
  @title ERC20Guild
  @author github:AugustoL
  @dev Extends an ERC20 functionality into a Guild, adding a simple governance system over an ERC20 token.
  An ERC20Guild is a simple organization that execute arbitrary calls if a minimum amount of votes is reached in a 
  proposal action while the proposal is active.
  Each proposal has actions, the voter can vote only once per proposal and cant change the chosen action, only
  increase the voting power of his vote.
  A proposal ends when the minimum amount of total voting power is reached on a proposal action before the proposal
  finish.
  When a proposal ends successfully it executes the calls of the winning action.
  The winning action has a certain amount of time to be executed successfully if that time passes and the action didn't
  executed successfully, it is marked as failed.
  The guild can execute only allowed functions, if a function is not allowed it will need to set the allowance for it.
  The allowed functions have a timestamp that marks from what time the function can be executed.
  A limit to a maximum amount of active proposals can be set, an active proposal is a proposal that is in Submitted state.
  Gas can be refunded to the account executing the vote, for this to happen the voteGas and maxGasPrice values need to be
  set.
  Signed votes can be executed in behalf of other users, to sign a vote the voter needs to hash it with the function
  hashVote, after signing the hash teh voter can share it to other account to be executed.
  Multiple votes and signed votes can be executed in one transaction.
  The guild can sign EIP1271 messages, to do this the guild needs to call itself and allow the signature to be verified 
  with and extra signature of any account with voting power.
*/
contract ERC20Guild is Initializable, IERC1271Upgradeable {
    using SafeMathUpgradeable for uint256;
    using MathUpgradeable for uint256;
    using ECDSAUpgradeable for bytes32;

    enum ProposalState {
        None,
        Submitted,
        Rejected,
        Executed,
        Failed
    }

    // The ERC20 token that will be used as source of voting power
    IERC20Upgradeable public token;

    // If the smart contract is initialized or not
    bool public initialized;

    // The address of the GlobalPermissionRegistry to be used
    GlobalPermissionRegistry public permissionRegistry;

    // The name of the ERC20Guild
    string public name;

    // The amount of time in seconds that a proposal will be active for voting
    uint256 public proposalTime;

    // The amount of time in seconds that a proposal action will have to execute successfully
    uint256 public timeForExecution;

    // The percentage of voting power in base 10000 needed to execute a proposal action
    // 100 == 1% 2500 == 25%
    uint256 public votingPowerForProposalExecution;

    // The percentage of voting power in base 10000 needed to create a proposal
    // 100 == 1% 2500 == 25%
    uint256 public votingPowerForProposalCreation;

    // The amount of gas in wei unit used for vote refunds
    uint256 public voteGas;

    // The maximum gas price used for vote refunds
    uint256 public maxGasPrice;

    // The maximum amount of proposals to be active at the same time
    uint256 public maxActiveProposals;

    // The total amount of proposals created, used as nonce for proposals creation
    uint256 public totalProposals;

    // The amount of active proposals
    uint256 public activeProposalsNow;

    // All the signed votes that were executed, to avoid double signed vote execution.
    mapping(bytes32 => bool) public signedVotes;

    // The EIP1271 hashes that were signed by the ERC20Guild
    // Once a hash is signed by the guild it can be verified with a signature from any voter with balance
    mapping(bytes32 => bool) public EIP1271SignedHashes;

    // Vote and Proposal structs used in the proposals mapping
    struct Vote {
        uint256 action;
        uint256 votingPower;
    }
    struct Proposal {
        address creator;
        uint256 startTime;
        uint256 endTime;
        address[] to;
        bytes[] data;
        uint256[] value;
        string title;
        bytes contentHash;
        ProposalState state;
        uint256[] totalVotes;
        mapping(address => Vote) votes;
    }

    // Mapping of all proposals created indexed by proposal id
    mapping(bytes32 => Proposal) public proposals;

    // Array to keep track of the proposals ids in contract storage
    bytes32[] public proposalsIds;

    event ProposalStateChanged(
        bytes32 indexed proposalId,
        uint256 newState
    );
    event VoteAdded(
        bytes32 indexed proposalId,
        address voter,
        uint256 votingPower
    );
    event SetAllowance(
        address indexed to,
        bytes4 functionSignature,
        bool allowance
    );

    // @dev Allows the voting machine to receive ether to be used to refund voting costs
    fallback() external payable {}

    receive() external payable {}

    // @dev Initialized modifier to require the contract to be initialized
    modifier isInitialized() {
        require(initialized, "ERC20Guild: Not initilized");
        _;
    }

    // @dev Initilizer
    // @param _token The ERC20 token that will be used as source of voting power
    // @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    // @param _timeForExecution The amount of time in seconds that a proposal action will have to execute successfully
    // @param _votingPowerForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal
    // action
    // @param _votingPowerForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    // @param _name The name of the ERC20Guild
    // @param _voteGas The amount of gas in wei unit used for vote refunds
    // @param _maxGasPrice The maximum gas price used for vote refunds
    // @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    // @param _permissionRegistry The address of the permission registry contract to be used
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        string memory _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        address _permissionRegistry
    ) public virtual initializer {
        _initialize(
            _token,
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            _name,
            _voteGas,
            _maxGasPrice,
            _maxActiveProposals,
            _permissionRegistry
        );
        initialized = true;
    }

    // @dev Set the ERC20Guild configuration, can be called only executing a proposal or when it is initilized
    // @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    // @param _timeForExecution The amount of time in seconds that a proposal action will have to execute successfully
    // @param _votingPowerForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal
    // action
    // @param _votingPowerForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    // @param _voteGas The amount of gas in wei unit used for vote refunds
    // @param _maxGasPrice The maximum gas price used for vote refunds
    // @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    // @param _permissionRegistry The address of the permission registry contract to be used
    function setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        address _permissionRegistry
    ) public virtual {
        _setConfig(
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            _voteGas,
            _maxGasPrice,
            _maxActiveProposals,
            _permissionRegistry
        );
    }

    // @dev Set the allowance of a call to be executed by the guild
    // @param to The address to be called
    // @param functionSignature The signature of the function
    // @param valueAllowed The ETH value in wei allowed to be transferred
    // @param allowance If the function is allowed to be called or not
    function setPermission(
        address[] memory to,
        bytes4[] memory functionSignature,
        uint256[] memory valueAllowed,
        bool[] memory allowance
    ) public virtual isInitialized {
        require(
            msg.sender == address(this),
            "ERC20Guild: Only callable by ERC20guild itself"
        );
        require(
            (to.length == functionSignature.length) &&
                (to.length == allowance.length),
            "ERC20Guild: Wrong length of to, functionSignature or allowance arrays"
        );
        for (uint256 i = 0; i < to.length; i++) {
            require(
                functionSignature[i] != bytes4(0),
                "ERC20Guild: Empty signatures not allowed"
            );
            permissionRegistry.setPermission(address(0), to[i], functionSignature[i], valueAllowed[i], allowance[i]);
        }
        require(
            permissionRegistry.getPermissionTime(
                address(0),
                address(this),
                address(this),
                bytes4(keccak256("setConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"))
            ) > 0,
            "ERC20Guild: setConfig function allowance cant be turned off"
        );
        require(
            permissionRegistry.getPermissionTime(
                address(0),
                address(this),
                address(this),
                bytes4(keccak256("setPermission(address[],bytes4[],bool[])"))
            ) > 0,
            "ERC20Guild: setPermission function allowance cant be turned off"
        );
    }

    // @dev Set the permission delay in the permission registry
    // @param allowance If the function is allowed to be called or not
    function setPermissionDelay(
        uint256 permissionDelay
    ) public virtual isInitialized {
        require(
            msg.sender == address(this),
            "ERC20Guild: Only callable by ERC20guild itself"
        );
        permissionRegistry.setPermissionDelay(permissionDelay);
    }

    // @dev Create a proposal with an static call data and extra information
    // @param to The receiver addresses of each call to be executed
    // @param data The data to be executed on each call to be executed
    // @param value The ETH value to be sent on each call to be executed
    // @param totalActions The amount of actions that would be offered to the voters
    // @param title The title of the proposal
    // @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        uint256 totalActions,
        string memory title,
        bytes memory contentHash
    ) public virtual isInitialized returns (bytes32) {
        return _createProposal(to, data, value, totalActions, title, contentHash);
    }

    // @dev Set a hash of an call to be validated using EIP1271
    // @param _hash The EIP1271 hash to be added or removed
    // @param isValid If the hash is valid or not
    function setEIP1271SignedHash(bytes32 _hash, bool isValid) public virtual {
        require(
            msg.sender == address(this),
            "ERC20Guild: Only callable by the guild"
        );
        EIP1271SignedHashes[_hash] = isValid;
    }

    // @dev Executes a proposal that is not votable anymore and can be finished
    // @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public virtual {
        _endProposal(proposalId);
    }

    // @dev Set the voting power to vote in a proposal
    // @param proposalId The id of the proposal to set the vote
    // @param action The proposal action to be voted
    // @param votingPower The votingPower to use in the proposal
    function setVote(
        bytes32 proposalId,
        uint256 action,
        uint256 votingPower
    ) public virtual {
        _setVote(msg.sender, proposalId, action, votingPower);
        _refundVote(payable(msg.sender));
    }

    // @dev Set the voting power to vote in multiple proposals
    // @param proposalIds The ids of the proposals to set the vote
    // @param actions The proposal actions to be voted
    // @param votingPowers The votingPower to use as voting for each proposals
    function setVotes(
        bytes32[] memory proposalIds,
        uint256[] memory actions,
        uint256[] memory votingPowers
    ) public virtual {
        require(
            (proposalIds.length == votingPowers.length) &&
                (proposalIds.length == actions.length),
            "ERC20Guild: Wrong length of proposalIds, actions or votingPowers"
        );
        for (uint256 i = 0; i < proposalIds.length; i++)
            _setVote(msg.sender, proposalIds[i], actions[i], votingPowers[i]);
    }

    // @dev Set the voting power to vote in a proposal using a signed vote
    // @param proposalId The id of the proposal to set the vote
    // @param action The proposal action to be voted
    // @param votingPower The votingPower to use in the proposal
    // @param voter The address of the voter
    // @param signature The signature of the hashed vote
    function setSignedVote(
        bytes32 proposalId,
        uint256 action,
        uint256 votingPower,
        address voter,
        bytes memory signature
    ) public virtual {
        bytes32 hashedVote = hashVote(voter, proposalId, action, votingPower);
        require(!signedVotes[hashedVote], "ERC20Guild: Already voted");
        require(
            voter == hashedVote.toEthSignedMessageHash().recover(signature),
            "ERC20Guild: Wrong signer"
        );
        _setVote(voter, proposalId, action, votingPower);
        signedVotes[hashedVote] = true;
    }

    // @dev Set the voting power to vote in multiple proposals using signed votes
    // @param proposalIds The ids of the proposals to set the votes
    // @param actions The proposal actions to be voted
    // @param votingPowers The votingPower to use as voting for each proposals
    // @param voters The accounts that signed the votes
    // @param signatures The vote signatures
    function setSignedVotes(
        bytes32[] memory proposalIds,
        uint256[] memory actions,
        uint256[] memory votingPowers,
        address[] memory voters,
        bytes[] memory signatures
    ) public virtual {
        for (uint256 i = 0; i < proposalIds.length; i++) {
            setSignedVote(
                proposalIds[i],
                actions[i],
                votingPowers[i],
                voters[i],
                signatures[i]
            );
        }
    }

    // @dev Create a proposal with an static call data and extra information
    // @param to The receiver addresses of each call to be executed
    // @param data The data to be executed on each call to be executed
    // @param value The ETH value to be sent on each call to be executed
    // @param totalActions The amount of actions that would be offered to the voters
    // @param title The title of the proposal
    // @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function _createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        uint256 totalActions,
        string memory title,
        bytes memory contentHash
    ) internal isInitialized returns (bytes32) {
        require(
            votingPowerOf(msg.sender) >= getVotingPowerForProposalCreation(),
            "ERC20Guild: Not enough votes to create proposal"
        );
        require(
            (to.length == data.length) && (to.length == value.length),
            "ERC20Guild: Wrong length of to, data or value arrays"
        );
        require(
            to.length > 0,
            "ERC20Guild: to, data value arrays cannot be empty"
        );
        for (uint256 i = 0; i < to.length; i++) {
            require(to[i] != address(permissionRegistry), "ERC20Guild: Cant call permission registry directly");
        }
        bytes32 proposalId = keccak256(
            abi.encodePacked(msg.sender, block.timestamp, totalProposals)
        );
        totalProposals = totalProposals.add(1);
        Proposal storage newProposal = proposals[proposalId];
        newProposal.creator = msg.sender;
        newProposal.startTime = block.timestamp;
        newProposal.endTime = block.timestamp.add(proposalTime);
        newProposal.to = to;
        newProposal.data = data;
        newProposal.value = value;
        newProposal.title = title;
        newProposal.contentHash = contentHash;
        newProposal.totalVotes = new uint256[](totalActions.add(1));
        newProposal.state = ProposalState.Submitted;

        activeProposalsNow++;
        emit ProposalStateChanged(proposalId, uint256(ProposalState.Submitted));
        proposalsIds.push(proposalId);
        return proposalId;
    }

    // @dev Executes a proposal that is not votable anymore and can be finished
    // @param proposalId The id of the proposal to be executed
    function _endProposal(bytes32 proposalId) internal isInitialized {
        require(
            proposals[proposalId].state == ProposalState.Submitted,
            "ERC20Guild: Proposal already executed"
        );
        require(
            proposals[proposalId].endTime < block.timestamp,
            "ERC20Guild: Proposal hasn't ended yet"
        );
        uint256 winningAction = 0;
        uint256 i = 1;
        for (i = 1; i < proposals[proposalId].totalVotes.length; i++) {
            if (
                proposals[proposalId].totalVotes[i] >=
                getVotingPowerForProposalExecution() &&
                proposals[proposalId].totalVotes[i] >
                proposals[proposalId].totalVotes[winningAction]
            ) winningAction = i;
        }

        if (winningAction == 0) {
            proposals[proposalId].state = ProposalState.Rejected;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Rejected));
        } else if (
            proposals[proposalId].endTime.add(timeForExecution) <
            block.timestamp
        ) {
            proposals[proposalId].state = ProposalState.Failed;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Failed));
        } else {
            proposals[proposalId].state = ProposalState.Executed;

            uint256 callsPerAction = proposals[proposalId].to.length.div(
                proposals[proposalId].totalVotes.length.sub(1)
            );
            i = callsPerAction.mul(winningAction.sub(1));
            uint256 endCall = i.add(callsPerAction);

            for (i; i < endCall; i++) {
                bytes4 proposalSignature = getFuncSignature(
                    proposals[proposalId].data[i]
                );
                (uint256 valueAllowed, uint256 fromTime) = permissionRegistry.getPermission(
                    address(0),
                    address(this),
                    proposals[proposalId].to[i],
                    proposalSignature
                );
                require(
                    (0 < fromTime) && (fromTime < block.timestamp),
                    "ERC20Guild: Not allowed call"
                );
                require((valueAllowed >= proposals[proposalId].value[i]), "ERC20Guild: Not allowed value");
                (bool success, ) = proposals[proposalId].to[i].call{
                    value: proposals[proposalId].value[i]
                }(proposals[proposalId].data[i]);
                require(success, "ERC20Guild: Proposal call failed");
            }
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Executed));
        }
        activeProposalsNow--;
    }

    // @dev Internal initializer
    // @param _token The ERC20 token that will be used as source of voting power
    // @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    // @param _timeForExecution The amount of time in seconds that a proposal action will have to execute successfully
    // @param _votingPowerForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal
    // action
    // @param _votingPowerForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    // @param _name The name of the ERC20Guild
    // @param _voteGas The amount of gas in wei unit used for vote refunds
    // @param _maxGasPrice The maximum gas price used for vote refunds
    // @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    // @param _permissionRegistry The address of the permission registry contract to be used
    function _initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        string memory _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        address _permissionRegistry
    ) internal {
        require(
            address(_token) != address(0),
            "ERC20Guild: token is the zero address"
        );
        name = _name;
        token = IERC20Upgradeable(_token);
        _setConfig(
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            _voteGas,
            _maxGasPrice,
            _maxActiveProposals,
            _permissionRegistry
        );
        permissionRegistry.setPermission(
            address(0),
            address(this),
            bytes4(keccak256("setConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256)")),
            0,
            true
        );
        permissionRegistry.setPermission(
            address(0),
            address(this),
            bytes4(keccak256("setPermission(address[],bytes4[],bool[])")),
            0,
            true
        );
        permissionRegistry.setPermission(
            address(0),
            address(this),
            bytes4(keccak256("setEIP1271SignedHash(bytes32,bool)")),
            0,
            true
        );
    }

    // @dev Internal function to set the configuration of the guild
    // @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    // @param _timeForExecution The amount of time in seconds that a proposal action will have to execute successfully
    // @param _votingPowerForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal
    // action
    // @param _votingPowerForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    // @param _voteGas The amount of gas in wei unit used for vote refunds
    // @param _maxGasPrice The maximum gas price used for vote refunds
    // @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    // @param _permissionRegistry The address of the permission registry contract to be used
    function _setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        address _permissionRegistry
    ) internal {
        require(
            !initialized || (msg.sender == address(this)),
            "ERC20Guild: Only callable by ERC20guild itself when initialized"
        );
        require(
            _proposalTime > 0,
            "ERC20Guild: proposal time has to be more tha 0"
        );
        require(
            _votingPowerForProposalExecution > 0,
            "ERC20Guild: votes for execution has to be more than 0"
        );
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerForProposalExecution = _votingPowerForProposalExecution;
        votingPowerForProposalCreation = _votingPowerForProposalCreation;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
        permissionRegistry = GlobalPermissionRegistry(_permissionRegistry);
    }

    // @dev Internal function to set the amount of votingPower to vote in a proposal
    // @param voter The address of the voter
    // @param proposalId The id of the proposal to set the vote
    // @param action The proposal action to be voted
    // @param votingPower The amount of votingPower to use as voting for the proposal
    function _setVote(
        address voter,
        bytes32 proposalId,
        uint256 action,
        uint256 votingPower
    ) internal virtual isInitialized {
        require(
            proposals[proposalId].endTime > block.timestamp,
            "ERC20Guild: Proposal ended, cant be voted"
        );
        require(
            votingPowerOf(voter) >= votingPower,
            "ERC20Guild: Invalid votingPower amount"
        );
        require(
            proposals[proposalId].votes[voter].action == 0 ||
                proposals[proposalId].votes[voter].action == action,
            "ERC20Guild: Cant change action voted, only increase votingPower"
        );
        if (votingPower > proposals[proposalId].votes[voter].votingPower) {
            proposals[proposalId].totalVotes[action] = proposals[proposalId]
            .totalVotes[action]
            .add(votingPower.sub(proposals[proposalId].votes[voter].votingPower));
            emit VoteAdded(proposalId, voter, votingPower);
        }
        proposals[proposalId].votes[voter] = Vote(action, votingPower);
    }

    // @dev Internal function to refund a vote cost to a sender
    // The refund will be executed only if the voteGas is higher than zero and there is enough ETH balance in the guild.
    // @param toAddress The address where the refund should be sent
    function _refundVote(address payable toAddress) internal isInitialized {
        if (voteGas > 0) {
            uint256 gasRefund = voteGas.mul(tx.gasprice.min(maxGasPrice));
            if (address(this).balance >= gasRefund) {
                toAddress.call{value: gasRefund}("");
            }
        }
    }

    // @dev Get the voting power of an account
    // @param account The address of the account
    function votingPowerOf(address account)
        public
        view
        virtual
        returns (uint256)
    {
        return token.balanceOf(account);
    }

    // @dev Get the voting power of multiple addresses
    // @param accounts The addresses of the accounts
    function votingPowerOfMultiple(address[] memory accounts)
        public
        view
        virtual
        returns (uint256[] memory)
    {
        uint256[] memory votes = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            votes[i] = votingPowerOf(accounts[i]);
        }
        return votes;
    }

    // @dev Get the information of a proposal
    // @param proposalId The id of the proposal to get the information
    // @return creator The address that created the proposal
    // @return startTime The time at the proposal was created
    // @return endTime The time at the proposal will end
    // @return to The receiver addresses of each call to be executed
    // @return data The data to be executed on each call to be executed
    // @return value The ETH value to be sent on each call to be executed
    // @return totalActions The amount of actions that can be voted on
    // @return title The title of the proposal
    // @return contentHash The content hash of the content reference of the proposal
    // @return state If the proposal state
    // @return totalVotes The total votes of the proposal
    function getProposal(bytes32 proposalId)
        public
        view
        virtual
        returns (
            address creator,
            uint256 startTime,
            uint256 endTime,
            address[] memory to,
            bytes[] memory data,
            uint256[] memory value,
            uint256 totalActions,
            string memory title,
            bytes memory contentHash,
            ProposalState state,
            uint256[] memory totalVotes
        )
    {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.creator,
            proposal.startTime,
            proposal.endTime,
            proposal.to,
            proposal.data,
            proposal.value,
            proposal.totalVotes.length.sub(1),
            proposal.title,
            proposal.contentHash,
            proposal.state,
            proposal.totalVotes
        );
    }

    // @dev Get the votes of a voter in a proposal
    // @param proposalId The id of the proposal to get the information
    // @param voter The address of the voter to get the votes
    // @return action The selected action of teh voter
    // @return votingPower The amount of voting power used in the vote
    function getProposalVotesOfVoter(bytes32 proposalId, address voter)
        public
        view
        virtual
        returns (uint256 action, uint256 votingPower)
    {
        return (
            proposals[proposalId].votes[voter].action,
            proposals[proposalId].votes[voter].votingPower
        );
    }

    // @dev Get minimum amount of votingPower needed for creation
    function getVotingPowerForProposalCreation()
        public
        view
        virtual
        returns (uint256)
    {
        return token.totalSupply().mul(votingPowerForProposalCreation).div(10000);
    }

    // @dev Get minimum amount of votingPower needed for proposal execution
    function getVotingPowerForProposalExecution()
        public
        view
        virtual
        returns (uint256)
    {
        return token.totalSupply().mul(votingPowerForProposalExecution).div(10000);
    }

    // @dev Get the first four bytes (function signature) of a bytes variable
    function getFuncSignature(bytes memory data)
        public
        view
        virtual
        returns (bytes4)
    {
        bytes32 functionSignature = bytes32(0);
        assembly {
            functionSignature := mload(add(data, 32))
        }
        return bytes4(functionSignature);
    }

    // @dev Get the length of the proposalIds array
    function getProposalsIdsLength() public view virtual returns (uint256) {
        return proposalsIds.length;
    }

    // @dev Gets the validity of a EIP1271 hash
    // @param _hash The EIP1271 hash
    function getEIP1271SignedHash(bytes32 _hash)
        public
        view
        virtual
        returns (bool)
    {
        return EIP1271SignedHashes[_hash];
    }

    // @dev Get if the hash and signature are valid EIP1271 signatures
    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        returns (bytes4 magicValue)
    {
        return ((votingPowerOf(hash.recover(signature)) > 0) &&
                EIP1271SignedHashes[hash])
                ? this.isValidSignature.selector
                : bytes4(0);
    }

    // @dev Get the hash of the vote, this hash is later signed by the voter.
    // @param voter The address that will be used to sign the vote
    // @param proposalId The id fo the proposal to be voted
    // @param action The proposal action to be voted
    // @param votingPower The amount of voting power to be used
    function hashVote(
        address voter,
        bytes32 proposalId,
        uint256 action,
        uint256 votingPower
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, proposalId, action, votingPower));
    }
}
