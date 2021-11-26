// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "../ERC20Guild.sol";

/*
  @title MigratableERC20Guild
  @author github:AugustoL
  @dev An ERC20Guild that can migrate from one ERC20 voting token to another by changing token vault
*/
contract MigratableERC20Guild is ERC20Guild {
    using SafeMathUpgradeable for uint256;

    // The tokens locked indexed by token holder address.
    mapping(address => mapping(address => TokenLock)) tokensLockedByVault;

    // The total amount of tokens locked
    mapping(address => uint256) totalLockedByVault;

    uint256 public lastMigrationTimestamp;

    // @dev Change the token vault used, this will change the voting token too.
    // The token vault admin has to be the guild.
    // @param newTokenVault The address of the new token vault
    function changeTokenVault(address newTokenVault) public virtual {
        require(msg.sender == address(this), "MigratableERC2Guild: The vault can be changed only by the guild");
        tokenVault = TokenVault(newTokenVault);
        require(tokenVault.getAdmin() == address(this), "MigratableERC2Guild: The vault admin has to be the guild");
        token = IERC20Upgradeable(tokenVault.getToken());
        lastMigrationTimestamp = block.timestamp;
    }
    
    // @dev Lock tokens in the guild to be used as voting power in the official vault
    // @param tokenAmount The amount of tokens to be locked
    function lockTokens(uint256 tokenAmount) public override virtual {
        tokenVault.deposit(msg.sender, tokenAmount);
        tokensLockedByVault[address(tokenVault)][msg.sender].amount = tokensLockedByVault[address(tokenVault)][msg.sender].amount
            .add(tokenAmount);
        tokensLockedByVault[address(tokenVault)][msg.sender].timestamp = block.timestamp.add(lockTime);
        totalLockedByVault[address(tokenVault)] = totalLockedByVault[address(tokenVault)].add(tokenAmount);
        emit TokensLocked(msg.sender, tokenAmount);
    }

    // @dev Withdraw tokens locked in the guild form the official vault, this will decrease the voting power
    // @param tokenAmount The amount of tokens to be withdrawn
    function withdrawTokens(uint256 tokenAmount) public override virtual {
        require(
            votingPowerOf(msg.sender) >= tokenAmount,
            "MigratableERC2Guild: Unable to withdraw more tokens than locked"
        );
        require(
            tokensLockedByVault[address(tokenVault)][msg.sender].timestamp < block.timestamp,
            "MigratableERC2Guild: Tokens still locked"
        );
        tokensLockedByVault[address(tokenVault)][msg.sender].amount = tokensLockedByVault[address(tokenVault)][msg.sender].amount
            .sub(tokenAmount);
        totalLockedByVault[address(tokenVault)] = totalLockedByVault[address(tokenVault)].sub(tokenAmount);
        tokenVault.withdraw(msg.sender, tokenAmount);
        emit TokensWithdrawn(msg.sender, tokenAmount);
    }

    // @dev Lock tokens in the guild to be used as voting power in an external vault
    // @param tokenAmount The amount of tokens to be locked
    // @param _tokenVault The token vault to be used
    function lockExternalTokens(uint256 tokenAmount, address _tokenVault) public virtual {
        require(
            address(tokenVault) != _tokenVault,
            "MigratableERC2Guild: Use default lockTokens(uint256) function to lock in official vault"
        );
        TokenVault(_tokenVault).deposit(msg.sender, tokenAmount);
        tokensLockedByVault[_tokenVault][msg.sender].amount = tokensLockedByVault[_tokenVault][msg.sender].amount
            .add(tokenAmount);
        tokensLockedByVault[_tokenVault][msg.sender].timestamp = block.timestamp.add(lockTime);
        totalLockedByVault[_tokenVault] = totalLockedByVault[_tokenVault].add(tokenAmount);
        emit TokensLocked(msg.sender, tokenAmount);
    }

    // @dev Withdraw tokens locked in the guild from an external vault
    // @param tokenAmount The amount of tokens to be withdrawn
    // @param _tokenVault The token vault to be used
    function withdrawExternalTokens(uint256 tokenAmount, address _tokenVault) public virtual {
        require(
            address(tokenVault) != _tokenVault,
            "MigratableERC2Guild: Use default withdrawTokens(uint256) function to withdraw from official vault"
        );
        require(
            tokensLockedByVault[_tokenVault][msg.sender].timestamp < block.timestamp,
            "MigratableERC2Guild: Tokens still locked"
        );
        tokensLockedByVault[_tokenVault][msg.sender].amount = tokensLockedByVault[_tokenVault][msg.sender].amount
            .sub(tokenAmount);
        totalLockedByVault[_tokenVault] = totalLockedByVault[_tokenVault].sub(tokenAmount);
        TokenVault(_tokenVault).withdraw(msg.sender, tokenAmount);
        emit TokensWithdrawn(msg.sender, tokenAmount);
    }

    // @dev Executes a proposal that is not votable anymore and can be finished
    // If this function is called by the guild guardian the proposal can end sooner after proposal endTime
    // If this function is not called by the guild guardian the proposal can end sooner after proposal endTime plus
    // the extraTimeForGuardian
    // @param proposalId The id of the proposal to be executed
    function endProposal(bytes32 proposalId) public override virtual {
        if (proposals[proposalId].startTime < lastMigrationTimestamp) {
            proposals[proposalId].state = ProposalState.Failed;
            emit ProposalStateChanged(proposalId, uint256(ProposalState.Failed));
        } else {
            super.endProposal(proposalId);
        }
    }
    
    // @dev Get the voting power of an account
    // @param account The address of the account
    function votingPowerOf(address account) public override view virtual returns (uint256) {
        return tokensLockedByVault[address(tokenVault)][account].amount;
    }

        // @dev Get the locked timestamp of a voter tokens
    function getVoterLockTimestamp(address voter) public override virtual view returns(uint256) {
        return tokensLockedByVault[address(tokenVault)][voter].timestamp;
    }

    // @dev Get the totalLocked
    function getTotalLocked() public override virtual view returns(uint256) {
        return totalLockedByVault[address(tokenVault)];
    }
}
