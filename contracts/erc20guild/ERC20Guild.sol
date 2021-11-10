// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import '@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol';

/*
  @title ERC20Guild
  @author github:AugustoL
  @dev Extends an ERC20 functionality into a Guild, adding a simple governance system over an ERC20 token.
  An ERC20Guild is a simple organization that execute arbitrary calls if a minimun amount of votes is reached in a 
  proposal action while the proposal is active.
  Each proposal has actions, the voter can vote only once per proposal and cant change the choosen action, only
  increase the voting power of his vote.
  A proposal ends when the mimimum amount of total voting power is reached on a proposal action before the proposal
  finish.
  When a proposal ends succesfully it executes the calls of the winning action.
  The winning action has a certain amount of time to be executed succesfully if that time passes and the action didnt
  executed succesfully, it is marked as failded.
  The guild can execute only allowed functions, if a function is not allowed it will need to set the allowance
  for it.
  The allowed functions have a timestamp that marks from what time the function can be executed.
*/
contract ERC20Guild is Initializable, IERC1271Upgradeable {
    using SafeMathUpgradeable for uint256;
    using MathUpgradeable for uint256;
    using ECDSAUpgradeable for bytes32;

    enum ProposalState {None, Submitted, Rejected, Executed, Failed}

    IERC20Upgradeable public token;
    bool public initialized;
    string public name;
    uint256 public proposalTime;
    uint256 public timeForExecution;
    uint256 public votingPowerForProposalExecution;
    uint256 public votingPowerForProposalCreation;
    uint256 public voteGas;
    uint256 public maxGasPrice;
    uint256 public maxActiveProposals;

    uint256 public proposalNonce;
    uint256 public totalActiveProposals;
    
    // All the signed votes that were executed, to avoid double signed vote execution.
    mapping(bytes32 => bool) public signedVotes;

    // The signatures of the functions allowed, indexed first by address and then by function signature
    mapping(address => mapping(bytes4 => uint256)) public callPermissions;

    // The amount of seconds that are going to be added over the timestamp of the block when a permission is allowed
    uint256 public permissionDelay;
    
    // The EIP1271 hashes that were signed by the ERC20Guild
    // Once a hash is signed by the guild it can be verified with a signature from any voter with balance
    mapping(bytes32 => bool) public EIP1271SignedHashes;

    struct Vote {
      uint256 action;
      uint256 votingPower;
    }
    
    // Proposals indexed by proposal id
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
    mapping(bytes32 => Proposal) public proposals;

    // Array to keep track of the proposalsIds in contract storage
    bytes32[] public proposalsIds;

    event ProposalCreated(bytes32 indexed proposalId);
    event ProposalRejected(bytes32 indexed proposalId);
    event ProposalExecuted(bytes32 indexed proposalId);
    event ProposalEnded(bytes32 indexed proposalId);
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

    /// @dev Allows the voting machine to receive ether to be used to refund voting costs
    fallback() external payable {}

    receive() external payable {}

    /// @dev Initialized modifier to require the contract to be initialized
    modifier isInitialized() {
        require(initialized, "ERC20Guild: Not initilized");
        _;
    }

    /// @dev Initilizer
    /// @param _token The address of the token to be used
    /// @param _proposalTime The minimun time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    /// @param _votingPowerForProposalExecution The minimum amount of total voitng power needed in a proposal to be
    /// executed
    /// @param _votingPowerForProposalCreation The minimum amount of voitng power needed to create a proposal
    /// @param _name The the guild name
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _maxActiveProposals The maximum number of proposals to be in submitted state
    /// @param _permissionDelay The amount of seconds that are going to be added over the timestamp of the block when
    /// a permission is allowed
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
        uint256 _permissionDelay
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
            _permissionDelay
        );
        initialized = true;
    }

    /// @dev Set the ERC20Guild configuration, can be called only executing a proposal
    /// or when it is initilized
    /// @param _proposalTime The minimun time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    /// @param _votingPowerForProposalExecution The minimum amount of total voitng power needed in a proposal to be
    /// executed
    /// @param _votingPowerForProposalCreation The minimum amount of voitng power needed to create a proposal
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _maxActiveProposals The maximum number of proposals to be in submitted state
    function setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals
    ) public virtual {
        _setConfig(
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            _voteGas,
            _maxGasPrice,
            _maxActiveProposals
        );
    }

    /// @dev Set the allowance of a call to be executed by the guild
    /// @param to The address to be called
    /// @param functionSignature The signature of the function
    /// @param allowance If the function is allowed to be called or not
    function setAllowance(
        address[] memory to,
        bytes4[] memory functionSignature,
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
                "ERC20Guild: Empty sigantures not allowed"
            );
            if (allowance[i])
                callPermissions[to[i]][functionSignature[i]] = uint256(
                    block
                        .timestamp
                )
                    .add(permissionDelay);
            else callPermissions[to[i]][functionSignature[i]] = 0;
            emit SetAllowance(to[i], functionSignature[i], allowance[i]);
        }
        require(
            callPermissions[address(this)][
                bytes4(
                    keccak256(
                        "setConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
                    )
                )
            ] > 0,
            "ERC20Guild: setConfig function allowance cant be turned off"
        );
        require(
            callPermissions[address(this)][
                bytes4(keccak256("setAllowance(address[],bytes4[],bool[])"))
            ] > 0,
            "ERC20Guild: setAllowance function allowance cant be turned off"
        );
    }

    /// @dev Create a proposal with an static call data and extra information
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param totalActions The amount of actions that would be offered to the voters
    /// @param title The title of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
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
    
    /// @dev Set a hash of an call to be validated using EIP1271
    /// @param _hash The EIP1271 hash to be added or removed
    /// @param isValid If the hash is valid or not
    function setEIP1271SignedHash(bytes32 _hash, bool isValid) public virtual {
        require(
            msg.sender == address(this),
            'ERC20Guild: Only callable by the guild'
        );
        EIP1271SignedHashes[_hash] = isValid;
    }

    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public virtual {
        _endProposal(proposalId);
    }

    /// @dev Set the voting power to vote in a proposal
    /// @param proposalId The id of the proposal to set the vote
    /// @param action The proposal action to be voted
    /// @param votingPower The votingPower to use in the proposal
    function setVote(bytes32 proposalId, uint256 action, uint256 votingPower) public virtual {
        _setVote(msg.sender, proposalId, action, votingPower);
        _refundVote(payable(msg.sender));
    }

    /// @dev Set the voting power to vote in multiple proposals
    /// @param proposalIds The ids of the proposals to set the vote
    /// @param actions The proposal actions to be voted
    /// @param votingPowers The votingPower to use as voting for each proposals
    function setVotes(
        bytes32[] memory proposalIds,
        uint256[] memory actions,
        uint256[] memory votingPowers
    ) public virtual {
        require(
            (proposalIds.length == votingPowers.length) && (proposalIds.length == actions.length),
            "ERC20Guild: Wrong length of proposalIds, actions or votingPowers"
        );
        for (uint256 i = 0; i < proposalIds.length; i++)
            _setVote(msg.sender, proposalIds[i], actions[i], votingPowers[i]);
    }

    /// @dev Set the voting power to vote in a proposal using a signed vote
    /// @param proposalId The id of the proposal to set the vote
    /// @param action The proposal action to be voted
    /// @param votingPower The votingPower to use in the proposal
    /// @param voter The address of the voter
    /// @param signature The signature of the hashed vote
    function setSignedVote(
        bytes32 proposalId,
        uint256 action,
        uint256 votingPower,
        address voter,
        bytes memory signature
    ) public virtual isInitialized {
        bytes32 hashedVote = hashVote(voter, proposalId, action, votingPower);
        require(!signedVotes[hashedVote], "ERC20Guild: Already voted");
        require(
            voter == hashedVote.toEthSignedMessageHash().recover(signature),
            "ERC20Guild: Wrong signer"
        );
        _setVote(voter, proposalId, action, votingPower);
        signedVotes[hashedVote] = true;
    }

    /// @dev Set the voting power to vote in multiple proposals using signed votes
    /// @param proposalIds The ids of the proposals to set the votes
    /// @param actions The proposal actions to be voted
    /// @param votingPowers The votingPower to use as voting for each proposals
    /// @param voters The accounts that signed the votes
    /// @param signatures The vote signatures
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

    /// @dev Create a proposal with an static call data and extra information
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param totalActions The amount of actions that would be offered to the voters
    /// @param title The title of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function _createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        uint256 totalActions,
        string memory title,
        bytes memory contentHash
    ) internal returns (bytes32) {
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
        bytes32 proposalId =
            keccak256(
                abi.encodePacked(msg.sender, block.timestamp, proposalNonce)
            );
        proposalNonce = proposalNonce.add(1);
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
        
        totalActiveProposals ++;
        emit ProposalCreated(proposalId);
        proposalsIds.push(proposalId);
        return proposalId;
    }

    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// @param proposalId The id of the proposal to be executed
    function _endProposal(bytes32 proposalId) internal {
        require(
            proposals[proposalId].state == ProposalState.Submitted,
            "ERC20Guild: Proposal already executed"
        );
        require(
            proposals[proposalId].endTime < block.timestamp,
            "ERC20Guild: Proposal hasnt ended yet"
        );
      
        uint256 winningAction = 0;
        uint256 i = 1;
        for (i = 1; i < proposals[proposalId].totalVotes.length; i++) {
            if (proposals[proposalId].totalVotes[i] > getVotingPowerForProposalExecution()
                && proposals[proposalId].totalVotes[i] > proposals[proposalId].totalVotes[winningAction]
            )
            winningAction = i;
        }
        
        if (winningAction == 0) {
            proposals[proposalId].state = ProposalState.Rejected;
            emit ProposalRejected(proposalId);
        } else if (proposals[proposalId].endTime.add(timeForExecution) < block.timestamp) {
            proposals[proposalId].state = ProposalState.Failed;
            emit ProposalEnded(proposalId);
        } else {
            proposals[proposalId].state = ProposalState.Executed;
            
            uint256 callsPerAction = proposals[proposalId].to.length
                .div(proposals[proposalId].totalVotes.length.sub(1));
            i = callsPerAction.mul(winningAction.sub(1));
            uint256 endCall = i.add(callsPerAction);
            
            for (i; i < endCall; i++) {
                bytes4 proposalSignature =
                    getFuncSignature(proposals[proposalId].data[i]);
                uint256 permissionTimestamp =
                    getCallPermission(
                        proposals[proposalId].to[i],
                        proposalSignature
                    );
                require(
                    (0 < permissionTimestamp) &&
                        (permissionTimestamp < block.timestamp),
                    "ERC20Guild: Not allowed call"
                );
                (bool success, ) =
                    proposals[proposalId].to[i].call{
                        value: proposals[proposalId].value[i]
                    }(proposals[proposalId].data[i]);
                require(success, "ERC20Guild: Proposal call failed");
            }
            emit ProposalExecuted(proposalId);
        }
        totalActiveProposals --;
    }
    
    /// @dev Internal initializer
    /// @param _token The address of the token to be used
    /// @param _proposalTime The minimun time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    /// @param _votingPowerForProposalExecution The minimum amount of total voitng power needed in a proposal to be
    /// executed
    /// @param _votingPowerForProposalCreation The minimum amount of voitng power needed to create a proposal
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _maxActiveProposals The maximum number of proposals to be in submitted state
    /// @param _permissionDelay The amount of seconds that are going to be added over the timestamp of the block when
    /// a permission is allowed
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
        uint256 _permissionDelay
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
            _maxActiveProposals
        );
        callPermissions[address(this)][
            bytes4(
                keccak256(
                    "setConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
                )
            )
        ] = block.timestamp;
        callPermissions[address(this)][
            bytes4(keccak256("setAllowance(address[],bytes4[],bool[])"))
        ] = block.timestamp;
        callPermissions[address(this)][
            bytes4(keccak256("setEIP1271SignedHash(bytes32,bool)"))
        ] = block.timestamp;
        permissionDelay = _permissionDelay;
    }

    /// @dev Internal function to set the configuration of the guild
    /// @param _proposalTime The minimum time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    /// @param _votingPowerForProposalExecution The token votes needed for a proposal to be executed
    /// @param _votingPowerForProposalCreation The minimum balance of voting power needed to create a proposal
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _maxActiveProposals The maximum number of proposals to be in submitted state
    function _setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals
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
    }

    /// @dev Internal function to set the amount of votingPower to vote in a proposal
    /// @param voter The address of the voter
    /// @param proposalId The id of the proposal to set the vote
    /// @param action The proposal action to be voted
    /// @param votingPower The amount of votingPower to use as voting for the proposal
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
            proposals[proposalId].votes[voter].action == 0
            || proposals[proposalId].votes[voter].action == action,
            "ERC20Guild: Cant change action voted, only increase votingPower"
        );
        if (votingPower > proposals[proposalId].votes[voter].votingPower) {
            proposals[proposalId].totalVotes[action] = proposals[proposalId]
                .totalVotes[action]
                .add(votingPower.sub(proposals[proposalId].votes[voter].votingPower));
            emit VoteAdded(
                proposalId,
                voter,
                votingPower
            );
        }
        proposals[proposalId].votes[voter] = Vote(action, votingPower);
    }

    /// @dev Internal function to refund a vote cost to a sender
    /// The refund will be exeuted only if the voteGas is higher than zero and there is enough ETH balance in the guild.
    /// @param toAddress The address where the refund should be sent
    function _refundVote(address payable toAddress) internal isInitialized {
        if (voteGas > 0) {
            uint256 gasRefund = voteGas.mul(tx.gasprice.min(maxGasPrice));
            if (address(this).balance >= gasRefund) {
                toAddress.call{value: gasRefund}("");
            }
        }
    }

    /// @dev Get the voting power of an accont
    /// @param account The address of the account
    function votingPowerOf(address account) public view virtual returns (uint256) {
        return token.balanceOf(account);
    }

    /// @dev Get the voting power of multiple addresses
    /// @param accounts The addresses of the accounts
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

    /// @dev Get the information of a proposal
    /// @param proposalId The id of the proposal to get the information
    /// @return creator The address that created the proposal
    /// @return startTime The time at the proposal was created
    /// @return endTime The time at the proposal will end
    /// @return to The receiver addresses of each call to be executed
    /// @return data The data to be executed on each call to be executed
    /// @return value The ETH value to be sent on each call to be executed
    /// @return totalActions The amount of actions that can be voted on
    /// @return title The title of the proposal
    /// @return contentHash The content hash of the content reference of the proposal
    /// @return state If the proposal state
    /// @return totalVotes The total votes of the proposal
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

    /// @dev Get the votes of a voter in a proposal
    /// @param proposalId The id of the proposal to get the information
    /// @param voter The address of the voter to get the votes
    /// @return action The selected action of teh voter
    /// @return votingPower The amount of voting power used in the vote
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

    /// @dev Get minimum amount of votingPower needed for creation
    function getVotingPowerForProposalCreation()
        public
        view
        virtual
        returns (uint256)
    {
        return votingPowerForProposalCreation;
    }

    /// @dev Get minimum amount of votingPower needed for proposal execution
    function getVotingPowerForProposalExecution()
        public
        view
        virtual
        returns (uint256)
    {
        return votingPowerForProposalExecution;
    }

    /// @dev Get the first four bytes (function signature) of a bytes variable
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

    /// @dev Get call signature permission
    function getCallPermission(address to, bytes4 functionSignature)
        public
        view
        virtual
        returns (uint256)
    {
        return callPermissions[to][functionSignature];
    }

    /// @dev Get the length of the proposalIds array
    function getProposalsIdsLength() public view virtual returns (uint256) {
        return proposalsIds.length;
    }
    
    /// @dev Gets the validity of a EIP1271 hash
    /// @param _hash The EIP1271 hash
    function getEIP1271SignedHash(bytes32 _hash) public view virtual returns (bool) {
        return EIP1271SignedHashes[_hash];
    }
    
    /// @dev Get if the hash and signature are valid EIP1271 signatures
    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        returns (bytes4 magicValue)
    {
        return
            ((votingPowerOf(hash.recover(signature)) > 0) &&
                EIP1271SignedHashes[hash])
                ? this.isValidSignature.selector
                : bytes4(0);
    }

    /// @dev Get the hash of the vote, this hash is later signed by the voter.
    /// @param voter The address that will be used to sign the vote
    /// @param proposalId The id fo the proposal to be voted
    /// @param action The proposal action to be voted
    /// @param votingPower The amount of voting power to be used
    function hashVote(
        address voter,
        bytes32 proposalId,
        uint256 action,
        uint256 votingPower
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, proposalId, action, votingPower));
    }
}
