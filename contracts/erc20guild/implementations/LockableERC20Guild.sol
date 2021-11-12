// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "../ERC20Guild.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "../../utils/TokenVault.sol";

// @title LockableERC20Guild
// @author github:AugustoL
contract LockableERC20Guild is ERC20Guild {
    using SafeMathUpgradeable for uint256;
    
    uint256 public lockTime;
    uint256 public totalLocked;
    TokenVault public tokenVault;
    
    // The tokens locked indexed by token holder address.
    struct TokenLock {
        uint256 amount;
        uint256 timestamp;
    }
    mapping(address => TokenLock) public tokensLocked;
    
    event TokensLocked(address voter, uint256 value);
    event TokensReleased(address voter, uint256 value);
    
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
    // @param _lockTime The minimum amount of seconds that the tokens would be locked
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
        address _permissionRegistry,
        uint256 _lockTime
    ) public initializer {
        require(
            address(_token) != address(0),
            "LockableERC20Guild: token is the zero address"
        );
        require(
            lockTime > 0,
            "LockableERC20Guild: lockTime should be higher than zero"
        );
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
        tokenVault = new TokenVault();
        tokenVault.initialize(address(token), address(this));
        lockTime = _lockTime;
        permissionRegistry.setPermission(
            address(0),
            address(this),
            bytes4(keccak256("setLockTime(uint256)")),
            0,
            true
        );
        initialized = true;
    }
    
    // @dev Set LockableERC20Guild lock time value
    // @param _lockTime The minimum amount of seconds that the tokens would be locked
    function setLockTime(uint256 _lockTime) public isInitialized {
        require(
            msg.sender == address(this),
            "LockableERC20Guild: Only the guild can set the lock time config"
        );
        lockTime = _lockTime;

    }
    
    // @dev Lock tokens in the guild to be used as voting power
    // @param tokenAmount The amount of tokens to be locked
    function lockTokens(uint256 tokenAmount) public virtual {
        tokenVault.deposit(msg.sender, tokenAmount);
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.add(
            tokenAmount
        );
        tokensLocked[msg.sender].timestamp = block.timestamp.add(lockTime);
        totalLocked = totalLocked.add(tokenAmount);
        emit TokensLocked(msg.sender, tokenAmount);
    }

    // @dev Release tokens locked in the guild, this will decrease the voting power
    // @param tokenAmount The amount of tokens to be released
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

    // @dev Get the voting power of an account
    // @param account The address of the account
    function votingPowerOf(address account) public override view returns (uint256) {
        return tokensLocked[account].amount;
    }
    
    // @dev Get minimum amount of votingPower needed for creation
    function getVotingPowerForProposalCreation()
        public
        override
        view
        virtual
        returns (uint256)
    {
        return totalLocked.mul(votingPowerForProposalCreation).div(10000);
    }

    // @dev Get minimum amount of votingPower needed for proposal execution
    function getVotingPowerForProposalExecution()
        public
        override
        view
        virtual
        returns (uint256)
    {
      return totalLocked.mul(votingPowerForProposalExecution).div(10000);
    }
}
