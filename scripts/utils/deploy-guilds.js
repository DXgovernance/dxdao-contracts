import { doActions } from "./do-actions";

/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");
const { default: BigNumber } = require("bignumber.js");

const contentHash = require("content-hash");
const IPFS = require("ipfs-core");

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT_256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

export async function deployGuilds(
  deploymentConfig,
  tokens,
  guildRegistry,
  ipfs
) {
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
      if (guildToDeploy.contractName === "SnapshotRepERC20Guild")
        await tokens[guildToDeploy.token].transferOwnership(newGuild.address);
      await guildRegistry.addGuild(newGuild.address);
      guilds[guildToDeploy.name] = newGuild;
      addresses[guildToDeploy.name] = newGuild.address;
      proposals[guildToDeploy.name] = [];
      addresses[guildToDeploy.name + "-vault"] = await newGuild.getTokenVault();
    })
  );

  console.log("Contracts deployed:", networkContracts);

  // const startTime = deploymentConfig.startTimestampForActions;

  // Increase time to start time for actions
  // await hre.network.provider.request({
  //   method: "evm_increaseTime",
  //   params: [startTime - (await web3.eth.getBlock("latest")).timestamp],
  // });
  console.log("Doing guild actions");
  // Execute a set of actions once all contracts are deployed
  await doActions(
    deploymentConfig.guildActions,
    tokens,
    addresses,
    {
      address: "0x0",
    },
    guilds,
    ipfs
  );
}
