const moment = require("moment");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const deployExtraSalt = "dxdSnapshotGuild";

  const dxdTokenAddress =
    hre.network.name === "mainnet"
      ? "0xa1d65E8fB6e87b60FECCBc582F7f97804B725521"
      : hre.network.name === "xdai"
      ? "0xb90D6bec20993Be5d72A5ab353343f7a0281f158"
      : process.env.DXD_ADDRESS;

  const SnapshotERC20Guild = await hre.artifacts.require(
    "SnapshotERC20Guild"
  );
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

  const dxdSnapshotGuildDeploy = await deploy("SnapshotERC20Guild", {
    name: "DXD Guild",
    from: deployer,
    args: [],
    deterministicDeployment: hre.web3.utils.sha3(deploySalt + deployExtraSalt),
  });
  const dxdSnapshotGuild = await SnapshotERC20Guild.at(
    dxdSnapshotGuildDeploy.address
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

module.exports.dependencies = ["PermissionRegistry", "GuildRegistry"];
module.exports.tags = ["dxdSnapshotGuild"];
