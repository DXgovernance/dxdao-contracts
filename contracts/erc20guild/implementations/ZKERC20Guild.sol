// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0;

import "../ERC20GuildUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";
import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import "../../utils/ERC721/ERC721SemaphoreRep.sol";
import "hardhat/console.sol";

/*
  @title ZKERC20Guild
  @author github:AugustoL
  1 vote equals 1 token
  1 voter owns multiple votes
  The votes are executed individually with ZK proofs shared off chain.
  The guild needs to be created with already minted tokens.
*/
contract ZKERC20Guild is ERC20GuildUpgradeable {
    using SafeMathUpgradeable for uint256;
    using MathUpgradeable for uint256;
    using ECDSAUpgradeable for bytes32;
    using AddressUpgradeable for address;
    using StringsUpgradeable for uint256;

    ISemaphore semaphore;

    /// @dev The sempahore group id of each proposal
    mapping(bytes32 => uint256) public proposalGroupIds;

    /// @dev Proposal id => Snapshot id
    mapping(bytes32 => uint256) public proposalsSnapshots;

    /// @dev Initializer
    /// @param _token The ERC20 token that will be used as source of voting power
    /// @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    /// @param _timeForExecution The amount of time in seconds that a proposal option will have to execute successfully
    /// @param _votingPowerPercentageForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal action
    /// @param _votingPowerPercentageForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    /// @param _name The name of the ERC20Guild
    /// @param _permissionRegistry The address of the permission registry contract to be used
    /// @param _semaphore The address of the Semaphore contract to be used
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerPercentageForProposalExecution,
        uint256 _votingPowerPercentageForProposalCreation,
        string memory _name,
        address _permissionRegistry,
        ISemaphore _semaphore
    ) public initializer {
        require(
            ERC721SemaphoreRep(_token).totalSupply() > 0,
            "ZKERC20Guild: Token total supply must be greater than 0"
        );
        super.initialize(
            _token,
            _proposalTime,
            _timeForExecution,
            _votingPowerPercentageForProposalExecution,
            _votingPowerPercentageForProposalCreation,
            _name,
            0,
            0,
            10,
            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff,
            _permissionRegistry
        );
        permissionRegistry.setETHPermission(address(this), _token, bytes4(keccak256("mint(address,uint256)")), 0, true);
        permissionRegistry.setETHPermission(
            address(this),
            _token,
            bytes4(keccak256("mintMultiple(address[],uint256[])")),
            0,
            true
        );
        permissionRegistry.setETHPermission(address(this), _token, bytes4(keccak256("burn(uint256,address)")), 0, true);
        permissionRegistry.setETHPermission(
            address(this),
            _token,
            bytes4(keccak256("burnMultiple(uint256[],address[])")),
            0,
            true
        );
        semaphore = _semaphore;
    }

    /// @dev Set the voting power to vote in a proposal
    /// @param proposalId The id of the proposal to set the vote
    /// @param option The proposal option to be voted
    /// @param merkleTreeRoot The merkle tree root of the semaphore group
    /// @param nullifierHash The nullifier hash root of the semaphore group
    /// @param proof The ZK proof of the vote
    function setVote(
        bytes32 proposalId,
        uint256 option,
        uint256 merkleTreeRoot,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) public {
        require(proposals[proposalId].endTime > block.timestamp, "ZKERC20Guild: Proposal ended, cannot be voted");

        // Verify ZK proof in semaphore
        semaphore.verifyProof(
            proposalGroupIds[proposalId],
            merkleTreeRoot,
            uint256ToBytes32(option),
            nullifierHash,
            proposalGroupIds[proposalId],
            proof
        );

        proposals[proposalId].totalVotes[option] = proposals[proposalId].totalVotes[option].add(1);

        emit VoteAdded(proposalId, option, address(0), 1);

        if (voteGas > 0) {
            uint256 gasRefund = voteGas.mul(tx.gasprice.min(maxGasPrice));

            if (address(this).balance >= gasRefund && !address(msg.sender).isContract()) {
                (bool success, ) = payable(msg.sender).call{value: gasRefund}("");
                require(success, "Failed to refund gas");
            }
        }
    }

    /// @dev Override and disable lock of tokens, not needed in ZKERC20Guild
    function lockTokens(uint256) external virtual override {
        revert("ZKERC20Guild: token vault disabled");
    }

    /// @dev Override and disable withdraw of tokens, not needed in ZKERC20Guild
    function withdrawTokens(uint256) external virtual override {
        revert("ZKERC20Guild: token vault disabled");
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
    ) public override returns (bytes32) {
        bytes32 proposalId = super.createProposal(to, data, value, totalOptions, title, contentHash);
        proposalsSnapshots[proposalId] = ERC721SemaphoreRep(address(token)).getCurrentSnapshotId();

        proposalGroupIds[proposalId] = totalProposals;
        semaphore.createGroup(proposalGroupIds[proposalId], 20, 0, address(this));
        uint256[] memory voteCommitments = ERC721SemaphoreRep(address(token)).getVoteCommitments();
        for (uint256 i = 0; i < voteCommitments.length; i++) {
            semaphore.addMember(proposalGroupIds[proposalId], voteCommitments[i]);
        }

        return proposalId;
    }

    /// @dev Executes a proposal that is not votable anymore and can be finished
    /// @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public override {
        require(!isExecutingProposal, "ZKERC20Guild: Proposal under execution");
        require(proposals[proposalId].state == ProposalState.Active, "ZKERC20Guild: Proposal already executed");
        require(proposals[proposalId].endTime < block.timestamp, "ZKERC20Guild: Proposal hasn't ended yet");

        uint256 winningOption = 0;
        uint256 highestVoteAmount = proposals[proposalId].totalVotes[0];
        uint256 i = 1;
        for (i = 1; i < proposals[proposalId].totalVotes.length; i++) {
            if (
                proposals[proposalId].totalVotes[i] >= getSnapshotVotingPowerForProposalExecution(proposalId) &&
                proposals[proposalId].totalVotes[i] >= highestVoteAmount
            ) {
                if (proposals[proposalId].totalVotes[i] == highestVoteAmount) {
                    winningOption = 0;
                } else {
                    winningOption = i;
                    highestVoteAmount = proposals[proposalId].totalVotes[i];
                }
            }
        }

        if (winningOption == 0) {
            proposals[proposalId].state = ProposalState.Rejected;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Rejected));
        } else if (proposals[proposalId].endTime.add(timeForExecution) < block.timestamp) {
            proposals[proposalId].state = ProposalState.Failed;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Failed));
        } else {
            proposals[proposalId].state = ProposalState.Executed;

            uint256 callsPerOption = proposals[proposalId].to.length.div(
                proposals[proposalId].totalVotes.length.sub(1)
            );
            i = callsPerOption.mul(winningOption.sub(1));
            uint256 endCall = i.add(callsPerOption);

            permissionRegistry.setERC20Balances();

            for (i; i < endCall; i++) {
                if (proposals[proposalId].to[i] != address(0) && proposals[proposalId].data[i].length > 0) {
                    bytes memory _data = proposals[proposalId].data[i];
                    bytes4 callDataFuncSignature;
                    assembly {
                        callDataFuncSignature := mload(add(_data, 32))
                    }
                    // The permission registry keeps track of all value transferred and checks call permission
                    try
                        permissionRegistry.setETHPermissionUsed(
                            address(this),
                            proposals[proposalId].to[i],
                            bytes4(callDataFuncSignature),
                            proposals[proposalId].value[i]
                        )
                    {} catch Error(string memory reason) {
                        revert(reason);
                    }

                    isExecutingProposal = true;
                    // We use isExecutingProposal variable to avoid re-entrancy in proposal execution
                    // slither-disable-next-line all
                    (bool success, ) = proposals[proposalId].to[i].call{value: proposals[proposalId].value[i]}(
                        proposals[proposalId].data[i]
                    );
                    require(success, "ZKERC20Guild: Proposal call failed");
                    isExecutingProposal = false;
                }
            }

            permissionRegistry.checkERC20Limits(address(this));

            emit ProposalStateChanged(proposalId, uint256(ProposalState.Executed));
        }
        activeProposalsNow = activeProposalsNow.sub(1);
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
        return ERC721SemaphoreRep(address(token)).balanceOfAt(account, snapshotId);
    }

    /// @dev Get the voting power of an account
    /// @param account The address of the account
    function votingPowerOf(address account) public view virtual override returns (uint256) {
        return ERC721SemaphoreRep(address(token)).balanceOf(account);
    }

    /// @dev Get the proposal snapshot id
    function getProposalSnapshotId(bytes32 proposalId) public view returns (uint256) {
        return proposalsSnapshots[proposalId];
    }

    /// @dev Get the totalLocked
    function getTotalLocked() public view virtual override returns (uint256) {
        return ERC721SemaphoreRep(address(token)).totalSupply();
    }

    /// @dev Get minimum amount of votingPower needed for proposal execution
    function getSnapshotVotingPowerForProposalExecution(bytes32 proposalId) public view virtual returns (uint256) {
        return
            ERC721SemaphoreRep(address(token))
                .totalSupplyAt(getProposalSnapshotId(proposalId))
                .mul(votingPowerPercentageForProposalExecution)
                .div(10000);
    }

    /// @dev Get the total votes of an option in a proposal
    /// @param proposalId The id of the proposal to get the information
    /// @param option The selected option
    /// @return totalVotesOfProposalOption The total votes in the proposal option
    function getProposalTotalVotesOfOption(bytes32 proposalId, uint256 option)
        external
        view
        virtual
        returns (uint256 totalVotesOfProposalOption)
    {
        return (proposals[proposalId].totalVotes[option]);
    }

    /// @dev Get the total votes in a proposal
    /// @param proposalId The id of the proposal to get the information
    /// @return totalVotesOfProposal The total votes in the proposal
    function getProposalTotalVotes(bytes32 proposalId) external view virtual returns (uint256 totalVotesOfProposal) {
        for (uint256 i = 0; i < proposals[proposalId].totalVotes.length; i++) {
            totalVotesOfProposal += proposals[proposalId].totalVotes[i];
        }
    }

    function uint256ToBytes32(uint256 uintNumber) public pure returns (bytes32 result) {
        bytes memory uintString = bytes(uintNumber.toString());
        if (uintString.length > 0) {
            assembly {
                result := mload(add(uintString, 32))
            }
        }
    }
}
