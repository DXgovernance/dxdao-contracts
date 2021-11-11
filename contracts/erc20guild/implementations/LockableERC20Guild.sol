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
    // @param _token The address of the token to be used
    // @param _proposalTime The minimun time for a proposal to be under votation
    // @param _timeForExecution The amount of time that has a proposal has to be executed before being ended
    // @param _votingPowerForProposalExecution The percentage of voting power needed in a proposal to be executed
    // @param _votingPowerForProposalCreation The percentage of voting power needed to create a proposal
    // @param _name The the guild name
    // @param _voteGas The gas to be used to calculate the vote gas refund
    // @param _maxGasPrice The maximum gas price to be refunded
    // @param _maxActiveProposals The maximum number of proposals to be in submitted state
    // @param _permissionDelay The amount of seconds that are going to be added over the timestamp of the block when
    // a permission is allowed
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
        uint256 _permissionDelay,
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

    // @dev Get the voting power of an accont
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
