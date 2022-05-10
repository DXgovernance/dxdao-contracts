import { waitBlocks } from "./wait";

require("@nomiclabs/hardhat-web3");
const { default: BigNumber } = require("bignumber.js");

export async function deployTokens(deploymentConfig, accounts) {
  const ERC20Mock = await hre.artifacts.require("ERC20Mock");
  const ERC20SnapshotRep = await hre.artifacts.require("ERC20SnapshotRep");

  let tokens = {};
  let addresses = {};

  for (const tokenToDeploy of deploymentConfig.tokens) {
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
        newToken = await ERC20Mock.new(
          accounts[0],
          totalSupply,
          tokenToDeploy.name,
          tokenToDeploy.symbol,
          tokenToDeploy.decimals
        );
        // await waitBlocks(1);
        for (const tokenHolder of tokenToDeploy.distribution) {
          // await tokenToDeploy.distribution.map(async tokenHolder => {
          await newToken.transfer(tokenHolder.address, tokenHolder.amount);
          // await waitBlocks(1);
        }
        break;
      case "ERC20SnapshotRep":
        newToken = await ERC20SnapshotRep.new();
        await newToken.initialize(tokenToDeploy.name, tokenToDeploy.symbol);
        // await waitBlocks(1);

        for (const tokenHolder of tokenToDeploy.distribution) {
          await newToken.mint(tokenHolder.address, tokenHolder.amount);
          // await waitBlocks(1);
        }
        break;
    }
    tokens[tokenToDeploy.symbol] = newToken;
    addresses[tokenToDeploy.symbol] = newToken.address;
  }

  return { tokens, addresses };
}
