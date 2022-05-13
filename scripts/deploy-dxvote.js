/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");

const moment = require("moment");

const { deployTokens } = require("./utils/deploy-tokens");
const { deployDao } = require("./utils/deploy-dao");
const { deployGuilds } = require("./utils/deploy-guilds");
const { doActions } = require("./utils/do-actions");

task("deploy-dxvote", "Deploy dxvote in localhost network")
  .addParam("deployconfig", "The deploy config json in string format")
  .setAction(async ({ deployconfig }) => {
    let addresses = {};

    // Parse string json config to json object
    const deploymentConfig = JSON.parse(deployconfig);

    if (deploymentConfig.tokens) {
      const tokensDeployment = await deployTokens(
        deploymentConfig.tokens,
        addresses
      );
      addresses = Object.assign(tokensDeployment.addresses, addresses);
    }

    if (deploymentConfig.dao) {
      const daoDeployment = await deployDao(deploymentConfig.dao, addresses);
      addresses = Object.assign(daoDeployment.addresses, addresses);
    }

    if (deploymentConfig.guilds) {
      const guildsDeployment = await deployGuilds(
        deploymentConfig.guilds,
        addresses
      );
      addresses = Object.assign(guildsDeployment.addresses, addresses);
    }

    // Do actions
    await doActions(deploymentConfig.actions, addresses);

    // Increase time to local time
    await hre.network.provider.request({
      method: "evm_increaseTime",
      params: [moment().unix() - (await web3.eth.getBlock("latest")).timestamp],
    });

    return { addresses };
  });
