const moment = require("moment");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const deployExtraSalt = "operationsGuild";

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
  const repTokenAddress = tx.logs[0].args[0];

  save("OperationsRepToken", {
    abi: ERC20SnapshotRep.abi,
    address: repTokenAddress,
    receipt: tx.receipt,
    bytecode: ERC20SnapshotRep.bytecode,
    deployedBytecode: ERC20SnapshotRep.deployedBytecode,
  });

  console.log("RepToken Address: ", repTokenAddress);

  const repToken = await ERC20SnapshotRep.at(repTokenAddress);
  await repToken.initialize("Operations Reputation Token", "OPS");
  await repToken.mint("0x91628ddc3A6ff9B48A2f34fC315D243eB07a9501", 25); //says:Caney
  await repToken.mint("0xc36cbdd85791a718cefca21045e773856a89c197", 20); //Melanie
  await repToken.mint("0x8e900cf9bd655e34bb610f0ef365d8d476fd7337", 17); //dlabs. We converted 17.5 into 17. NOTIFY
  //   await repToken.mint("0xabD238FA6b6042438fBd22E7d398199080b4224c", 17.5); // Sky mainnet
  await repToken.mint("0x1861974f32eaCDCceD0F81b0f8eCcFeD58153a9D", 17); //sky gnosis. We converted 17.5 into 17. NOTIFY
  await repToken.mint("0x08eec580ad41e9994599bad7d2a74a9874a2852c", 10); //augusto
  await repToken.mint("0xD179b3217F9593a9FAac7c85D5ACAF1F5223d762", 10); //Ally

  const guildTx = await deployer.deploy(
    SnapshotRepERC20Guild.bytecode,
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const guildAddress = guildTx.logs[0].args[0];

  save("OperationsGuild", {
    abi: SnapshotRepERC20Guild.abi,
    address: guildAddress,
    receipt: guildTx.receipt,
    bytecode: SnapshotRepERC20Guild.bytecode,
    deployedBytecode: SnapshotRepERC20Guild.deployedBytecode,
  });

  const operationsGuild = await SnapshotRepERC20Guild.at(guildAddress);

  await operationsGuild.initialize(
    repToken.address,
    moment.duration(3, "days").asSeconds(), // proposal time
    moment.duration(7, "days").asSeconds(), // time for execution
    3500, // 35% voting power for proposal execution
    500, // 5% voting power for proposal creation
    "Operations Guild", // guild name
    "0", // vote gas
    "0", // max gas price
    20, // max active proposals
    moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
    permissionRegistry.address
  );

  await permissionRegistry.setETHPermissionDelay(operationsGuild.address, 1);
  await guildRegistry.addGuild(operationsGuild.address);
  await repToken.transferOwnership(operationsGuild.address);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: repToken.address,
        constructorArguments: [],
        contract: "contracts/utils/ERC20/ERC20SnapshotRep.sol:ERC20SnapshotRep",
      });
    } catch (error) {
      console.error("Error verifying repToken contract", error);
    }
    try {
      await hre.run("verify:verify", {
        address: operationsGuild.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying operationsGuild contract", error);
    }
  }

  console.log(`OperationsGuild address ${operationsGuild.address}`);
};

module.exports.dependencies = [
  "Create2Deployer",
  "PermissionRegistry",
  "GuildRegistry",
];
module.exports.tags = ["OperationsGuild"];

