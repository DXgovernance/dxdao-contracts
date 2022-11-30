# Solidity API

## ERC20Guild

### constructor

```solidity
constructor(address _token, uint256 _proposalTime, uint256 _votingPowerPercentageForProposalExecution, uint256 _votingPowerPercentageForProposalCreation, string _name, uint256 _lockTime, address _permissionRegistry) public
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address |  |
| _proposalTime | uint256 |  |
| _votingPowerPercentageForProposalExecution | uint256 |  |
| _votingPowerPercentageForProposalCreation | uint256 | The percentage of voting power in base 10000 needed to create a proposal |
| _name | string | The name of the ERC20Guild |
| _lockTime | uint256 | The minimum amount of seconds that the tokens would be locked |
| _permissionRegistry | address | The address of the permission registry contract to be used |

