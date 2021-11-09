// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

pragma experimental ABIEncoderV2;

import "../erc20guild/implementations/LockableERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "../realitio/IRealitio.sol";

/// @title OMNGuild - OMEN Token ERC20Guild
/// The OMN guild will use the OMN token for governance, having to lock the tokens, and needing a minimum amount of
/// tokens locked to create proposals.
/// The guild will be used for OMN token governance and to arbitrate markets validation in omen, using realit.io
/// boolean question markets "Is market MARKET_ID valid?".
/// The guild will be summoned to arbitrate a market validation if required.
/// The voters who vote in market validation proposals will recieve a vote reward.
contract OMNGuild is LockableERC20Guild {
    using SafeMathUpgradeable for uint256;

    // The max amount of votes that can de used in a proposal
    uint256 public maxAmountVotes;

    // The address of the realit.io smart contract
    IRealitio public realitIO;

    // The function signature of function to be exeucted by the guild to resolve a question in realit.io
    bytes4 public submitAnswerByArbitratorSignature;

    // This amount of OMN tokens to be distributed among voters depending on their vote decision and amount
    uint256 public successfulVoteReward;
    uint256 public unsuccessfulVoteReward;

    // realit.io Question IDs => Market validation proposals
    struct MarketValidationProposal {
        bytes32 marketValid;
        bytes32 marketInvalid;
    }
    mapping(bytes32 => MarketValidationProposal)
        public marketValidationProposals;

    // Market validation proposal ids => realit.io Question IDs
    mapping(bytes32 => bytes32) public proposalsForMarketValidation;

    // Saves which accounts claimed their market validation vote rewards
    mapping(bytes32 => mapping(address => bool)) public rewardsClaimed;

    // Save how much accounts voted in a proposal
    mapping(bytes32 => uint256) public positiveVotesCount;

    struct SpecialProposerPermission {
        bool exists;
        uint256 votingPowerForProposalCreation;
        uint256 proposalTime;
    }

    // set per proposer settings
    mapping(address => SpecialProposerPermission)
        public specialProposerPermissions;
    event SetSpecialProposerPermission(
        address _proposer,
        uint256 _proposalTime,
        uint256 _votingPowerForProposalCreation
    );

    /// @dev Initilizer
    /// Sets the call permission to arbitrate markets allowed by default and create the market question tempate in
    /// realit.io to be used on markets created with the guild
    /// @param _token The address of the token to be used
    /// @param _proposalTime The minimum time for a proposal to be under votation
    /// @param _timeForExecution The amount of time that a proposal has to be executed before being ended
    /// @param _votingPowerForProposalExecution The % of total voting power needed for a proposal to be executed based
    /// on the token total supply. 10000 == 100%, 5000 == 50% and 2500 == 25%
    /// @param _votingPowerForProposalCreation The amount of votes (in wei unit) needed for a proposal to be created
    /// @param _voteGas The gas to be used to calculate the vote gas refund
    /// @param _maxGasPrice The maximum gas price to be refunded
    /// @param _permissionDelay The amount of seconds that are going to be added over the timestamp of the block when
    /// a permission is allowed
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    /// @param _maxAmountVotes The max amount of votes allowed ot have
    /// @param _realitIO The address of the realitIO contract
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _permissionDelay,
        uint256 _lockTime,
        uint256 _maxAmountVotes,
        IRealitio _realitIO
    ) public initializer {
        require(
            address(_token) != address(0),
            "ERC20Guild: token is the zero address"
        );
        _initialize(
            _token,
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            "LockableERC20Guild",
            _voteGas,
            _maxGasPrice,
            _permissionDelay
        );
        tokenVault = new TokenVault();
        tokenVault.initialize(address(token), address(this));
        lockTime = _lockTime;
        callPermissions[address(this)][
            bytes4(
                keccak256(
                    "setLockTime(uint256)"
                )
            )
        ] = block.timestamp;
        realitIO = _realitIO;
        maxAmountVotes = _maxAmountVotes;
        submitAnswerByArbitratorSignature = bytes4(
            keccak256("submitAnswerByArbitrator(bytes32,bytes32,address)")
        );
        callPermissions[address(realitIO)][
            submitAnswerByArbitratorSignature
        ] = block.timestamp;
        callPermissions[address(this)][
            bytes4(
                keccak256("setOMNGuildConfig(uint256,address,uint256,uint256)")
            )
        ] = block.timestamp;
        callPermissions[address(this)][
            bytes4(
                keccak256(
                    "setSpecialProposerPermission(address,uint256,uint256)"
                )
            )
        ] = block.timestamp;
        initialized = true;
    }

    /// @dev Set OMNGuild specific parameters
    /// @param _maxAmountVotes The max amount of votes allowed ot have
    /// @param _realitIO The address of the realitIO contract
    /// @param _successfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a succesful
    ///  vote
    /// @param _unsuccessfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a unsuccesful
    ///  vote
    function setOMNGuildConfig(
        uint256 _maxAmountVotes,
        IRealitio _realitIO,
        uint256 _successfulVoteReward,
        uint256 _unsuccessfulVoteReward
    ) public isInitialized {
        require(
            msg.sender == address(this),
            "OMNGuild: Only the Guild can configure the guild"
        );
        realitIO = _realitIO;
        maxAmountVotes = _maxAmountVotes;
        successfulVoteReward = _successfulVoteReward;
        unsuccessfulVoteReward = _unsuccessfulVoteReward;
    }

    /// @dev Create two proposals one to vote for the validation fo a market in realitIO
    /// @param questionId the id of the question to be validated in realitiyIo
    function createMarketValidationProposal(bytes32 questionId)
        public
        isInitialized
    {
        require(
            votingPowerOf(msg.sender) >= getVotingPowerForProposalCreation(),
            "OMNGuild: Not enough tokens to create proposal"
        );
        require(
            realitIO.getOpeningTS(questionId) + 60 * 60 * 24 * 2 >
                block.timestamp,
            "OMNGuild: Realit.io question is over 2 days old"
        );

        address[] memory _to = new address[](1);
        bytes[] memory _data = new bytes[](1);
        uint256[] memory _value = new uint256[](1);
        bytes memory _contentHash = abi.encodePacked(questionId);

        _value[0] = 0;
        _to[0] = address(realitIO);

        // Create market valid proposal
        _data[0] = abi.encodeWithSelector(
            submitAnswerByArbitratorSignature,
            questionId,
            keccak256(abi.encodePacked(true)),
            address(this)
        );
        marketValidationProposals[questionId].marketValid = _createProposal(
            _to,
            _data,
            _value,
            string("Market valid"),
            _contentHash
        );

        proposalsForMarketValidation[
            marketValidationProposals[questionId].marketValid
        ] = questionId;
        // Create market invalid proposal
        _data[0] = abi.encodeWithSelector(
            submitAnswerByArbitratorSignature,
            questionId,
            keccak256(abi.encodePacked(false)),
            address(this)
        );
        marketValidationProposals[questionId].marketInvalid = _createProposal(
            _to,
            _data,
            _value,
            string("Market invalid"),
            _contentHash
        );
        proposalsForMarketValidation[
            marketValidationProposals[questionId].marketInvalid
        ] = questionId;

        realitIO.notifyOfArbitrationRequest(questionId, msg.sender, 0);
    }

    /// @dev Ends the market validation by executing the proposal with higher votes and rejecting the other
    /// @param questionId the proposalId of the voting machine
    function endMarketValidationProposal(bytes32 questionId) public {
        Proposal storage marketValidProposal =
            proposals[marketValidationProposals[questionId].marketValid];
        Proposal storage marketInvalidProposal =
            proposals[marketValidationProposals[questionId].marketInvalid];

        require(
            marketValidProposal.state == ProposalState.Submitted,
            "OMNGuild: Market valid proposal already executed"
        );
        require(
            marketInvalidProposal.state == ProposalState.Submitted,
            "OMNGuild: Market invalid proposal already executed"
        );
        require(
            marketValidProposal.endTime < block.timestamp,
            "OMNGuild: Market valid proposal hasnt ended yet"
        );
        require(
            marketInvalidProposal.endTime < block.timestamp,
            "OMNGuild: Market invalid proposal hasnt ended yet"
        );

        if (marketValidProposal.totalVotes > marketInvalidProposal.totalVotes) {
            _endProposal(marketValidationProposals[questionId].marketValid);
            marketInvalidProposal.state = ProposalState.Rejected;
            emit ProposalRejected(
                marketValidationProposals[questionId].marketInvalid
            );
        } else {
            _endProposal(marketValidationProposals[questionId].marketInvalid);
            marketValidProposal.state = ProposalState.Rejected;
            emit ProposalRejected(
                marketValidationProposals[questionId].marketValid
            );
        }
    }

    /// @dev Execute a proposal that has already passed the votation time and has enough votes
    /// This function cant end market validation proposals
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public override {
        require(
            proposalsForMarketValidation[proposalId] == bytes32(0),
            "OMNGuild: Use endMarketValidationProposal to end proposals to validate market"
        );
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

    /// @dev Claim the vote rewards of multiple proposals at once
    /// @param proposalIds The ids of the proposal already finished were a vote was set and vote reward not claimed
    /// @param voter The address of the voter to receiver the rewards
    function claimMarketValidationVoteRewards(
        bytes32[] memory proposalIds,
        address voter
    ) public {
        uint256 reward;
        for (uint256 i = 0; i < proposalIds.length; i++) {
            require(
                proposalsForMarketValidation[proposalIds[i]] != bytes32(0),
                "OMNGuild: Cant claim from proposal that isnt for market validation"
            );
            require(
                proposals[proposalIds[i]].state == ProposalState.Executed ||
                    proposals[proposalIds[i]].state == ProposalState.Rejected,
                "OMNGuild: Proposal to claim should be executed or rejected"
            );
            require(
                !rewardsClaimed[proposalIds[i]][voter],
                "OMNGuild: Vote reward already claimed"
            );
            // If proposal was executed and vote was positive the vote was for a succesful action
            if (
                proposals[proposalIds[i]].state == ProposalState.Executed &&
                proposals[proposalIds[i]].votes[voter] > 0
            ) {
                reward = reward.add(
                    successfulVoteReward.div(positiveVotesCount[proposalIds[i]])
                );
                // If proposal was rejected and vote was positive the vote was for a unsuccesful action
            } else if (
                proposals[proposalIds[i]].state == ProposalState.Rejected &&
                proposals[proposalIds[i]].votes[voter] > 0
            ) {
                reward = reward.add(
                    unsuccessfulVoteReward.div(
                        positiveVotesCount[proposalIds[i]]
                    )
                );
            }

            // Mark reward as claimed
            rewardsClaimed[proposalIds[i]][voter] = true;
        }

        // Send the total reward
        _sendTokenReward(voter, reward);
    }

    /// @dev Internal function to set the amount of votingPower to vote in a proposal
    /// It also checks that the vote is done only once in marketValidationProposals proposal
    /// @param voter The address of the voter
    /// @param proposalId The id of the proposal to set the vote
    /// @param votingPower The amount of votingPower to use as voting for the proposal
    function _setVote(
        address voter,
        bytes32 proposalId,
        uint256 votingPower
    ) internal override isInitialized {
        require(
            proposals[proposalId].state == ProposalState.Submitted,
            "OMNGuild: Proposal already executed"
        );
        require(
            votingPowerOf(voter) >= votingPower,
            "OMNGuild: Invalid votingPower amount"
        );
        require(
            votingPower <= maxAmountVotes,
            "OMNGuild: Cant vote with more votes than max amount of votes"
        );

        // Check that no vote was done in the marketValidationProposals proposal
        bytes32 marketValidationProposalId =
            proposalsForMarketValidation[proposalId];
        if (marketValidationProposalId != bytes32(0)) {
            require(
                getProposalVotesOfVoter(
                    marketValidationProposals[marketValidationProposalId]
                        .marketValid,
                    msg.sender
                ) == 0,
                "OMNGuild: Already voted in marketValidation proposal"
            );
            require(
                getProposalVotesOfVoter(
                    marketValidationProposals[marketValidationProposalId]
                        .marketInvalid,
                    msg.sender
                ) == 0,
                "OMNGuild: Already voted in marketValidation proposal"
            );
        }
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
        if (votingPower > 0) {
            positiveVotesCount[proposalId] = positiveVotesCount[proposalId].add(
                1
            );
        }
        proposals[proposalId].votes[voter] = votingPower;
    }

    /// @dev Internal function to send a reward of OMN tokens (if the balance is enough) to an address
    /// @param to The address to recieve the token
    /// @param amount The amount of OMN tokens to be sent in wei units
    function _sendTokenReward(address to, uint256 amount) internal {
        require(
            token.balanceOf(address(this)) > amount,
            "OMNGuild: Rewards are temporarily unavailable. Please try again later."
        );
        token.transfer(to, amount);
    }

    /// @dev Get minimum amount of votes needed for creation
    function getVotingPowerForProposalCreation()
        public
        view
        override
        returns (uint256)
    {
        return votingPowerForProposalCreation;
    }

    /// @dev Get minimum amount of votes needed for proposal execution
    function getVotingPowerForProposalExecution()
        public
        view
        override
        returns (uint256)
    {
        return totalLocked.mul(votingPowerForProposalExecution).div(10000);
    }

    /// @dev set special proposer permissions
    /// @param _proposer The address to allow
    /// @param _proposalTime The minimum time for a proposal to be under votation
    /// @param _votingPowerForProposalCreation The minimum balance of tokens needed to create a proposal
    function setSpecialProposerPermission(
        address _proposer,
        uint256 _proposalTime,
        uint256 _votingPowerForProposalCreation
    ) public virtual isInitialized {
        require(
            msg.sender == address(this),
            "OMNGuild: Only callable by the guild itself"
        );
        specialProposerPermissions[_proposer].exists = true;
        specialProposerPermissions[_proposer].proposalTime = _proposalTime;
        specialProposerPermissions[_proposer]
            .votingPowerForProposalCreation = _votingPowerForProposalCreation;
        emit SetSpecialProposerPermission(
            _proposer,
            _proposalTime,
            _votingPowerForProposalCreation
        );
    }

    /// @dev Create a proposal with a static call data
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
    ) public virtual override isInitialized returns (bytes32) {
        uint256 proposalTime_ = proposalTime;
        uint256 votingPowerForProposalCreation_ =
            votingPowerForProposalCreation;

        if (specialProposerPermissions[msg.sender].exists) {
            // override defaults
            proposalTime = specialProposerPermissions[msg.sender].proposalTime;
            votingPowerForProposalCreation = specialProposerPermissions[
                msg.sender
            ]
                .votingPowerForProposalCreation;
        }

        bytes32 proposalId =
            super.createProposal(to, data, value, description, contentHash);

        // revert overrides
        proposalTime = proposalTime_;
        votingPowerForProposalCreation = votingPowerForProposalCreation_;

        return proposalId;
    }
}
