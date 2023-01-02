const moment = require("moment");

const GUILD_ID = "OperationsGuild";
const TOKEN_ID = "OperationsRepToken";
const TOKEN_NAME = "Operations Reputation Token";
const TOKEN_SYMBOL = "OPS";
const guildConfig = {
  proposalTime: moment.duration(3, "days").asSeconds(),
  timeForExecution: moment.duration(7, "days").asSeconds(),
  votingPowerPercentageForProposalExecution: 3500, // 35% voting power for proposal execution
  votingPowerPercentageForProposalCreation: 500, // 5% voting power for proposal creation
  name: "Operations Guild", // guild name
  voteGas: "0", // vote gas
  maxGasPrice: "0", // max gas price
  maxActiveProposals: 20, // max active proposals
  lockTime: moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
};
const initialRepHolders = [
  { address: "0x91628ddc3A6ff9B48A2f34fC315D243eB07a9501", amount: "25" }, // Caney
  { address: "0xc36cbdd85791a718cefca21045e773856a89c197", amount: "20" }, // Melanie
  { address: "0x8e900cf9bd655e34bb610f0ef365d8d476fd7337", amount: "17.5" }, // dlabs
  // { address: "0xabD238FA6b6042438fBd22E7d398199080b4224c", amount: "17.5" },   // Sky mainnet
  { address: "0x1861974f32eaCDCceD0F81b0f8eCcFeD58153a9D", amount: "17.5" }, // Sky gnosis
  { address: "0x08eec580ad41e9994599bad7d2a74a9874a2852c", amount: "10" }, // augusto
  { address: "0xD179b3217F9593a9FAac7c85D5ACAF1F5223d762", amount: "10" }, // Ally
];

const deployExtraSalt = "operations_guild";

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const Create2Deployer = await hre.artifacts.require("Create2Deployer");
  const deployerDeployed = await deployments.get("Create2Deployer");
  const deployer = await Create2Deployer.at(deployerDeployed.address);

  const SnapshotRepERC20Guild = await hre.artifacts.require(
    "SnapshotRepERC20Guild"
  );
  const GuildRegistry = await hre.artifacts.require("GuildRegistry");
  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");
  const ERC20SnapshotRep = await hre.artifacts.require("ERC20SnapshotRep");

  const permissionRegistryDeployed = await deployments.get(
    "PermissionRegistry"
  );
  const permissionRegistry = await PermissionRegistry.at(
    permissionRegistryDeployed.address
  );

  const guildRegistryDeployed = await deployments.get("GuildRegistry");
  const guildRegistry = await GuildRegistry.at(guildRegistryDeployed.address);

  const tx = await deployer.deploy(
    ERC20SnapshotRep.bytecode,
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const repTokenAddress = tx.logs[0].args[0];

  save(TOKEN_ID, {
    abi: ERC20SnapshotRep.abi,
    address: repTokenAddress,
    receipt: tx.receipt,
    bytecode: ERC20SnapshotRep.bytecode,
    deployedBytecode: ERC20SnapshotRep.deployedBytecode,
  });

  console.log(`${TOKEN_ID} Address: `, repTokenAddress);

  const repToken = await ERC20SnapshotRep.at(repTokenAddress);
  await repToken.initialize(TOKEN_NAME, TOKEN_SYMBOL);
  // mint rep
  for (let { address, amount } of initialRepHolders) {
    await repToken.mint(address, hre.web3.utils.toWei(amount));
  }

  const guildTx = await deployer.deploy(
    SnapshotRepERC20Guild.bytecode,
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const guildAddress = guildTx.logs[0].args[0];

  save(GUILD_ID, {
    abi: SnapshotRepERC20Guild.abi,
    address: guildAddress,
    receipt: guildTx.receipt,
    bytecode: SnapshotRepERC20Guild.bytecode,
    deployedBytecode: SnapshotRepERC20Guild.deployedBytecode,
  });

  const guild = await SnapshotRepERC20Guild.at(guildAddress);

  await guild.initialize(
    repToken.address,
    guildConfig.proposalTime,
    guildConfig.timeForExecution,
    guildConfig.votingPowerPercentageForProposalExecution,
    guildConfig.votingPowerPercentageForProposalCreation,
    guildConfig.name,
    guildConfig.voteGas,
    guildConfig.maxGasPrice,
    guildConfig.maxActiveProposals,
    guildConfig.lockTime,
    permissionRegistry.address
  );

  await permissionRegistry.setETHPermissionDelay(guild.address, 1);
  console.log("Setting permissions for native transfer");
  await permissionRegistry.setETHPermission(
    guild.address,
    "0x0000000000000000000000000000000000000000",
    "0x00000000",
    hre.web3.utils.toWei("10000"),
    true
  );
  await guildRegistry.addGuild(guild.address);
  await repToken.transferOwnership(guild.address);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: repToken.address,
        constructorArguments: [],
        contract: "contracts/utils/ERC20/ERC20SnapshotRep.sol:ERC20SnapshotRep",
      });
    } catch (error) {
      console.error("Error verifying Reptoken contract", error);
    }
    try {
      await hre.run("verify:verify", {
        address: guild.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error(`Error verifying ${GUILD_ID} contract`, error);
    }
  }

  console.log(`${GUILD_ID} address ${guild.address}`);
};

module.exports.dependencies = [
  //   "Create2Deployer",
  //   "PermissionRegistry",
  //   "GuildRegistry",
];

module.exports.tags = [GUILD_ID];

