const moment = require("moment");
const hre = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();

  const Create2Deployer = await hre.artifacts.require("Create2Deployer");
  const deployerDeployed = await deployments.get("Create2Deployer");
  const deployer = await Create2Deployer.at(deployerDeployed.address);

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

  const tx = await deployer.deploy(
    DXDGuild.bytecode,
    deploySalt,
    {
      from: deployerAddress,
    }
  );
  const dxdGuildAddress = tx.logs[0].args[0];
  const dxdGuild = await DXDGuild.at(dxdGuildAddress);

  save("DevOpsToken", {
    abi: DXDGuild.abi,
    address: dxdGuildAddress,
    receipt: tx.receipt,
    bytecode: DXDGuild.bytecode,
    deployedBytecode: DXDGuild.deployedBytecode,
  });

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

module.exports.dependencies = ["Create2", "DXDToken", "PermissionRegistry"];
module.exports.tags = ["DXDGuild"];
