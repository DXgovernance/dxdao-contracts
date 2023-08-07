// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "../ERC20GuildUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "../../utils/ERC20/ERC20SnapshotRep.sol";

/*
  @title SnapshotRepERC20Guild
  @author github:AugustoL
  @dev An ERC20Guild designed to work with a snapshotted voting token, no locking needed.
  When a proposal is created it saves the snapshot if at the moment of creation,
  the voters can vote only with the voting power they had at that time.
*/
contract SnapshotRepERC20Guild is ERC20GuildUpgradeable {
    using MathUpgradeable for uint256;
    using ECDSAUpgradeable for bytes32;

    // Proposal id => Snapshot id
    mapping(bytes32 => uint256) public proposalsSnapshots;

    /// @dev Initializer
    /// @param _token The ERC20 token that will be used as source of voting power
    /// @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    /// @param _timeForExecution The amount of time in seconds that a proposal option will have to execute successfully
    // solhint-disable-next-line max-line-length
    /// @param _votingPowerPercentageForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal action
    // solhint-disable-next-line max-line-length
    /// @param _votingPowerPercentageForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    // solhint-disable-next-line max-line-length
    /// @param _votingPowerPercentageForInstantProposalExecution The percentage of voting power in base 10000 needed to execute a proposal option without  waiting for the proposal time to end. If set to 0, the feature is disabled.
    /// @param _name The name of the ERC20Guild
    /// @param _voteGas The amount of gas in wei unit used for vote refunds
    /// @param _maxGasPrice The maximum gas price used for vote refunds
    /// @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    /// @param _permissionRegistry The address of the permission registry contract to be used
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerPercentageForProposalExecution,
        uint256 _votingPowerPercentageForProposalCreation,
        uint256 _votingPowerPercentageForInstantProposalExecution,
        string memory _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        uint256 _lockTime,
        address _permissionRegistry
    ) public override initializer {
        super.initialize(
            _token,
            _proposalTime,
            _timeForExecution,
            _votingPowerPercentageForProposalExecution,
            _votingPowerPercentageForProposalCreation,
            _votingPowerPercentageForInstantProposalExecution,
            _name,
            _voteGas,
            _maxGasPrice,
            _maxActiveProposals,
            _lockTime,
            _permissionRegistry
        );
        permissionRegistry.setETHPermission(address(this), _token, bytes4(keccak256("mint(address,uint256)")), 0, true);
        permissionRegistry.setETHPermission(address(this), _token, bytes4(keccak256("burn(address,uint256)")), 0, true);
    }

    /// @dev Set the voting power to vote in a proposal
    /// @param proposalId The id of the proposal to set the vote
    /// @param option The proposal option to be voted
    /// @param votingPower The votingPower to use in the proposal
    function setVote(
        bytes32 proposalId,
        uint256 option,
        uint256 votingPower
    ) public virtual override {
        require(
            proposals[proposalId].endTime > block.timestamp,
            "SnapshotRepERC20Guild: Proposal ended, cannot be voted"
        );
        require(
            (votingPowerOfAt(msg.sender, proposalsSnapshots[proposalId]) >= votingPower) &&
                (votingPower > proposalVotes[proposalId][msg.sender].votingPower),
            "SnapshotRepERC20Guild: Invalid votingPower amount"
        );
        require(
            (proposalVotes[proposalId][msg.sender].option == 0 &&
                proposalVotes[proposalId][msg.sender].votingPower == 0) ||
                (proposalVotes[proposalId][msg.sender].option == option),
            "SnapshotRepERC20Guild: Cannot change option voted"
        );
        _setVote(msg.sender, proposalId, option, votingPower);
    }

    /// @dev Set the voting power to vote in a proposal using a signed vote
    /// @param proposalId The id of the proposal to set the vote
    /// @param option The proposal option to be voted
    /// @param votingPower The votingPower to use in the proposal
    /// @param voter The address of the voter
    /// @param signature The signature of the hashed vote
    function setSignedVote(
        bytes32 proposalId,
        uint256 option,
        uint256 votingPower,
        address voter,
        bytes memory signature
    ) public virtual override {
        require(
            proposals[proposalId].endTime > block.timestamp,
            "SnapshotRepERC20Guild: Proposal ended, cannot be voted"
        );
        bytes32 hashedVote = hashVote(voter, proposalId, option, votingPower);
        require(!signedVotes[hashedVote], "SnapshotRepERC20Guild: Already voted");
        require(voter == hashedVote.toEthSignedMessageHash().recover(signature), "SnapshotRepERC20Guild: Wrong signer");
        signedVotes[hashedVote] = true;
        require(
            (votingPowerOfAt(voter, proposalsSnapshots[proposalId]) >= votingPower) &&
                (votingPower > proposalVotes[proposalId][voter].votingPower),
            "SnapshotRepERC20Guild: Invalid votingPower amount"
        );
        require(
            (proposalVotes[proposalId][voter].option == 0 && proposalVotes[proposalId][voter].votingPower == 0) ||
                (proposalVotes[proposalId][voter].option == option),
            "SnapshotRepERC20Guild: Cannot change option voted, only increase votingPower"
        );
        _setVote(voter, proposalId, option, votingPower);
    }

    /// @dev Override and disable lock of tokens, not needed in SnapshotRepERC20Guild
    function lockTokens(uint256) external virtual override {
        revert("SnapshotRepERC20Guild: token vault disabled");
    }

    /// @dev Override and disable withdraw of tokens, not needed in SnapshotRepERC20Guild
    function withdrawTokens(uint256) external virtual override {
        revert("SnapshotRepERC20Guild: token vault disabled");
    }

    /// @dev Create a proposal with an static call data and extra information
    /// @param to The receiver addresses of each call to be executed
    /// @param data The data to be executed on each call to be executed
    /// @param value The ETH value to be sent on each call to be executed
    /// @param totalOptions The amount of options that would be offered to the voters
    /// @param title The title of the proposal
    /// @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        uint256 totalOptions,
        string memory title,
        string memory contentHash
    ) public virtual override returns (bytes32) {
        bytes32 proposalId = super.createProposal(to, data, value, totalOptions, title, contentHash);
        proposalsSnapshots[proposalId] = ERC20SnapshotRep(address(token)).getCurrentSnapshotId();
        return proposalId;
    }

    /// @dev Reverts if proposal cannot be executed
    /// @param proposalId The id of the proposal to evaluate
    /// @param highestVoteAmount The amounts of votes received by the currently winning proposal option.
    function checkProposalExecutionState(bytes32 proposalId, uint256 highestVoteAmount) internal view override {
        require(!isExecutingProposal, "ERC20Guild: Proposal under execution");
        require(proposals[proposalId].state == ProposalState.Active, "ERC20Guild: Proposal already executed");

        uint256 totalSupply = ERC20SnapshotRep(address(token)).totalSupplyAt(getProposalSnapshotId(proposalId));
        uint256 approvalRate = (highestVoteAmount * BASIS_POINT_MULTIPLIER) / totalSupply;
        if (
            votingPowerPercentageForInstantProposalExecution == 0 ||
            approvalRate < votingPowerPercentageForInstantProposalExecution
        ) {
            require(proposals[proposalId].endTime < block.timestamp, "ERC20Guild: Proposal hasn't ended yet");
        }
    }

    function getWinningOption(bytes32 proposalId)
        internal
        view
        override
        returns (uint256 winningOption, uint256 highestVoteAmount)
    {
        Proposal storage proposal = proposals[proposalId];
        highestVoteAmount = proposal.totalVotes[0];
        uint256 votingPowerForProposalExecution = getSnapshotVotingPowerForProposalExecution(proposalId);
        uint256 totalOptions = proposal.totalVotes.length;
        for (uint256 i = 1; i < totalOptions; i++) {
            uint256 totalVotesOptionI = proposal.totalVotes[i];
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

    /// @dev Get the voting power of multiple addresses at a certain snapshotId
    /// @param accounts The addresses of the accounts
    /// @param snapshotIds The snapshotIds to be used
    function votingPowerOfMultipleAt(address[] memory accounts, uint256[] memory snapshotIds)
        external
        view
        virtual
        returns (uint256[] memory)
    {
        uint256[] memory votes = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) votes[i] = votingPowerOfAt(accounts[i], snapshotIds[i]);
        return votes;
    }

    /// @dev Get the voting power of an address at a certain snapshotId
    /// @param account The address of the account
    /// @param snapshotId The snapshotId to be used
    function votingPowerOfAt(address account, uint256 snapshotId) public view virtual returns (uint256) {
        return ERC20SnapshotRep(address(token)).balanceOfAt(account, snapshotId);
    }

    /// @dev Get the voting power of an account
    /// @param account The address of the account
    function votingPowerOf(address account) public view virtual override returns (uint256) {
        return ERC20SnapshotRep(address(token)).balanceOf(account);
    }

    /// @dev Get the proposal snapshot id
    function getProposalSnapshotId(bytes32 proposalId) public view returns (uint256) {
        return proposalsSnapshots[proposalId];
    }

    /// @dev Get the totalLocked
    function getTotalLocked() public view virtual override returns (uint256) {
        return ERC20SnapshotRep(address(token)).totalSupply();
    }

    /// @dev Get minimum amount of votingPower needed for proposal execution
    function getSnapshotVotingPowerForProposalExecution(bytes32 proposalId) public view virtual returns (uint256) {
        uint256 totalSupply = ERC20SnapshotRep(address(token)).totalSupplyAt(getProposalSnapshotId(proposalId));
        return (totalSupply * votingPowerPercentageForProposalExecution) / BASIS_POINT_MULTIPLIER;
    }
}
