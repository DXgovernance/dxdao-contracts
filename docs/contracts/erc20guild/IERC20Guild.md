# Solidity API

## IERC20Guild

### ProposalStateChanged

```solidity
event ProposalStateChanged(bytes32 proposalId, uint256 newState)
```

### VoteAdded

```solidity
event VoteAdded(bytes32 proposalId, address voter, uint256 votingPower)
```

### SetAllowance

```solidity
event SetAllowance(address to, bytes4 functionSignature, bool allowance)
```

### ProposalState

```solidity
enum ProposalState {
  None,
  Active,
  Rejected,
  Executed,
  Failed
}

```

### Vote

```solidity
struct Vote {
  uint256 action;
  uint256 votingPower;
}

```

### Proposal

```solidity
struct Proposal {
  address creator;
  uint256 startTime;
  uint256 endTime;
  address[] to;
  bytes[] data;
  uint256[] value;
  string title;
  string contentHash;
  enum IERC20Guild.ProposalState state;
  uint256[] totalVotes;
}
```

### fallback

```solidity
fallback() external payable
```

### receive

```solidity
receive() external payable
```

### initialize

```solidity
function initialize(address _token, uint256 _proposalTime, uint256 _timeForExecution, uint256 _votingPowerForProposalExecution, uint256 _votingPowerForProposalCreation, string _name, uint256 _voteGas, uint256 _maxGasPrice, uint256 _maxActiveProposals, uint256 _lockTime, address _permissionRegistry) external
```

### setConfig

```solidity
function setConfig(uint256 _proposalTime, uint256 _timeForExecution, uint256 _votingPowerForProposalExecution, uint256 _votingPowerForProposalCreation, uint256 _voteGas, uint256 _maxGasPrice, uint256 _maxActiveProposals, uint256 _lockTime, address _permissionRegistry) external
```

### setPermission

```solidity
function setPermission(address[] asset, address[] to, bytes4[] functionSignature, uint256[] valueAllowed, bool[] allowance) external
```

### setPermissionDelay

```solidity
function setPermissionDelay(uint256 permissionDelay) external
```

### createProposal

```solidity
function createProposal(address[] to, bytes[] data, uint256[] value, uint256 totalActions, string title, string contentHash) external returns (bytes32)
```

### endProposal

```solidity
function endProposal(bytes32 proposalId) external
```

### setVote

```solidity
function setVote(bytes32 proposalId, uint256 action, uint256 votingPower) external
```

### setVotes

```solidity
function setVotes(bytes32[] proposalIds, uint256[] actions, uint256[] votingPowers) external
```

### setSignedVote

```solidity
function setSignedVote(bytes32 proposalId, uint256 action, uint256 votingPower, address voter, bytes signature) external
```

### setSignedVotes

```solidity
function setSignedVotes(bytes32[] proposalIds, uint256[] actions, uint256[] votingPowers, address[] voters, bytes[] signatures) external
```

### lockTokens

```solidity
function lockTokens(uint256 tokenAmount) external
```

### withdrawTokens

```solidity
function withdrawTokens(uint256 tokenAmount) external
```

### votingPowerOf

```solidity
function votingPowerOf(address account) external view returns (uint256)
```

### votingPowerOfMultiple

```solidity
function votingPowerOfMultiple(address[] accounts) external view returns (uint256[])
```

### getToken

```solidity
function getToken() external view returns (address)
```

### getPermissionRegistry

```solidity
function getPermissionRegistry() external view returns (address)
```

### getName

```solidity
function getName() external view returns (string)
```

### getProposalTime

```solidity
function getProposalTime() external view returns (uint256)
```

### getTimeForExecution

```solidity
function getTimeForExecution() external view returns (uint256)
```

### getVoteGas

```solidity
function getVoteGas() external view returns (uint256)
```

### getMaxGasPrice

```solidity
function getMaxGasPrice() external view returns (uint256)
```

### getMaxActiveProposals

```solidity
function getMaxActiveProposals() external view returns (uint256)
```

### getTotalProposals

```solidity
function getTotalProposals() external view returns (uint256)
```

### getTotalMembers

```solidity
function getTotalMembers() external view returns (uint256)
```

### getActiveProposalsNow

```solidity
function getActiveProposalsNow() external view returns (uint256)
```

### getMinimumMembersForProposalCreation

```solidity
function getMinimumMembersForProposalCreation() external view returns (uint256)
```

### getMinimumTokensLockedForProposalCreation

```solidity
function getMinimumTokensLockedForProposalCreation() external view returns (uint256)
```

### getSignedVote

```solidity
function getSignedVote(bytes32 signedVoteHash) external view returns (bool)
```

### getProposalsIds

```solidity
function getProposalsIds() external view returns (bytes32[])
```

### getTokenVault

```solidity
function getTokenVault() external view returns (address)
```

### getLockTime

```solidity
function getLockTime() external view returns (uint256)
```

### getTotalLocked

```solidity
function getTotalLocked() external view returns (uint256)
```

### getVoterLockTimestamp

```solidity
function getVoterLockTimestamp(address voter) external view returns (uint256)
```

### getProposal

```solidity
function getProposal(bytes32 proposalId) external view returns (struct IERC20Guild.Proposal)
```

### getProposalVotesOfVoter

```solidity
function getProposalVotesOfVoter(bytes32 proposalId, address voter) external view returns (uint256 action, uint256 votingPower)
```

### getVotingPowerForProposalCreation

```solidity
function getVotingPowerForProposalCreation() external view returns (uint256)
```

### getVotingPowerForProposalExecution

```solidity
function getVotingPowerForProposalExecution() external view returns (uint256)
```

### getFuncSignature

```solidity
function getFuncSignature(bytes data) external view returns (bytes4)
```

### getProposalsIdsLength

```solidity
function getProposalsIdsLength() external view returns (uint256)
```

### getEIP1271SignedHash

```solidity
function getEIP1271SignedHash(bytes32 _hash) external view returns (bool)
```

### isValidSignature

```solidity
function isValidSignature(bytes32 hash, bytes signature) external view returns (bytes4 magicValue)
```

### hashVote

```solidity
function hashVote(address voter, bytes32 proposalId, uint256 action, uint256 votingPower) external pure returns (bytes32)
```
