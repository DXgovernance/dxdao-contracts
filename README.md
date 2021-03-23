# DXdao-contracts

Repository with all the smart contracts of DXdao governance, it keeps track of the contracts that are deployed on mainnet, allowing the test of new features with the same code used on mainnet.


## Contracts

All the contracts are organized in different folders:
- daostack: The smart contracts from daostack release version that was used at the moment of DXdao contracts deployment, they, taken from https://github.com/daostack/arc/releases/tag/0.0.1-rc.19.
- dxdao: This are the smart contracts of the DXdao deployed in mainnet, taken from https://github.com/gnosis/dx-daostack. It also has the DXD guild and DXD voting machine that will be used in DXdao gov 1.x.
- erc20guild: The smart contracts of a guild that uses an ERC20 as voting reputation for their decisions, a very simple organization and efficient organization.
- schemes: The smart contracts of the schemes used in DXdao gov 1.x, which are all WalletSchemes that use a PermissionRegistry to execute only previously allowed calls.
- utils: The smart contracts used to facilitate and automate the deployment of the DXdao.

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
