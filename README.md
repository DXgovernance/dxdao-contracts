# DXdao-contracts

Repository with all the smart contracts of DXdao governance, it keeps track of the contracts that are deployed on mainnet, allowing the test of new features with the same code used on mainnet.


## Contracts

All the contracts are organized in different folders:

### Daostack

The smart contracts from daostack release version that was used at the moment of DXdao contracts deployment, they, taken from https://github.com/daostack/arc/releases/tag/0.0.1-rc.19.

### DXdao
These are the smart contracts of the DXdao deployed in mainnet, taken from https://github.com/gnosis/dx-daostack. It also has the DXD guild and DXD voting machine that will be used in DXdao gov 1.x.

### ERC20Guild
The smart contracts to add a very basic, efficient and flexible governance layer over an ERC20 token.

The guild executes previously authorized functions to smart contracts after a proposal to execute that function reaches the minimum amount of votes during a certain period of time.

- The guild can execute only allowed functions, this means that if you want to call function X to smart contract P you will need to first submit a proposal to add the function X to smart contract P to be added to the allowed functions.

- The votes of the guild are based on the ERC20 token balance **locked by the voter**, that means that the tokens need to be locked for a minimum period of time in order to be used as voting power.

- The voter only votes on a proposal with the voting power that had the moment in the proposal was created.

- A minimum amount of voting power can be required to create a proposal.

- A proposal has only "positive" votes and the votes can be changed during the proposal voting period, this means that if the voter is against the proposal it does not need to vote.

- The voter can vote on multiple proposals at the same time using different amount of voting power for each of them.

- The voter can sign a vote that can be executed by other account on his behalf.

- When a proposal is created it enters the voting period, once the voting period passes if it does not have enough votes it will be rejected, it if has enough votes and executes successfully his function during a execution period of time it will be be executed successfully, if during that period of time the approved proposal cant be executed it will be set as failed and wont be able to be executed again.

- The guild can be configured to automatically pay the voting costs back to the voter, for this the vote gas a max gas price to be use for vote refund needs to be set.

- Each proposal has a description and a content hash that can be used to refer off-chain information.

### Schemes
The smart contracts for the schemes used in DXdao gov 1.x.

### Utils
The smart contracts used to facilitate and automate the deployment of the DXdao.

## Install

`npm install`

## Test

`npm test`

or 

`npx buidler test` to run via https://buidler.dev/

## Coverage

`truffle run coverage`

or

`npx buidler coverage`

When running coverage tests checks gas will fail: "Coverage distorts gas consumption. Tests that check exact gas consumption should be skipped."

https://github.com/sc-forks/solidity-coverage/blob/master/BUIDLER_README.md

## Migrate

### Get Reputation 

Get the initial reputation you want to use for migration with `getReputation` script.
```
node scripts/getReputation.js --network mainnet --repToken 0x7a927a93f221976aae26d5d077477307170f0b7c --fromBlock 7850172 --toBlock 10782410
```

### Deployment

The migrate script will deploy the same DXdao contracts that are deployed on mainnet with a main WalletScheme that will have all permissions, a quick WalletScheme to execute quick decisions with no controller permissions, an SchemeRegitrar that can manage schemes, constraints and upgrade the controller and a common ContributionReward scheme that can only execute generic calls.

Regarding VotingMachines the WalletScheme and QuickWalletScheme will use a DXDVotingMachine and SchemeRegistrar and ContributionReward scheme will use GenesisProtocol.

The parameters used in the schemes are the sames that are used on mainnet but with a quicker configuration to get boosted proposals passed in 1-3 days depending the scheme.

The migration can be executed with:

`npm run deploy -- --network kovan`
