# Solidity API

## MigratableERC20Guild

### tokensLockedByVault

```solidity
mapping(address => mapping(address => struct BaseERC20Guild.TokenLock)) tokensLockedByVault
```

### totalLockedByVault

```solidity
mapping(address => uint256) totalLockedByVault
```

### lastMigrationTimestamp

```solidity
uint256 lastMigrationTimestamp
```

### constructor

```solidity
constructor(address _token, uint256 _proposalTime, uint256 _votingPowerForProposalExecution, uint256 _votingPowerForProposalCreation, string _name, uint256 _lockTime, address _permissionRegistry) public
```

### changeTokenVault

```solidity
function changeTokenVault(address newTokenVault) external virtual
```

### lockTokens

```solidity
function lockTokens(uint256 tokenAmount) external virtual
```

### withdrawTokens

```solidity
function withdrawTokens(uint256 tokenAmount) external virtual
```

### lockExternalTokens

```solidity
function lockExternalTokens(uint256 tokenAmount, address _tokenVault) external virtual
```

### withdrawExternalTokens

```solidity
function withdrawExternalTokens(uint256 tokenAmount, address _tokenVault) external virtual
```

### endProposal

```solidity
function endProposal(bytes32 proposalId) public virtual
```

### votingPowerOf

```solidity
function votingPowerOf(address account) public view virtual returns (uint256)
```

### getVoterLockTimestamp

```solidity
function getVoterLockTimestamp(address voter) public view virtual returns (uint256)
```

### getTotalLocked

```solidity
function getTotalLocked() public view virtual returns (uint256)
```
