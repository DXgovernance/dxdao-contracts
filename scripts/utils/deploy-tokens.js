require("@nomiclabs/hardhat-web3");
const { default: BigNumber } = require("bignumber.js");

export async function deployTokens(tokens, networkContracts) {
  const ERC20Mock = await hre.artifacts.require("ERC20Mock");
  const ERC20SnapshotRep = await hre.artifacts.require("ERC20SnapshotRep");

  const accounts = await web3.eth.getAccounts();

  for (const tokenToDeploy of tokens) {
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
        for (const tokenHolder of tokenToDeploy.distribution) {
          await newToken.transfer(tokenHolder.address, tokenHolder.amount);
        }
        break;
      case "ERC20SnapshotRep":
        newToken = await ERC20SnapshotRep.new();
        await newToken.initialize(tokenToDeploy.name, tokenToDeploy.symbol);

        for (const tokenHolder of tokenToDeploy.distribution) {
          await newToken.mint(tokenHolder.address, tokenHolder.amount);
        }
        break;
    }
    networkContracts.addresses[tokenToDeploy.symbol] = newToken.address;
  }

  return networkContracts;
}
