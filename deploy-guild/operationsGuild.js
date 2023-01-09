const moment = require("moment");
import { deploySnapshotRepGuild } from "./deployGuild";

const config = {
  GUILD_ID: "OperationsGuild",
  TOKEN_ID: "OperationsRepToken",
  TOKEN_NAME: "Operations Reputation Token",
  TOKEN_SYMBOL: "OPS",
  guildConfig: {
    proposalTime: moment.duration(3, "days").asSeconds(),
    timeForExecution: moment.duration(7, "days").asSeconds(),
    votingPowerPercentageForProposalExecution: 3500, // 35% voting power for proposal execution
    votingPowerPercentageForProposalCreation: 500, // 5% voting power for proposal creation
    name: "Operations Guild", // guild name
    voteGas: "0", // vote gas
    maxGasPrice: "0", // max gas price
    maxActiveProposals: 20, // max active proposals
    lockTime: moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
  },
  initialRepHolders: [
    { address: "0x91628ddc3A6ff9B48A2f34fC315D243eB07a9501", amount: "25" }, // Caney
    { address: "0xc36cbdd85791a718cefca21045e773856a89c197", amount: "20" }, // Melanie
    { address: "0x8e900cf9bd655e34bb610f0ef365d8d476fd7337", amount: "17.5" }, // dlabs
    // { address: "0xabD238FA6b6042438fBd22E7d398199080b4224c", amount: "17.5" },   // Sky mainnet
    { address: "0x1861974f32eaCDCceD0F81b0f8eCcFeD58153a9D", amount: "17.5" }, // Sky gnosis
    { address: "0x08eec580ad41e9994599bad7d2a74a9874a2852c", amount: "10" }, // augusto
    { address: "0xD179b3217F9593a9FAac7c85D5ACAF1F5223d762", amount: "10" }, // Ally
  ],

  deployExtraSalt: "operations_guild",
};

module.exports = hre => deploySnapshotRepGuild(config)(hre);

module.exports.dependencies = [
  "Create2Deployer",
  "PermissionRegistry",
  "GuildRegistry",
];

module.exports.tags = [config.GUILD_ID];
module.exports.config = config;

