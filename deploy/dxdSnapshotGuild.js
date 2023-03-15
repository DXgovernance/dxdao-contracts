const moment = require("moment");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const deployExtraSalt = "dxdSnapshotGuild";

  const Create2Deployer = await hre.artifacts.require("Create2Deployer");
  const deployerDeployed = await deployments.get("Create2Deployer");
  const deployer = await Create2Deployer.at(deployerDeployed.address);

  const dxdTokenAddress =
    hre.network.name === "mainnet"
      ? "0xa1d65E8fB6e87b60FECCBc582F7f97804B725521"
      : hre.network.name === "xdai"
      ? "0xb90D6bec20993Be5d72A5ab353343f7a0281f158"
      : process.env.DXD_ADDRESS;

  const SnapshotERC20Guild = await hre.artifacts.require("SnapshotERC20Guild");
  const GuildRegistry = await hre.artifacts.require("GuildRegistry");
  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");

  const permissionRegistryDeployed = await deployments.get(
    "PermissionRegistry"
  );
  const permissionRegistry = await PermissionRegistry.at(
    permissionRegistryDeployed.address
  );

  const guildRegistryDeployed = await deployments.get("GuildRegistry");
  const guildRegistry = await GuildRegistry.at(guildRegistryDeployed.address);

  const tx = await deployer.deploy(
    SnapshotERC20Guild.bytecode,
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const snapshotERC20GuildAddress = tx.logs[0].args[0];

  save("DXD Guild", {
    abi: SnapshotERC20Guild.abi,
    address: snapshotERC20GuildAddress,
    receipt: tx.receipt,
    bytecode: SnapshotERC20Guild.bytecode,
    deployedBytecode: SnapshotERC20Guild.deployedBytecode,
  });

  const dxdSnapshotGuild = await SnapshotERC20Guild.at(
    snapshotERC20GuildAddress
  );

  await dxdSnapshotGuild.initialize(
    dxdTokenAddress,
    moment.duration(2, "hours").asSeconds(), // proposal time
    moment.duration(6, "hours").asSeconds(), // time for execution
    5000, // 50% voting power for proposal execution
    500, // 5% voting power for proposal creation
    "DXD Guild", // guild name
    "21000", // vote gas
    "100000000", // max gas price
    10, // max active proposals
    moment.duration(1, "days").asSeconds(), // lock time
    permissionRegistry.address
  );

  await permissionRegistry.setETHPermissionDelay(dxdSnapshotGuild.address, 1);
  await guildRegistry.addGuild(dxdSnapshotGuild.address);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: dxdSnapshotGuild.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`DXDSnapshotGuild address ${dxdSnapshotGuild.address}`);
};

module.exports.dependencies = ["Create2Deployer", "PermissionRegistry", "GuildRegistry"];
module.exports.tags = ["dxdSnapshotGuild"];
