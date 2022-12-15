const moment = require("moment");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress, tokenHolder } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const deployExtraSalt = "dxdaoTreasury";

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
  const treasuryRepTokenAddress = tx.logs[0].args[0];

  save("ERC20SnapshotRep", {
    abi: ERC20SnapshotRep.abi,
    address: treasuryRepTokenAddress,
    receipt: tx.receipt,
    bytecode: ERC20SnapshotRep.bytecode,
    deployedBytecode: ERC20SnapshotRep.deployedBytecode,
  });

  const treasuryRepToken = await ERC20SnapshotRep.at(treasuryRepTokenAddress);
  await treasuryRepToken.initialize("DXdao Treasury Reputation Token", "TREP");
  await treasuryRepToken.mint(tokenHolder, 1000);

  const guildTx = await deployer.deploy(
    SnapshotRepERC20Guild.bytecode,
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const guildAddress = guildTx.logs[0].args[0];
  save("SnapshotRepERC20Guild", {
    abi: SnapshotRepERC20Guild.abi,
    address: guildAddress,
    receipt: guildTx.receipt,
    bytecode: SnapshotRepERC20Guild.bytecode,
    deployedBytecode: SnapshotRepERC20Guild.deployedBytecode,
  });

  const dxdaoTreasuryGuild = await SnapshotRepERC20Guild.at(guildAddress);

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
  await guildRegistry.addGuild(dxdaoTreasuryGuild.address);
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

module.exports.dependencies = ["Create2", "PermissionRegistry", "GuildRegistry"];
module.exports.tags = ["DXdaoTreasuryGuild"];
