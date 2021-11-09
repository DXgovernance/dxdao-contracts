// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import '@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol';
import "../utils/TokenVault.sol";

/// @title ERC20Guild
/// @author github:AugustoL
/// @dev Extends an ERC20 functionality into a Guild, adding a simple governance system over an ERC20 token.
/// An ERC20Guild is a simple organization that execute actions if a minimun amount of positive votes are reached in
/// a certain amount of time.
/// In order to vote a token holder need to lock tokens in the guild.
/// The tokens are locked for a minimum amount of time.
/// The voting power equals the amount of tokens locked in the guild.
/// A proposal is executed only when the mimimum amount of total voting power are reached before the proposal finish.
/// The guild can execute only allowed functions, if a function is not allowed it will need to set the allowance
/// for it and then after being succesfully added to allowed functions a proposal for it execution can be created.
/// Once a proposal is approved it can be executed succesfully only once during a certain period of time called
/// timeForExecution.
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
    uint256 public lockTime;
    uint256 public totalLocked;
    TokenVault public tokenVault;
    uint256 public proposalNonce;

    // All the signed votes that were executed, to avoid double signed vote execution.
    mapping(bytes32 => bool) public signedVotes;

    // The signatures of the functions allowed, indexed first by address and then by function signature
    mapping(address => mapping(bytes4 => uint256)) public callPermissions;

    // The amount of seconds that are going to be added over the timestamp of the block when a permission is allowed
    uint256 public permissionDelay;

    // The tokens locked indexed by token holder address.
    struct TokenLock {
        uint256 amount;
        uint256 timestamp;
    }
    mapping(address => TokenLock) public tokensLocked;
    
    // The EIP1271 hashes that were signed by the ERC20Guild
    // Once a hash is signed by the guild it can be verified with a signature from any voter with balance
    mapping(bytes32 => bool) public EIP1271SignedHashes;

    // Proposals indexed by proposal id.
    struct Proposal {
        address creator;
        uint256 startTime;
        uint256 endTime;
        address[] to;
        bytes[] data;
        uint256[] value;
        string description;
        bytes contentHash;
        uint256 totalVotes;
        ProposalState state;
        mapping(address => uint256) votes;
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
    event VoteRemoved(
        bytes32 indexed proposalId,
        address voter,
        uint256 votingPower
    );
    event SetAllowance(
        address indexed to,
        bytes4 functionSignature,
        bool allowance
    );
    event TokensLocked(address voter, uint256 value);
    event TokensReleased(address voter, uint256 value);

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
    /// @param _votingPowerForProposalExecution The minimum amount of total voitng power needed in a proposal to be executed
    /// @param _votingPowerForProposalCreation The minimum amount of voitng power needed to create a proposal
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
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
        uint256 _lockTime,
        uint256 _permissionDelay
    ) public virtual initializer {
        require(
            address(_token) != address(0),
            "ERC20Guild: token is the zero address"
        );
        name = _name;
        token = IERC20Upgradeable(_token);
        tokenVault = new TokenVault();
        tokenVault.initialize(address(token), address(this));
        _setConfig(
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            _voteGas,
            _maxGasPrice,
            _lockTime
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
        initialized = true;
    }

    /// @dev Set the ERC20Guild configuration, can be called only executing a proposal
    /// or when it is initilized
    /// @param _proposalTime The minimun time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    /// @param _votingPowerForProposalExecution The minimum amount of total voitng power needed in a proposal to be executed
    /// @param _votingPowerForProposalCreation The minimum amount of voitng power needed to create a proposal
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    function setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _lockTime
    ) public virtual {
        _setConfig(
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            _voteGas,
            _maxGasPrice,
            _lockTime
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
    /// @param description A short description of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        string memory description,
        bytes memory contentHash
    ) public virtual isInitialized returns (bytes32) {
        require(
            votingPowerOf(msg.sender) >= getVotingPowerForProposalCreation(),
            "ERC20Guild: Not enough tokens to create proposal"
        );
        require(
            (to.length == data.length) && (to.length == value.length),
            "ERC20Guild: Wrong length of to, data or value arrays"
        );
        require(
            to.length > 0,
            "ERC20Guild: to, data value arrays cannot be empty"
        );
        return _createProposal(to, data, value, description, contentHash);
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

    /// @dev Create proposals with an static call data and extra information
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param description A short description of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposals(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        string[] memory description,
        bytes[] memory contentHash
    ) public isInitialized returns (bytes32[] memory) {
        require(
            votingPowerOf(msg.sender) >= getVotingPowerForProposalCreation(),
            "ERC20Guild: Not enough votingPower to create proposal"
        );
        require(
            (to.length == data.length) && (to.length == value.length),
            "ERC20Guild: Wrong length of to, data or value arrays"
        );
        require(
            (description.length == contentHash.length),
            "ERC20Guild: Wrong length of description or contentHash arrays"
        );
        require(
            to.length > 0,
            "ERC20Guild: to, data value arrays cannot be empty"
        );
        bytes32[] memory proposalsCreated = new bytes32[](description.length);
        uint256 proposalsToCreate = description.length;
        uint256 callsPerProposal = to.length.div(proposalsToCreate);
        for (
            uint256 proposalIndex = 0;
            proposalIndex < proposalsToCreate;
            proposalIndex++
        ) {
            address[] memory _to = new address[](callsPerProposal);
            bytes[] memory _data = new bytes[](callsPerProposal);
            uint256[] memory _value = new uint256[](callsPerProposal);
            uint256 callIndex;
            for (
                uint256 callIndexInProposals =
                    callsPerProposal.mul(proposalIndex);
                callIndexInProposals < callsPerProposal;
                callIndexInProposals++
            ) {
                _to[callIndex] = to[callIndexInProposals];
                _data[callIndex] = data[callIndexInProposals];
                _value[callIndex] = value[callIndexInProposals];
                callIndex++;
            }
            proposalsCreated[proposalIndex] = _createProposal(
                _to,
                _data,
                _value,
                description[proposalIndex],
                contentHash[proposalIndex]
            );
        }
        return proposalsCreated;
    }

    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public virtual {
        require(
            proposals[proposalId].state == ProposalState.Submitted,
            "ERC20Guild: Proposal already executed"
        );
        require(
            proposals[proposalId].endTime < block.timestamp,
            "ERC20Guild: Proposal hasnt ended yet"
        );
        _endProposal(proposalId);
    }

    /// @dev Set the voting power to vote in a proposal
    /// @param proposalId The id of the proposal to set the vote
    /// @param votingPower The votingPower to use in the proposal
    function setVote(bytes32 proposalId, uint256 votingPower) public virtual {
        require(votingPowerOf(msg.sender) >= votingPower, "ERC20Guild: Invalid votingPower amount");
        _setVote(msg.sender, proposalId, votingPower);
        _refundVote(payable(msg.sender));
    }

    /// @dev Set the voting power to vote in multiple proposals
    /// @param proposalIds The ids of the proposals to set the votes
    /// @param votingPowers The votingPower to use as voting for each proposals
    function setVotes(
        bytes32[] memory proposalIds,
        uint256[] memory votingPowers
    ) public virtual {
        require(
            proposalIds.length == votingPowers.length,
            "ERC20Guild: Wrong length of proposalIds or votingPowers"
        );
        for (uint256 i = 0; i < proposalIds.length; i++)
            _setVote(msg.sender, proposalIds[i], votingPowers[i]);
    }

    /// @dev Set the voting power to vote in a proposal using a signed vote
    /// @param proposalId The id of the proposal to set the vote
    /// @param votingPower The votingPower to use in the proposal
    /// @param voter The address of the voter
    /// @param signature The signature of the hashed vote
    function setSignedVote(
        bytes32 proposalId,
        uint256 votingPower,
        address voter,
        bytes memory signature
    ) public virtual isInitialized {
        bytes32 hashedVote = hashVote(voter, proposalId, votingPower);
        require(!signedVotes[hashedVote], "ERC20Guild: Already voted");
        require(
            voter == hashedVote.toEthSignedMessageHash().recover(signature),
            "ERC20Guild: Wrong signer"
        );
        _setVote(voter, proposalId, votingPower);
        signedVotes[hashedVote] = true;
    }

    /// @dev Set the voting power to vote in multiple proposals using signed votes
    /// @param proposalIds The ids of the proposals to set the votes
    /// @param votingPowers The votingPower to use as voting for each proposals
    /// @param voters The accounts that signed the votes
    /// @param signatures The vote signatures
    function setSignedVotes(
        bytes32[] memory proposalIds,
        uint256[] memory votingPowers,
        address[] memory voters,
        bytes[] memory signatures
    ) public virtual {
        for (uint256 i = 0; i < proposalIds.length; i++) {
            setSignedVote(
                proposalIds[i],
                votingPowers[i],
                voters[i],
                signatures[i]
            );
        }
    }

    /// @dev Lock tokens in the guild to be used as voting power
    /// @param tokenAmount The amount of tokens to be locked
    function lockTokens(uint256 tokenAmount) public virtual {
        tokenVault.deposit(msg.sender, tokenAmount);
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.add(
            tokenAmount
        );
        tokensLocked[msg.sender].timestamp = block.timestamp.add(lockTime);
        totalLocked = totalLocked.add(tokenAmount);
        emit TokensLocked(msg.sender, tokenAmount);
    }

    /// @dev Release tokens locked in the guild, this will decrease the voting power
    /// @param tokenAmount The amount of tokens to be released
    function releaseTokens(uint256 tokenAmount) public virtual {
        require(
            votingPowerOf(msg.sender) >= tokenAmount,
            "ERC20Guild: Unable to release more tokens than locked"
        );
        require(
            tokensLocked[msg.sender].timestamp < block.timestamp,
            "ERC20Guild: Tokens still locked"
        );
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.sub(
            tokenAmount
        );
        totalLocked = totalLocked.sub(tokenAmount);
        tokenVault.withdraw(msg.sender, tokenAmount);
        emit TokensReleased(msg.sender, tokenAmount);
    }

    /// @dev Create a proposal with an static call data and extra information
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param description A short description of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function _createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        string memory description,
        bytes memory contentHash
    ) internal returns (bytes32) {
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
        newProposal.description = description;
        newProposal.contentHash = contentHash;
        newProposal.totalVotes = 0;
        newProposal.state = ProposalState.Submitted;

        emit ProposalCreated(proposalId);
        proposalsIds.push(proposalId);
        return proposalId;
    }

    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// @param proposalId The id of the proposal to be executed
    function _endProposal(bytes32 proposalId) internal {
        if (
            proposals[proposalId].totalVotes <
            getVotingPowerForProposalExecution() &&
            proposals[proposalId].state == ProposalState.Submitted
        ) {
            proposals[proposalId].state = ProposalState.Rejected;
            emit ProposalRejected(proposalId);
        } else if (
            proposals[proposalId].endTime.add(timeForExecution) <
            block.timestamp &&
            proposals[proposalId].state == ProposalState.Submitted
        ) {
            proposals[proposalId].state = ProposalState.Failed;
            emit ProposalEnded(proposalId);
        } else if (proposals[proposalId].state == ProposalState.Submitted) {
            proposals[proposalId].state = ProposalState.Executed;
            for (uint256 i = 0; i < proposals[proposalId].to.length; i++) {
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
    }

    /// @dev Internal function to set the configuration of the guild
    /// @param _proposalTime The minimum time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    /// @param _votingPowerForProposalExecution The token votes needed for a proposal to be executed
    /// @param _votingPowerForProposalCreation The minimum balance of voting power needed to create a proposal
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    function _setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _lockTime
    ) internal {
        require(
            !initialized || (msg.sender == address(this)),
            "ERC20Guild: Only callable by ERC20guild itself when initialized"
        );
        require(
            _proposalTime >= 0,
            "ERC20Guild: proposal time has to be more tha 0"
        );
        require(
            _votingPowerForProposalExecution > 0,
            "ERC20Guild: votes for execution has to be more than 0"
        );
        require(
            _lockTime > 0,
            "ERC20Guild: lockTime should be higher than zero"
        );
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerForProposalExecution = _votingPowerForProposalExecution;
        votingPowerForProposalCreation = _votingPowerForProposalCreation;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        lockTime = _lockTime;
    }

    /// @dev Internal function to set the amount of votingPower to vote in a proposal
    /// @param voter The address of the voter
    /// @param proposalId The id of the proposal to set the vote
    /// @param votingPower The amount of votingPower to use as voting for the proposal
    function _setVote(
        address voter,
        bytes32 proposalId,
        uint256 votingPower
    ) internal virtual isInitialized {
        require(
            proposals[proposalId].state == ProposalState.Submitted,
            "ERC20Guild: Proposal already executed"
        );
        require(
            votingPowerOf(voter) >= votingPower,
            "ERC20Guild: Invalid votingPower amount"
        );
        if (votingPower > proposals[proposalId].votes[voter]) {
            proposals[proposalId].totalVotes = proposals[proposalId]
                .totalVotes
                .add(votingPower.sub(proposals[proposalId].votes[voter]));
            emit VoteAdded(
                proposalId,
                voter,
                votingPower.sub(proposals[proposalId].votes[voter])
            );
        } else {
            proposals[proposalId].totalVotes = proposals[proposalId]
                .totalVotes
                .sub(proposals[proposalId].votes[voter].sub(votingPower));
            emit VoteRemoved(
                proposalId,
                voter,
                proposals[proposalId].votes[voter].sub(votingPower)
            );
        }
        proposals[proposalId].votes[voter] = votingPower;
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
    function votingPowerOf(address account) public view returns (uint256) {
        return tokensLocked[account].amount;
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
    /// @return description A short description of the proposal
    /// @return contentHash The content hash of the content reference of the proposal
    /// @return totalVotes The total votes of the proposal
    /// @return state If the proposal state
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
            string memory description,
            bytes memory contentHash,
            uint256 totalVotes,
            ProposalState state
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
            proposal.description,
            proposal.contentHash,
            proposal.totalVotes,
            proposal.state
        );
    }

    /// @dev Get the votes of a voter in a proposal
    /// @param proposalId The id of the proposal to get the information
    /// @param voter The address of the voter to get the votes
    /// @return the votes of the voter for the requested proposal
    function getProposalVotesOfVoter(bytes32 proposalId, address voter)
        public
        view
        virtual
        returns (uint256)
    {
        return (proposals[proposalId].votes[voter]);
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
    /// @param votingPower The amount of voting power to be used
    function hashVote(
        address voter,
        bytes32 proposalId,
        uint256 votingPower
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, proposalId, votingPower));
    }
}
