const moment = require("moment");
const hre = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const dxdToken =
    hre.network.name === "mainnet"
      ? "0xa1d65E8fB6e87b60FECCBc582F7f97804B725521"
      : hre.network.name === "xdai"
      ? "0xb90D6bec20993Be5d72A5ab353343f7a0281f158"
      : process.env.DXD_ADDRESS;

  const votingMachine =
    process.env.VOTING_MACHINE_ADDRESS ||
    "0x1000000000000000000000000000000000000000";
  const deploySalt = process.env.DEPLOY_SALT;

  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");
  const permissionRegistryDeployed = await deployments.get(
    "PermissionRegistry"
  );
  const permissionRegistry = await PermissionRegistry.at(
    permissionRegistryDeployed.address
  );
  const DXDGuild = await hre.artifacts.require("DXDGuild");

  const dxdGuildDeployed = await deploy("DXDGuild", {
    from: deployer,
    args: [],
    deterministicDeployment: deploySalt,
  });
  const dxdGuild = await DXDGuild.at(dxdGuildDeployed.address);

  await dxdGuild.initialize(
    dxdToken,
    moment.duration(3, "days").asSeconds(),
    moment.duration(1, "days").asSeconds(),
    5000,
    100,
    0,
    0,
    5,
    moment.duration(7, "days").asSeconds(),
    permissionRegistry.address,
    votingMachine
  );

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: dxdGuild.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`DXDGuild address ${dxdGuild.address}`);
};

module.exports.dependencies = ["DXDToken", "PermissionRegistry"];
module.exports.tags = ["DXDGuild"];
