const moment = require("moment");
import { deploySnapshotRepGuild } from "./deployGuild";

const config = {
  GUILD_ID: "DXgovGuild",
  TOKEN_ID: "DXgovRepToken",
  TOKEN_NAME: "DXgov Reputation Token",
  TOKEN_SYMBOL: "DAVI",
  guildConfig: {
    proposalTime: moment.duration(3, "days").asSeconds(),
    timeForExecution: moment.duration(7, "days").asSeconds(),
    votingPowerPercentageForProposalExecution: 4000, // 40% voting power for proposal execution
    votingPowerPercentageForProposalCreation: 200, // 2% voting power for proposal creation
    name: "DXgov Guild", // guild name
    voteGas: "0", // vote gas
    maxGasPrice: "0", // max gas price
    maxActiveProposals: 20, // max active proposals
    lockTime: moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
  },
  initialRepHolders: [
    { address: "0x0b17cf48420400e1D71F8231d4a8e43B3566BB5B", amount: "20" },
    { address: "0x08eec580ad41e9994599bad7d2a74a9874a2852c", amount: "20" },
    { address: "0x95a223299319022a842D0DfE4851C145A2F615B9", amount: "20" },
    { address: "0x3346987e123ffb154229f1950981d46e9f5c90de", amount: "17" },
    { address: "0x548872d38b4f29b59eb0b231c3f451539e9b5149", amount: "13" },
    { address: "0x7958ba4a50498faf40476d613d886f683c464bec", amount: "9" },
    { address: "0x4e91c9f086db2fd8adb1888e9b18e17f70b7bdb6", amount: "3" },
  ],
  deployExtraSalt: "dxgov",
};

module.exports = hre => deploySnapshotRepGuild(config)(hre);
module.exports.dependencies = [
  "Create2Deployer",
  "PermissionRegistry",
  "GuildRegistry",
];
module.exports.tags = [config.GUILD_ID];
module.exports.config = config;
