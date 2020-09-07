// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.5.17;
pragma experimental ABIEncoderV2;

import "./ERC20Guild.sol";

/// @title ERC20GuildLockable
/// @author github:AugustoL
/// @notice This smart contract has not be audited.
/// @dev Extends an ERC20Guild to vote only with locked tokens
/// The votes used in the proposals equals the amount of tokens locked by the voter.
/// The tokens can be released back to the voter after a lock time measured in seconds.
contract ERC20GuildLockable is ERC20Guild {

    struct TokenLock {
      uint256 amount;
      uint256 timestamp;
    }
    mapping(address => TokenLock) public tokensLocked;
    uint256 public totalLocked;
    
    uint256 public lockTime;

    event TokensLocked(address voter, uint256 tokens);
    event TokensReleased(address voter, uint256 tokens);

    /// @dev Initilizer
    /// @param _token The address of the token to be used, it is immutable and ca
    /// @param _minimumProposalTime The minimun time for a proposal to be under votation
    /// @param _tokensForExecution The token votes needed for a proposal to be executed
    /// @param _tokensForCreation The minimum balance of tokens needed to create a proposal
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    function initialize(
        address _token,
        uint256 _minimumProposalTime,
        uint256 _tokensForExecution,
        uint256 _tokensForCreation,
        uint256 _lockTime
    ) public {
        require(_lockTime > 0, "ERC20Guild: lockTime should be higher than zero");
        
        super.initialize(_token, _minimumProposalTime, _tokensForExecution, _tokensForCreation);
        lockTime = _lockTime;
    }

    /// @dev Set the ERC20Guild configuration, can be callable only executing a proposal
    /// or when it is initilized
    /// @param _minimumProposalTime The minimun time for a proposal to be under votation
    /// @param _tokensForExecution The token votes needed for a proposal to be executed
    /// @param _tokensForCreation The minimum balance of tokens needed to create a proposal
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    function setConfig(
        uint256 _minimumProposalTime,
        uint256 _tokensForExecution,
        uint256 _tokensForCreation,
        uint256 _lockTime
    ) public {
        require(_lockTime > 0, "ERC20Guild: lockTime should be higher than zero");
        super.setConfig(_minimumProposalTime, _tokensForExecution, _tokensForCreation);
        lockTime = _lockTime;
    }
    
    /// @dev Returns the staked tokens for the address that calls the function
    /// @param tokens The amount of tokens to be locked
    function lockTokens(uint256 tokens) public {
        token.transferFrom(msg.sender, address(this), tokens);
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.add(tokens);
        tokensLocked[msg.sender].timestamp = block.timestamp.add(lockTime);
        totalLocked = totalLocked.add(tokens);
        emit TokensLocked(msg.sender, tokens);
    }

    /// @dev Returns the staked tokens for the address that calls the function
    /// @param tokens The amount of tokens to be released
    function releaseTokens(uint256 tokens) public {
        require(votesOf(msg.sender) >= tokens);
        require(tokensLocked[msg.sender].timestamp > block.timestamp);
        token.transfer(msg.sender, tokens);
        tokensLocked[msg.sender].amount = tokensLocked[msg.sender].amount.sub(tokens);
        totalLocked = totalLocked.sub(tokens);
        emit TokensReleased(msg.sender, tokens);
    }
    
    /// @dev Get the ERC20 token balance of an address
    /// @param holder The address of the token holder
    function votesOf(address holder) internal view returns(uint256) {
        return tokensLocked[msg.sender].amount;
    }

}
