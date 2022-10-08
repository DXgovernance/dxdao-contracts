const moment = require("moment");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const deployExtraSalt = "devOpsRepToken";

  const SnapshotRepERC20Guild = await hre.artifacts.require(
    "SnapshotRepERC20Guild"
  );
  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");
  const ERC20SnapshotRep = await hre.artifacts.require("ERC20SnapshotRep");

  const permissionRegistryDeployed = await deployments.get(
    "PermissionRegistry"
  );
  const permissionRegistry = await PermissionRegistry.at(
    permissionRegistryDeployed.address
  );

  const devOpsRepTokenDeploy = await deploy("ERC20SnapshotRep", {
    from: deployer,
    args: [],
    deterministicDeployment: hre.web3.utils.sha3(deploySalt + deployExtraSalt),
  });
  const devOpsRepToken = await ERC20SnapshotRep.at(
    devOpsRepTokenDeploy.address
  );
  await devOpsRepToken.initialize("DXdao DevOps Reputation Token", "TREP");
  await devOpsRepToken.mint("0x0b17cf48420400e1D71F8231d4a8e43B3566BB5B", 1000);

  const dxdaoDevOpsGuildDeploy = await deploy("SnapshotRepERC20Guild", {
    from: deployer,
    args: [],
    deterministicDeployment: hre.web3.utils.sha3(deploySalt + 2),
  });
  const dxdaoDevOpsGuild = await SnapshotRepERC20Guild.at(
    dxdaoDevOpsGuildDeploy.address
  );

  await dxdaoDevOpsGuild.initialize(
    devOpsRepToken.address,
    moment.duration(1, "days").asSeconds(), // proposal time
    moment.duration(6, "hours").asSeconds(), // time for execution
    5000, // 50% voting power for proposal execution
    500, // 5% voting power for proposal creation
    "DXdao DevOps Guild", // guild name
    0, // vote gas
    0, // max gas price
    10, // max active proposals
    moment.duration(1, "days").asSeconds(), // lock time, not used
    permissionRegistry.address
  );

  await permissionRegistry.setETHPermissionDelay(dxdaoDevOpsGuild.address, 1);
  await devOpsRepToken.transferOwnership(dxdaoDevOpsGuild.address);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: devOpsRepToken.address,
        constructorArguments: [],
      });
      await hre.run("verify:verify", {
        address: dxdaoDevOpsGuild.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`DXdaoDevOpsGuild address ${dxdaoDevOpsGuild.address}`);
};

module.exports.dependencies = ["PermissionRegistry"];
module.exports.tags = ["DXdaoDevOpsGuild"];
