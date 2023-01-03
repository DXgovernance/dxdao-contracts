# Solidity API

## ERC20GuildUpgradeable

### initialize

```solidity
function initialize(address _token, uint256 _proposalTime, uint256 _timeForExecution, uint256 _votingPowerPercentageForProposalExecution, uint256 _votingPowerPercentageForProposalCreation, string _name, uint256 _voteGas, uint256 _maxGasPrice, uint256 _maxActiveProposals, uint256 _lockTime, address _permissionRegistry) public virtual
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address |  |
| _proposalTime | uint256 |  |
| _timeForExecution | uint256 |  |
| _votingPowerPercentageForProposalExecution | uint256 |  |
| _votingPowerPercentageForProposalCreation | uint256 | The percentage of voting power in base 10000 needed to create a proposal |
| _name | string | The name of the ERC20Guild |
| _voteGas | uint256 | The amount of gas in wei unit used for vote refunds |
| _maxGasPrice | uint256 | The maximum gas price used for vote refunds |
| _maxActiveProposals | uint256 | The maximum amount of proposals to be active at the same time |
| _lockTime | uint256 | The minimum amount of seconds that the tokens would be locked |
| _permissionRegistry | address | The address of the permission registry contract to be used |

