// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol";
import "../utils/PermissionRegistry.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "../utils/TokenVault.sol";

/*
  @title ERC20Guild
  @author github:AugustoL
  @dev Extends an ERC20 functionality into a Guild, adding a simple governance system over an ERC20 token.
  An ERC20Guild is a simple organization that execute arbitrary calls if a minimum amount of votes is reached in a 
  proposal action while the proposal is active.
  The token used for voting needs to be locked for a minimum period of time in order to be used as voting power.
  Every time tokens are locked the timestamp of the lock is updated and increased the lock time seconds.
  Once the lock time passed the voter can withdraw his tokens.
  Each proposal has actions, the voter can vote only once per proposal and cant change the chosen action, only
  increase the voting power of his vote.
  A proposal ends when the minimum amount of total voting power is reached on a proposal action before the proposal
  finish.
  When a proposal ends successfully it executes the calls of the winning action.
  The winning action has a certain amount of time to be executed successfully if that time passes and the action didn't
  executed successfully, it is marked as failed.
  The guild can execute only allowed functions, if a function is not allowed it will need to set the allowance for it.
  The allowed functions have a timestamp that marks from what time the function can be executed.
  A limit to a maximum amount of active proposals can be set, an active proposal is a proposal that is in Active state.
  Gas can be refunded to the account executing the vote, for this to happen the voteGas and maxGasPrice values need to
  be set.
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
    using AddressUpgradeable for address;

    bytes4 public constant ERC20_TRANSFER_SIGNATURE = bytes4(keccak256("transfer(address,uint256)"));
    bytes4 public constant ERC20_APPROVE_SIGNATURE = bytes4(keccak256("approve(address,uint256)"));
    bytes4 public constant ANY_SIGNATURE = bytes4(0xaaaaaaaa);

    enum ProposalState {
        None,
        Active,
        Rejected,
        Executed,
        Failed
    }

    // The ERC20 token that will be used as source of voting power
    IERC20Upgradeable public token;

    // The address of the PermissionRegistry to be used
    PermissionRegistry permissionRegistry;

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

    // The total amount of members that have voting power
    uint256 totalMembers;

    // The amount of active proposals
    uint256 public activeProposalsNow;

    // The amount of time in seconds that the voting tokens would be locked
    uint256 public lockTime;

    // The total amount of tokens locked
    uint256 public totalLocked;

    // The address of the Token Vault contract, where tokens are being held for the users
    TokenVault public tokenVault;

    // The tokens locked indexed by token holder address.
    struct TokenLock {
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => TokenLock) public tokensLocked;

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
        string contentHash;
        ProposalState state;
        uint256[] totalVotes;
        mapping(address => Vote) votes;
    }

    // Mapping of all proposals created indexed by proposal id
    mapping(bytes32 => Proposal) public proposals;

    // Array to keep track of the proposals ids in contract storage
    bytes32[] public proposalsIds;

    event ProposalStateChanged(bytes32 indexed proposalId, uint256 newState);
    event VoteAdded(bytes32 indexed proposalId, uint256 indexed action, address voter, uint256 votingPower);
    event TokensLocked(address voter, uint256 value);
    event TokensWithdrawn(address voter, uint256 value);

    bool internal isExecutingProposal;

    // @dev Allows the voting machine to receive ether to be used to refund voting costs
    fallback() external payable {}

    receive() external payable {}

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
    // @param _lockTime The minimum amount of seconds that the tokens would be locked
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
        uint256 _lockTime,
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
            _lockTime,
            _permissionRegistry
        );
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
    // @param _lockTime The minimum amount of seconds that the tokens would be locked
    function setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        uint256 _lockTime
    ) external virtual {
        _setConfig(
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            _voteGas,
            _maxGasPrice,
            _maxActiveProposals,
            _lockTime
        );
    }

    // @dev Set the allowance of a call to be executed by the guild
    // @param asset The asset to be used for the permission, 0x0 is ETH
    // @param to The address to be called
    // @param functionSignature The signature of the function
    // @param valueAllowed The ETH value in wei allowed to be transferred
    // @param allowance If the function is allowed to be called or not
    function setPermission(
        address[] memory asset,
        address[] memory to,
        bytes4[] memory functionSignature,
        uint256[] memory valueAllowed,
        bool[] memory allowance
    ) external virtual {
        require(msg.sender == address(this), "ERC20Guild: Only callable by ERC20guild itself");
        require(
            (to.length == functionSignature.length) &&
                (to.length == valueAllowed.length) &&
                (to.length == allowance.length) &&
                (to.length == asset.length),
            "ERC20Guild: Wrong length of asset, to, functionSignature or allowance arrays"
        );
        for (uint256 i = 0; i < to.length; i++) {
            require(functionSignature[i] != bytes4(0), "ERC20Guild: Empty signatures not allowed");
            permissionRegistry.setPermission(
                asset[i],
                address(this),
                to[i],
                functionSignature[i],
                valueAllowed[i],
                allowance[i]
            );
        }
        require(
            permissionRegistry.getPermissionTime(
                address(0),
                address(this),
                address(this),
                bytes4(keccak256("setConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)"))
            ) > 0,
            "ERC20Guild: setConfig function allowance cant be turned off"
        );
        require(
            permissionRegistry.getPermissionTime(
                address(0),
                address(this),
                address(this),
                bytes4(keccak256("setPermission(address[],address[],bytes4[],uint256[],bool[])"))
            ) > 0,
            "ERC20Guild: setPermission function allowance cant be turned off"
        );
        require(
            permissionRegistry.getPermissionTime(
                address(0),
                address(this),
                address(this),
                bytes4(keccak256("setPermissionDelay(uint256)"))
            ) > 0,
            "ERC20Guild: setPermissionDelay function allowance cant be turned off"
        );
    }

    // @dev Set the permission delay in the permission registry
    // @param allowance If the function is allowed to be called or not
    function setPermissionDelay(uint256 permissionDelay) external virtual {
        require(msg.sender == address(this), "ERC20Guild: Only callable by ERC20guild itself");
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
        string memory contentHash
    ) public virtual returns (bytes32) {
        return _createProposal(to, data, value, totalActions, title, contentHash);
    }

    // @dev Set a hash of an call to be validated using EIP1271
    // @param _hash The EIP1271 hash to be added or removed
    // @param isValid If the hash is valid or not
    function setEIP1271SignedHash(bytes32 _hash, bool isValid) external virtual {
        require(msg.sender == address(this), "ERC20Guild: Only callable by the guild");
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
    }

    // @dev Set the voting power to vote in multiple proposals
    // @param proposalIds The ids of the proposals to set the vote
    // @param actions The proposal actions to be voted
    // @param votingPowers The votingPower to use as voting for each proposals
    function setVotes(
        bytes32[] memory proposalIds,
        uint256[] memory actions,
        uint256[] memory votingPowers
    ) external virtual {
        require(
            (proposalIds.length == votingPowers.length) && (proposalIds.length == actions.length),
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
        require(voter == hashedVote.toEthSignedMessageHash().recover(signature), "ERC20Guild: Wrong signer");
        signedVotes[hashedVote] = true;
        _setVote(voter, proposalId, action, votingPower);
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
    ) external virtual {
        for (uint256 i = 0; i < proposalIds.length; i++) {
            setSignedVote(proposalIds[i], actions[i], votingPowers[i], voters[i], signatures[i]);
        }
    }

    // @dev Lock tokens in the guild to be used as voting power
    // @param tokenAmount The amount of tokens to be locked
    function lockTokens(uint256 tokenAmount) external virtual {
        require(tokenAmount > 0, "ERC20Guild: Tokens to lock should be higher than 0");
        if (tokensLocked[msg.sender].amount == 0) totalMembers = totalMembers.add(1);
        tokenVault.deposit(msg.sender, tokenAmount);
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.add(tokenAmount);
        tokensLocked[msg.sender].timestamp = block.timestamp.add(lockTime);
        totalLocked = totalLocked.add(tokenAmount);
        emit TokensLocked(msg.sender, tokenAmount);
    }

    // @dev Withdraw tokens locked in the guild, this will decrease the voting power
    // @param tokenAmount The amount of tokens to be withdrawn
    function withdrawTokens(uint256 tokenAmount) external virtual {
        require(votingPowerOf(msg.sender) >= tokenAmount, "ERC20Guild: Unable to withdraw more tokens than locked");
        require(tokensLocked[msg.sender].timestamp < block.timestamp, "ERC20Guild: Tokens still locked");
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.sub(tokenAmount);
        totalLocked = totalLocked.sub(tokenAmount);
        tokenVault.withdraw(msg.sender, tokenAmount);
        if (tokensLocked[msg.sender].amount == 0) totalMembers = totalMembers.sub(1);
        emit TokensWithdrawn(msg.sender, tokenAmount);
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
        string memory contentHash
    ) internal returns (bytes32) {
        require(activeProposalsNow < getMaxActiveProposals(), "ERC20Guild: Maximum amount of active proposals reached");
        require(
            votingPowerOf(msg.sender) >= getVotingPowerForProposalCreation(),
            "ERC20Guild: Not enough votes to create proposal"
        );
        require(
            (to.length == data.length) && (to.length == value.length),
            "ERC20Guild: Wrong length of to, data or value arrays"
        );
        require(to.length > 0, "ERC20Guild: to, data value arrays cannot be empty");
        for (uint256 i = 0; i < to.length; i++) {
            require(to[i] != address(permissionRegistry), "ERC20Guild: Cant call permission registry directly");
        }
        bytes32 proposalId = keccak256(abi.encodePacked(msg.sender, block.timestamp, totalProposals));
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
        newProposal.state = ProposalState.Active;

        activeProposalsNow = activeProposalsNow.add(1);
        emit ProposalStateChanged(proposalId, uint256(ProposalState.Active));
        proposalsIds.push(proposalId);
        return proposalId;
    }

    // @dev Executes a proposal that is not votable anymore and can be finished
    // @param proposalId The id of the proposal to be executed
    function _endProposal(bytes32 proposalId) internal {
        require(!isExecutingProposal, "ERC20Guild: Proposal under execution");
        require(proposals[proposalId].state == ProposalState.Active, "ERC20Guild: Proposal already executed");
        require(proposals[proposalId].endTime < block.timestamp, "ERC20Guild: Proposal hasn't ended yet");
        uint256 winningAction = 0;
        uint256 i = 1;
        for (i = 1; i < proposals[proposalId].totalVotes.length; i++) {
            if (
                proposals[proposalId].totalVotes[i] >= getVotingPowerForProposalExecution() &&
                proposals[proposalId].totalVotes[i] > proposals[proposalId].totalVotes[winningAction]
            ) winningAction = i;
        }

        if (winningAction == 0) {
            proposals[proposalId].state = ProposalState.Rejected;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Rejected));
        } else if (proposals[proposalId].endTime.add(timeForExecution) < block.timestamp) {
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
                if (proposals[proposalId].to[i] != address(0) && proposals[proposalId].data[i].length > 0) {
                    bytes4 callDataFuncSignature = getFuncSignature(proposals[proposalId].data[i]);
                    address asset = address(0);
                    address _to = proposals[proposalId].to[i];
                    uint256 _value = proposals[proposalId].value[i];

                    // If the call is an ERC20 transfer or approve the asset is the address called
                    // and the to and value are the decoded ERC20 receiver and value transfered
                    if (
                        ERC20_TRANSFER_SIGNATURE == callDataFuncSignature ||
                        ERC20_APPROVE_SIGNATURE == callDataFuncSignature
                    ) {
                        asset = proposals[proposalId].to[i];
                        callDataFuncSignature = ANY_SIGNATURE;
                        (_to, _value) = erc20TransferOrApproveDecode(proposals[proposalId].data[i]);
                    }

                    // The permission registry keeps track of all value transferred and checks call permission
                    if (_to != address(permissionRegistry))
                        try
                            permissionRegistry.setPermissionUsed(
                                asset,
                                address(this),
                                _to,
                                callDataFuncSignature,
                                _value
                            )
                        {} catch Error(string memory reason) {
                            revert(reason);
                        }

                    isExecutingProposal = true;
                    // We use isExecutingProposal varibale to avoid reentrancy in proposal execution
                    // slither-disable-next-line all
                    (bool success, ) = proposals[proposalId].to[i].call{value: proposals[proposalId].value[i]}(
                        proposals[proposalId].data[i]
                    );
                    require(success, "ERC20Guild: Proposal call failed");
                    isExecutingProposal = false;
                }
            }
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Executed));
        }
        activeProposalsNow = activeProposalsNow.sub(1);
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
    // @param _lockTime The minimum amount of seconds that the tokens would be locked
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
        uint256 _lockTime,
        address _permissionRegistry
    ) internal {
        require(address(_token) != address(0), "ERC20Guild: token cant be zero address");
        require(_proposalTime > 0, "ERC20Guild: proposal time has to be more tha 0");
        require(_lockTime >= _proposalTime, "ERC20Guild: lockTime has to be higher or equal to proposalTime");
        require(_votingPowerForProposalExecution > 0, "ERC20Guild: voting power for execution has to be more than 0");
        name = _name;
        token = IERC20Upgradeable(_token);
        tokenVault = new TokenVault();
        tokenVault.initialize(address(token), address(this));
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerForProposalExecution = _votingPowerForProposalExecution;
        votingPowerForProposalCreation = _votingPowerForProposalCreation;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
        lockTime = _lockTime;
        permissionRegistry = PermissionRegistry(_permissionRegistry);
        permissionRegistry.setPermission(
            address(0),
            address(this),
            address(this),
            bytes4(keccak256("setConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)")),
            0,
            true
        );
        permissionRegistry.setPermission(
            address(0),
            address(this),
            address(this),
            bytes4(keccak256("setPermission(address[],address[],bytes4[],uint256[],bool[])")),
            0,
            true
        );
        permissionRegistry.setPermission(
            address(0),
            address(this),
            address(this),
            bytes4(keccak256("setPermissionDelay(uint256)")),
            0,
            true
        );
        permissionRegistry.setPermission(
            address(0),
            address(this),
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
    // @param _lockTime The minimum amount of seconds that the tokens would be locked
    function _setConfig(
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        uint256 _lockTime
    ) internal {
        require(msg.sender == address(this), "ERC20Guild: Only callable by ERC20guild itself when initialized");
        require(_proposalTime > 0, "ERC20Guild: proposal time has to be more tha 0");
        require(_lockTime >= _proposalTime, "ERC20Guild: lockTime has to be higher or equal to proposalTime");
        require(_votingPowerForProposalExecution > 0, "ERC20Guild: voting power for execution has to be more than 0");
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerForProposalExecution = _votingPowerForProposalExecution;
        votingPowerForProposalCreation = _votingPowerForProposalCreation;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
        lockTime = _lockTime;
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
    ) internal {
        require(proposals[proposalId].endTime > block.timestamp, "ERC20Guild: Proposal ended, cant be voted");
        require(
            (votingPowerOf(voter) >= votingPower) && (votingPower > proposals[proposalId].votes[voter].votingPower),
            "ERC20Guild: Invalid votingPower amount"
        );
        require(
            proposals[proposalId].votes[voter].action == 0 || proposals[proposalId].votes[voter].action == action,
            "ERC20Guild: Cant change action voted, only increase votingPower"
        );

        proposals[proposalId].totalVotes[action] = proposals[proposalId]
            .totalVotes[action]
            .sub(proposals[proposalId].votes[voter].votingPower)
            .add(votingPower);

        proposals[proposalId].votes[voter].action = action;
        proposals[proposalId].votes[voter].votingPower = votingPower;

        emit VoteAdded(proposalId, action, voter, votingPower);

        if (voteGas > 0) {
            uint256 gasRefund = voteGas.mul(tx.gasprice.min(maxGasPrice));
            if (address(this).balance >= gasRefund && !address(msg.sender).isContract()) {
                (bool success, ) = payable(msg.sender).call{value: gasRefund}("");
                require(success, "Failed to refund gas");
            }
        }
    }

    // @dev Get the voting power of an account
    // @param account The address of the account
    function votingPowerOf(address account) public view virtual returns (uint256) {
        return tokensLocked[account].amount;
    }

    // @dev Get the voting power of multiple addresses
    // @param accounts The addresses of the accounts
    function votingPowerOfMultiple(address[] memory accounts) external view virtual returns (uint256[] memory) {
        uint256[] memory votes = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            votes[i] = votingPowerOf(accounts[i]);
        }
        return votes;
    }

    // @dev Get the address of the ERC20Token used for voting
    function getToken() external view returns (address) {
        return address(token);
    }

    // @dev Get the address of the permission registry contract
    function getPermissionRegistry() external view returns (address) {
        return address(permissionRegistry);
    }

    // @dev Get the name of the ERC20Guild
    function getName() external view returns (string memory) {
        return name;
    }

    // @dev Get the proposalTime
    function getProposalTime() external view returns (uint256) {
        return proposalTime;
    }

    // @dev Get the timeForExecution
    function getTimeForExecution() external view returns (uint256) {
        return timeForExecution;
    }

    // @dev Get the voteGas
    function getVoteGas() external view returns (uint256) {
        return voteGas;
    }

    // @dev Get the maxGasPrice
    function getMaxGasPrice() external view returns (uint256) {
        return maxGasPrice;
    }

    // @dev Get the maxActiveProposals
    function getMaxActiveProposals() public view returns (uint256) {
        return maxActiveProposals;
    }

    // @dev Get the totalProposals
    function getTotalProposals() external view returns (uint256) {
        return totalProposals;
    }

    // @dev Get the totalMembers
    function getTotalMembers() public view returns (uint256) {
        return totalMembers;
    }

    // @dev Get the activeProposalsNow
    function getActiveProposalsNow() external view returns (uint256) {
        return activeProposalsNow;
    }

    // @dev Get if a signed vote has been executed or not
    function getSignedVote(bytes32 signedVoteHash) external view returns (bool) {
        return signedVotes[signedVoteHash];
    }

    // @dev Get the proposalsIds array
    function getProposalsIds() external view returns (bytes32[] memory) {
        return proposalsIds;
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
        external
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
            string memory contentHash,
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
        external
        view
        virtual
        returns (uint256 action, uint256 votingPower)
    {
        return (proposals[proposalId].votes[voter].action, proposals[proposalId].votes[voter].votingPower);
    }

    // @dev Get minimum amount of votingPower needed for creation
    function getVotingPowerForProposalCreation() public view virtual returns (uint256) {
        return getTotalLocked().mul(votingPowerForProposalCreation).div(10000);
    }

    // @dev Get minimum amount of votingPower needed for proposal execution
    function getVotingPowerForProposalExecution() public view virtual returns (uint256) {
        return getTotalLocked().mul(votingPowerForProposalExecution).div(10000);
    }

    //@dev Decodes abi encoded data with selector for "transfer(address,uint256)".
    //@param _data ERC20 address and value encoded data.
    //@return to The account to receive the tokens
    //@return value The value of tokens to be transfered/approved
    function erc20TransferOrApproveDecode(bytes memory _data) public pure returns (address to, uint256 value) {
        assembly {
            to := mload(add(_data, 36))
            value := mload(add(_data, 68))
        }
    }

    // @dev Get the first four bytes (function signature) of a bytes variable
    function getFuncSignature(bytes memory data) public view virtual returns (bytes4) {
        bytes32 functionSignature = bytes32(0);
        assembly {
            functionSignature := mload(add(data, 32))
        }
        return bytes4(functionSignature);
    }

    // @dev Get the length of the proposalIds array
    function getProposalsIdsLength() external view virtual returns (uint256) {
        return proposalsIds.length;
    }

    // @dev Get the tokenVault address
    function getTokenVault() external view virtual returns (address) {
        return address(tokenVault);
    }

    // @dev Get the lockTime
    function getLockTime() external view virtual returns (uint256) {
        return lockTime;
    }

    // @dev Get the totalLocked
    function getTotalLocked() public view virtual returns (uint256) {
        return totalLocked;
    }

    // @dev Get the locked timestamp of a voter tokens
    function getVoterLockTimestamp(address voter) external view virtual returns (uint256) {
        return tokensLocked[voter].timestamp;
    }

    // @dev Gets the validity of a EIP1271 hash
    // @param _hash The EIP1271 hash
    function getEIP1271SignedHash(bytes32 _hash) external view virtual returns (bool) {
        return EIP1271SignedHashes[_hash];
    }

    // @dev Get if the hash and signature are valid EIP1271 signatures
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4 magicValue) {
        return
            ((votingPowerOf(hash.recover(signature)) > 0) && EIP1271SignedHashes[hash])
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
    ) public pure virtual returns (bytes32) {
        return keccak256(abi.encodePacked(voter, proposalId, action, votingPower));
    }
}
