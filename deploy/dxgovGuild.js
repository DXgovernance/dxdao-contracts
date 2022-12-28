const moment = require("moment");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const deployExtraSalt = "dxgov";

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
  const guildRegistry = await GuildRegistry.at(
    guildRegistryDeployed.address
  );

  const tx = await deployer.deploy(
    ERC20SnapshotRep.bytecode,
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const repTokenAddress = tx.logs[0].args[0];

  save("DXgovRepToken", {
    abi: ERC20SnapshotRep.abi,
    address: repTokenAddress,
    receipt: tx.receipt,
    bytecode: ERC20SnapshotRep.bytecode,
    deployedBytecode: ERC20SnapshotRep.deployedBytecode,
  });

  console.log("RepToken Address: ", repTokenAddress);

  const repToken = await ERC20SnapshotRep.at(repTokenAddress);
  await repToken.initialize("DXgov Reputation Token", "DAVI");
  await repToken.mint("0x0b17cf48420400e1D71F8231d4a8e43B3566BB5B", 20);
  await repToken.mint("0x08eec580ad41e9994599bad7d2a74a9874a2852c", 20);
  await repToken.mint("0x95a223299319022a842D0DfE4851C145A2F615B9", 20);
  await repToken.mint("0x3346987e123ffb154229f1950981d46e9f5c90de", 17);
  await repToken.mint("0x548872d38b4f29b59eb0b231c3f451539e9b5149", 13);
  await repToken.mint("0x7958ba4a50498faf40476d613d886f683c464bec", 9);
  await repToken.mint("0x4e91c9f086db2fd8adb1888e9b18e17f70b7bdb6", 3);

  const guildTx = await deployer.deploy(
    SnapshotRepERC20Guild.bytecode,
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const guildAddress = guildTx.logs[0].args[0];

  save("DXgovGuild", {
    abi: SnapshotRepERC20Guild.abi,
    address: guildAddress,
    receipt: guildTx.receipt,
    bytecode: SnapshotRepERC20Guild.bytecode,
    deployedBytecode: SnapshotRepERC20Guild.deployedBytecode,
  });

  const dxgovGuild = await SnapshotRepERC20Guild.at(guildAddress);

  await dxgovGuild.initialize(
    repToken.address,
    moment.duration(3, "days").asSeconds(), // proposal time
    moment.duration(7, "days").asSeconds(), // time for execution
    4000, // 40% voting power for proposal execution
    200, // 2% voting power for proposal creation
    "DXgov Guild", // guild name
    "0", // vote gas
    "0", // max gas price
    20, // max active proposals
    moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
    permissionRegistry.address
  );

  await permissionRegistry.setETHPermissionDelay(dxgovGuild.address, 1);
  await guildRegistry.addGuild(dxgovGuild.address);
  await repToken.transferOwnership(dxgovGuild.address);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: repToken.address,
        constructorArguments: [],
      });
      await hre.run("verify:verify", {
        address: dxgovGuild.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`DXgovGuild address ${dxgovGuild.address}`);
};

module.exports.dependencies = [
  "Create2Deployer",
  "PermissionRegistry",
  "GuildRegistry",
];
module.exports.tags = ["DXgovGuild"];
