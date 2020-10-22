# DXdao-contracts

Repository with all the smart contracts of DXdao governance, it keeps track of the contracts that are deployed on mainnet, allowing the test of new features with the same code used on mainnet.

## Contracts

All the contracts are organized in different folders:
- daostack: The smart contracts from daostack, the most important contract here is GenesisProtocol, which is used as voting machine for the schemes.
- dxdao: This are the contracts taken from the DXdao deployed in mainnet, all of them copy pasted and with their entire inline code from the verified contracts in etherscan.
- erc20guild: The smart contracts of a guild that uses an ERC20 as voting reputation for their decisions, a very simple organization and efficient organization.
- globalConstraints: The smart contracts related with global constraints, it only has the GlobalConstraintInterface contract.
- schemes: The smart contracts for the schemes used in the organization.
- utils: The smart contracts used to facilitate and automate the deployment of the DXdao.
- votingMachines: The smart contracts to be used by the schemes to communicate with the voting machines.

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
