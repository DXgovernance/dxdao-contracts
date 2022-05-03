import { waitBlocks } from "./wait";

/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");
const { default: BigNumber } = require("bignumber.js");

export async function deployTokens(deploymentConfig, accounts) {
  const ERC20 = await hre.artifacts.require("ERC20");
  const ERC20SnapshotRep = await hre.artifacts.require("ERC20SnapshotRep");

  let tokens = {};
  let addresses = {};
  // await Promise.all(
  // deploymentConfig.tokens.map(async tokenToDeploy => {

  for (i in deploymentConfig.token) {
    const tokenToDeploy = deploymentConfig.token[i];
    console.log("Deploying token", tokenToDeploy.name, tokenToDeploy.symbol);
    const totalSupply = tokenToDeploy.distribution.reduce(function (
      previous,
      current
    ) {
      return new BigNumber(previous).plus(current.amount.toString());
    },
    0);

    let newToken;
    switch (tokenToDeploy.type) {
      case "ERC20":
        newToken = await ERC20.new(accounts[0], totalSupply.toString());
        await waitBlocks(1);
        for (i in tokenToDeploy.distribution) {
          const tokenHolder = tokenToDeploy.distribution[i];
          // await tokenToDeploy.distribution.map(async tokenHolder => {
          await newToken.transfer(tokenHolder.address, tokenHolder.amount);
          await waitBlocks(1);
        }
        break;
      case "ERC20SnapshotRep":
        newToken = await ERC20SnapshotRep.new();
        await newToken.initialize(tokenToDeploy.name, tokenToDeploy.symbol);
        await waitBlocks(1);

        for (i in tokenToDeploy.distribution) {
          const tokenHolder = tokenToDeploy.distribution[i];
          await newToken.mint(tokenHolder.address, tokenHolder.amount);
          await waitBlocks(1);
        }
        break;
    }
    tokens[tokenToDeploy.symbol] = newToken;
    addresses[tokenToDeploy.symbol] = newToken.address;
  }
  // );

  return { tokens, addresses };
}