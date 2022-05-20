/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");

const moment = require("moment");

const { deployTokens } = require("./utils/deploy-tokens");
const {
  deployPermissionRegistry,
} = require("./utils/deploy-permissionRegistry");
const { deployGuildRegistry } = require("./utils/deploy-guildRegistry");
const { deployDao } = require("./utils/deploy-dao");
const { deployGuilds } = require("./utils/deploy-guilds");
const { doActions } = require("./utils/do-actions");

task("deploy-dxdao-contracts", "Deploy dxdao-contracts")
  .addParam("deployconfig", "The deploy config json in string format")
  .setAction(async ({ deployconfig }) => {
    // Set networkContracts object that will store the contracts deployed
    let networkContracts = {
      fromBlock: (await web3.eth.getBlock("latest")).number,
      avatar: null,
      reputation: null,
      token: null,
      controller: null,
      permissionRegistry: null,
      schemes: {},
      utils: {},
      votingMachines: {},
      addresses: {},
    };

    // Parse string json config to json object
    const deploymentConfig = JSON.parse(deployconfig);

    if (deploymentConfig.tokens) {
      networkContracts = Object.assign(
        await deployTokens(deploymentConfig.tokens, networkContracts),
        networkContracts
      );
    }

    if (deploymentConfig.permissionRegistry) {
      networkContracts = Object.assign(
        await deployPermissionRegistry(
          deploymentConfig.permissionRegistry,
          networkContracts
        ),
        networkContracts
      );
    }

    if (deploymentConfig.dao) {
      networkContracts = Object.assign(
        await deployDao(deploymentConfig.dao, networkContracts),
        networkContracts
      );
    }

    if (deploymentConfig.guildRegistry) {
      networkContracts = Object.assign(
        await deployGuildRegistry(
          deploymentConfig.guildRegistry,
          networkContracts
        ),
        networkContracts
      );
    }

    if (deploymentConfig.guilds) {
      networkContracts = Object.assign(
        await deployGuilds(deploymentConfig.guilds, networkContracts),
        networkContracts
      );
    }

    console.log("Contracts deployed:", networkContracts);

    return networkContracts;
  });
