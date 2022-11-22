# Solidity API

## BaseERC20Guild

### MAX_ACTIONS_PER_PROPOSAL

```solidity
uint8 MAX_ACTIONS_PER_PROPOSAL
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

### token

```solidity
contract IERC20Upgradeable token
```

### permissionRegistry

```solidity
contract PermissionRegistry permissionRegistry
```

### name

```solidity
string name
```

### proposalTime

```solidity
uint256 proposalTime
```

### timeForExecution

```solidity
uint256 timeForExecution
```

### votingPowerForProposalExecution

```solidity
uint256 votingPowerForProposalExecution
```

### votingPowerForProposalCreation

```solidity
uint256 votingPowerForProposalCreation
```

### voteGas

```solidity
uint256 voteGas
```

### maxGasPrice

```solidity
uint256 maxGasPrice
```

### maxActiveProposals

```solidity
uint256 maxActiveProposals
```

### totalProposals

```solidity
uint256 totalProposals
```

### totalMembers

```solidity
uint256 totalMembers
```

### activeProposalsNow

```solidity
uint256 activeProposalsNow
```

### lockTime

```solidity
uint256 lockTime
```

### totalLocked

```solidity
uint256 totalLocked
```

### minimumMembersForProposalCreation

```solidity
uint256 minimumMembersForProposalCreation
```

### minimumTokensLockedForProposalCreation

```solidity
uint256 minimumTokensLockedForProposalCreation
```

### tokenVault

```solidity
contract TokenVault tokenVault
```

### TokenLock

```solidity
struct TokenLock {
  uint256 amount;
  uint256 timestamp;
}

```

### tokensLocked

```solidity
mapping(address => struct BaseERC20Guild.TokenLock) tokensLocked
```

### signedVotes

```solidity
mapping(bytes32 => bool) signedVotes
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
  enum BaseERC20Guild.ProposalState state;
  uint256[] totalVotes;
}
```

### proposalVotes

```solidity
mapping(bytes32 => mapping(address => struct BaseERC20Guild.Vote)) proposalVotes
```

### proposals

```solidity
mapping(bytes32 => struct BaseERC20Guild.Proposal) proposals
```

### proposalsIds

```solidity
bytes32[] proposalsIds
```

### ProposalStateChanged

```solidity
event ProposalStateChanged(bytes32 proposalId, uint256 newState)
```

### VoteAdded

```solidity
event VoteAdded(bytes32 proposalId, uint256 action, address voter, uint256 votingPower)
```

### TokensLocked

```solidity
event TokensLocked(address voter, uint256 value)
```

### TokensWithdrawn

```solidity
event TokensWithdrawn(address voter, uint256 value)
```

### isExecutingProposal

```solidity
bool isExecutingProposal
```

### fallback

```solidity
fallback() external payable
```

### setConfig

```solidity
function setConfig(uint256 _proposalTime, uint256 _timeForExecution, uint256 _votingPowerForProposalExecution, uint256 _votingPowerForProposalCreation, uint256 _voteGas, uint256 _maxGasPrice, uint256 _maxActiveProposals, uint256 _lockTime, uint256 _minimumMembersForProposalCreation, uint256 _minimumTokensLockedForProposalCreation) external virtual
```

### createProposal

```solidity
function createProposal(address[] to, bytes[] data, uint256[] value, uint256 totalActions, string title, string contentHash) public virtual returns (bytes32)
```

### endProposal

```solidity
function endProposal(bytes32 proposalId) public virtual
```

### setVote

```solidity
function setVote(bytes32 proposalId, uint256 action, uint256 votingPower) public virtual
```

### setSignedVote

```solidity
function setSignedVote(bytes32 proposalId, uint256 action, uint256 votingPower, address voter, bytes signature) public virtual
```

### lockTokens

```solidity
function lockTokens(uint256 tokenAmount) external virtual
```

### withdrawTokens

```solidity
function withdrawTokens(uint256 tokenAmount) external virtual
```

### \_setVote

```solidity
function _setVote(address voter, bytes32 proposalId, uint256 action, uint256 votingPower) internal
```

### getProposal

```solidity
function getProposal(bytes32 proposalId) external view virtual returns (struct BaseERC20Guild.Proposal)
```

### votingPowerOf

```solidity
function votingPowerOf(address account) public view virtual returns (uint256)
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
function getMaxActiveProposals() public view returns (uint256)
```

### getTotalProposals

```solidity
function getTotalProposals() external view returns (uint256)
```

### getTotalMembers

```solidity
function getTotalMembers() public view returns (uint256)
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

### getProposalVotesOfVoter

```solidity
function getProposalVotesOfVoter(bytes32 proposalId, address voter) external view virtual returns (uint256 action, uint256 votingPower)
```

### getVotingPowerForProposalCreation

```solidity
function getVotingPowerForProposalCreation() public view virtual returns (uint256)
```

### getVotingPowerForProposalExecution

```solidity
function getVotingPowerForProposalExecution() public view virtual returns (uint256)
```

### getProposalsIdsLength

```solidity
function getProposalsIdsLength() external view virtual returns (uint256)
```

### getTokenVault

```solidity
function getTokenVault() external view virtual returns (address)
```

### getLockTime

```solidity
function getLockTime() external view virtual returns (uint256)
```

### getTotalLocked

```solidity
function getTotalLocked() public view virtual returns (uint256)
```

### getVoterLockTimestamp

```solidity
function getVoterLockTimestamp(address voter) public view virtual returns (uint256)
```

### hashVote

```solidity
function hashVote(address voter, bytes32 proposalId, uint256 action, uint256 votingPower) public pure virtual returns (bytes32)
```
