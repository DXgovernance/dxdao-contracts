const moment = require("moment");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const dxdToken = "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3";
  const votingMachine = "0x5f9e4a3b1f7a2cbbd0e6d7d4a9f4d9b9f6e9e4e5";
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

module.exports.dependencies = ["PermissionRegistry"];
module.exports.tags = ["DXDGuild"];
