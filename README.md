# DXdao-contracts

Repository with all the smart contracts of DXdao governance, it keeps track of the contracts that are deployed on mainnet, allowing the test of new features with the same code used on mainnet.

## Install

`npm install`

## Test

`npm test`

## Migrate

The migrate script will deploy the same DXdao contracts that are deployed on mainnet with a main WalletScheme that will have all permissions, a quick WalletScheme to execute quick decisions with no permissions, an SchemeRegitrar that can manage schemes, constraints and upgrade the controller and a commot ContributionReward scheme that can only execute generic calls.

`npm run migrate`
