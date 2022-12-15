const moment = require("moment");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress, tokenHolder } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const deployExtraSalt = "dxdaoDevOps";

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
  const devOpsRepTokenAddress = tx.logs[0].args[0];

  save("DevOpsToken", {
    abi: ERC20SnapshotRep.abi,
    address: devOpsRepTokenAddress,
    receipt: tx.receipt,
    bytecode: ERC20SnapshotRep.bytecode,
    deployedBytecode: ERC20SnapshotRep.deployedBytecode,
  });

  const devOpsRepToken = await ERC20SnapshotRep.at(devOpsRepTokenAddress);
  await devOpsRepToken.initialize("DXdao DevOps Reputation Token", "DREP");
  await devOpsRepToken.mint(tokenHolder, 1000);

  const guildTx = await deployer.deploy(
    SnapshotRepERC20Guild.bytecode,
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const guildAddress = guildTx.logs[0].args[0];

  save("DevOpsGuild", {
    abi: SnapshotRepERC20Guild.abi,
    address: guildAddress,
    receipt: guildTx.receipt,
    bytecode: SnapshotRepERC20Guild.bytecode,
    deployedBytecode: SnapshotRepERC20Guild.deployedBytecode,
  });

  const dxdaoDevOpsGuild = await SnapshotRepERC20Guild.at(guildAddress);

  await dxdaoDevOpsGuild.initialize(
    devOpsRepToken.address,
    moment.duration(2, "hours").asSeconds(), // proposal time
    moment.duration(6, "hours").asSeconds(), // time for execution
    5000, // 50% voting power for proposal execution
    500, // 5% voting power for proposal creation
    "DXdao DevOps Guild", // guild name
    "21000", // vote gas
    "100000000", // max gas price
    10, // max active proposals
    moment.duration(1, "days").asSeconds(), // lock time, not used
    permissionRegistry.address
  );

  await permissionRegistry.setETHPermissionDelay(dxdaoDevOpsGuild.address, 1);
  await guildRegistry.addGuild(dxdaoDevOpsGuild.address);
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

module.exports.dependencies = [
  "Create2Deployer",
  "PermissionRegistry",
  "GuildRegistry",
];
module.exports.tags = ["DXdaoDevOpsGuild"];
