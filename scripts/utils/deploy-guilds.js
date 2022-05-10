import { waitBlocks } from "./wait";

/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");

export async function deployGuilds(deploymentConfig, tokens, guildRegistry) {
  // Deploy Guilds
  let guilds = {};
  let proposals = {
    dxvote: [],
  };
  const networkContracts = {};
  const addresses = {};
  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");
  const permissionRegistry = await PermissionRegistry.new();

  // Each guild is created and initialized and use a previously deployed token or specific token address
  await Promise.all(
    deploymentConfig.guilds.map(async guildToDeploy => {
      console.log("Deploying guild", guildToDeploy.name);
      const GuildContract = await hre.artifacts.require(
        guildToDeploy.contractName
      );
      const newGuild = await GuildContract.new();
      await newGuild.initialize(
        tokens[guildToDeploy.token].address,
        guildToDeploy.proposalTime,
        guildToDeploy.timeForExecution,
        guildToDeploy.votingPowerForProposalExecution,
        guildToDeploy.votingPowerForProposalCreation,
        guildToDeploy.name,
        guildToDeploy.voteGas,
        guildToDeploy.maxGasPrice,
        guildToDeploy.maxActiveProposals,
        guildToDeploy.lockTime,
        permissionRegistry.address
      );
      await waitBlocks(1);
      if (guildToDeploy.contractName === "SnapshotRepERC20Guild")
        await tokens[guildToDeploy.token].transferOwnership(newGuild.address);
      try {
        await guildRegistry.addGuild(newGuild.address);
        await waitBlocks(1);
      } catch (e) {
        // Likely not owner of registry
        console.log("Failed to add guild to registry", e);
      }
      guilds[guildToDeploy.name] = newGuild;
      addresses[guildToDeploy.name] = newGuild.address;
      proposals[guildToDeploy.name] = [];
      addresses[guildToDeploy.name + "-vault"] = await newGuild.getTokenVault();
    })
  );

  console.log("Contracts deployed:", networkContracts);

  return { networkContracts, addresses };
}
