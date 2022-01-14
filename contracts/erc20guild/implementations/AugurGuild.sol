// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "./GuardedERC20Guild.sol";
import "./MigratableERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

/*
  @title AugurGuild
  @author github:AugustoL
  @dev An ERC20Guild implementation for Augur
  The Augur ERC20Guild stores the address of the current Augur universe.
  The guid is migrateable, which means that the voting token can change.
  The guild can migrate the tokens only when the universe forks and a new reputation token is used.
  The migration can be executed by any user, but it can only execute once per fork.
*/
contract AugurGuild is GuardedERC20Guild, MigratableERC20Guild {
    using SafeMathUpgradeable for uint256;

    address public augurUniverse;

    // @dev Initilizer
    // @param _token The ERC20 token that will be used as source of voting power
    // @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    // @param _timeForExecution The amount of time in seconds that a proposal action will have to execute successfully
    // @param _votingPowerForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal
    // action
    // @param _votingPowerForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    // @param _voteGas The amount of gas in wei unit used for vote refunds
    // @param _maxGasPrice The maximum gas price used for vote refunds
    // @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    // @param _lockTime The minimum amount of seconds that the tokens would be locked
    // @param _permissionRegistry The address of the permission registry contract to be used
    // @param _augurUniverse The address of the augur universe smart contract
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        uint256 _votingPowerForProposalCreation,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint256 _maxActiveProposals,
        uint256 _lockTime,
        address _permissionRegistry,
        address _augurUniverse
    ) public initializer {
        initialize(
            _token,
            _proposalTime,
            _timeForExecution,
            _votingPowerForProposalExecution,
            _votingPowerForProposalCreation,
            "AugurGuild",
            _voteGas,
            _maxGasPrice,
            _maxActiveProposals,
            _lockTime,
            _permissionRegistry
        );
        augurUniverse = _augurUniverse;
    }

    // @dev Change the token vault used, this will change the voting token too, it can be called only once when
    // the fork happened
    // The token vault admin has to be the guild.
    // @param newTokenVault The address of the new token vault
    function changeTokenVault(address newTokenVault) public override virtual {
        require(msg.sender == guildGuardian, "AugurGuild: Only guardian can change the token vault");
        
        (bool getWinningChildUniverseSuccess, bytes memory getWinningChildUniverseData) = augurUniverse
            .call(abi.encodeWithSignature("getWinningChildUniverse()"));

        require(getWinningChildUniverseSuccess, "AugurGuild: No winning child universe");

        (address winningUniverse) = abi.decode(getWinningChildUniverseData, (address));

        (bool getReputationTokenSuccess, bytes memory getReputationTokenData) = winningUniverse
            .call(abi.encodeWithSignature("getReputationToken()"));

        require(getReputationTokenSuccess, "AugurGuild: Error getting reputation token");

        (address newToken) = abi.decode(getReputationTokenData, (address));

        tokenVault = TokenVault(newTokenVault);

        require(tokenVault.getToken() == newToken, "AugurGuild: Wrong new token address");
        require(tokenVault.getAdmin() == address(this), "AugurGuild: The vault admin has to be the guild");

        augurUniverse = winningUniverse;
        token = IERC20Upgradeable(newToken);
        lastMigrationTimestamp = block.timestamp;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Set override order of inherited implementations methods
    //////////////////////////////////////////////////////////////////////////////////////////////

    function endProposal(bytes32 proposalId) public override(GuardedERC20Guild, MigratableERC20Guild) {
        MigratableERC20Guild.endProposal(proposalId);
    }

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
    ) public override(ERC20Guild, GuardedERC20Guild) virtual initializer {
        GuardedERC20Guild.initialize(
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

    function lockTokens(uint256 tokenAmount) public override(ERC20Guild, MigratableERC20Guild) 
        virtual
    {
        MigratableERC20Guild.lockTokens(tokenAmount);
    }
    function withdrawTokens(uint256 tokenAmount) public override(ERC20Guild, MigratableERC20Guild)
        virtual
    {
        MigratableERC20Guild.withdrawTokens(tokenAmount);
    }

    function getVoterLockTimestamp(address voter) public override(ERC20Guild, MigratableERC20Guild)
        view returns(uint256)
    {
        return MigratableERC20Guild.getVoterLockTimestamp(voter);
    }
    function getTotalLocked() public override(ERC20Guild, MigratableERC20Guild)
        view returns(uint256)
    {
        return MigratableERC20Guild.getTotalLocked();
    }
    function votingPowerOf(address account) public override(ERC20Guild, MigratableERC20Guild)
        view virtual returns (uint256)
    {
        return MigratableERC20Guild.votingPowerOf(account);
    }


}
