const moment = require("moment");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const deployExtraSalt = "dxdaoTreasury";

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

  const treasuryRepTokenDeploy = await deploy("ERC20SnapshotRep", {
    from: deployer,
    args: [],
    deterministicDeployment: hre.web3.utils.sha3(deploySalt + deployExtraSalt),
  });
  const treasuryRepToken = await ERC20SnapshotRep.at(
    treasuryRepTokenDeploy.address
  );
  await treasuryRepToken.initialize("DXdao Treasury Reputation Token", "TREP");
  await treasuryRepToken.mint(
    "0x0b17cf48420400e1D71F8231d4a8e43B3566BB5B",
    1000
  );

  const dxdaoTreasuryGuildDeploy = await deploy("SnapshotRepERC20Guild", {
    from: deployer,
    args: [],
    deterministicDeployment: hre.web3.utils.sha3(deploySalt + deployExtraSalt),
  });
  const dxdaoTreasuryGuild = await SnapshotRepERC20Guild.at(
    dxdaoTreasuryGuildDeploy.address
  );

  await dxdaoTreasuryGuild.initialize(
    treasuryRepToken.address,
    moment.duration(1, "days").asSeconds(), // proposal time
    moment.duration(6, "hours").asSeconds(), // time for execution
    5000, // 50% voting power for proposal execution
    500, // 5% voting power for proposal creation
    "DXdao Treasury Guild", // guild name
    0, // vote gas
    0, // max gas price
    10, // max active proposals
    moment.duration(1, "days").asSeconds(), // lock time, not used
    permissionRegistry.address
  );

  await permissionRegistry.setETHPermissionDelay(dxdaoTreasuryGuild.address, 1);
  await treasuryRepToken.transferOwnership(dxdaoTreasuryGuild.address);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: treasuryRepToken.address,
        constructorArguments: [],
      });
      await hre.run("verify:verify", {
        address: dxdaoTreasuryGuild.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`DXdaoTreasuryGuild address ${dxdaoTreasuryGuild.address}`);
};

module.exports.dependencies = ["PermissionRegistry"];
module.exports.tags = ["DXdaoTreasuryGuild"];
