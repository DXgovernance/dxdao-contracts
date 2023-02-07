const NULL_SIGNATURE = "0x00000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Util function to deploy snapshotRepGuild
module.exports.deploySnapshotRepGuild = config => async hre => {
  const { getNamedAccounts, deployments } = hre;
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

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
    hre.web3.utils.sha3(deploySalt + config.deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const repTokenAddress = tx.logs[0].args[0];

  save(config.TOKEN_ID, {
    abi: ERC20SnapshotRep.abi,
    address: repTokenAddress,
    receipt: tx.receipt,
    bytecode: ERC20SnapshotRep.bytecode,
    deployedBytecode: ERC20SnapshotRep.deployedBytecode,
  });

  console.log(`${config.TOKEN_ID} Address: `, repTokenAddress);

  const repToken = await ERC20SnapshotRep.at(repTokenAddress);
  await repToken.initialize(config.TOKEN_NAME, config.TOKEN_SYMBOL);

  const guildTx = await deployer.deploy(
    SnapshotRepERC20Guild.bytecode,
    hre.web3.utils.sha3(deploySalt + config.deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const guildAddress = guildTx.logs[0].args[0];

  save(config.GUILD_ID, {
    abi: SnapshotRepERC20Guild.abi,
    address: guildAddress,
    receipt: guildTx.receipt,
    bytecode: SnapshotRepERC20Guild.bytecode,
    deployedBytecode: SnapshotRepERC20Guild.deployedBytecode,
  });

  const guild = await SnapshotRepERC20Guild.at(guildAddress);

  await guild.initialize(
    repToken.address,
    config.guildConfig.proposalTime,
    config.guildConfig.timeForExecution,
    config.guildConfig.votingPowerPercentageForProposalExecution,
    config.guildConfig.votingPowerPercentageForProposalCreation,
    config.guildConfig.name,
    config.guildConfig.voteGas,
    config.guildConfig.maxGasPrice,
    config.guildConfig.maxActiveProposals,
    config.guildConfig.lockTime,
    permissionRegistry.address
  );

    // mint rep
  for (let { address, amount } of config.initialRepHolders) {
    await repToken.mint(address, hre.web3.utils.toWei(amount));
  }

  await permissionRegistry.setETHPermissionDelay(guild.address, 1);
  console.log("Setting permissions for native transfer");
  await permissionRegistry.setETHPermission(
    guild.address,
    ZERO_ADDRESS,
    NULL_SIGNATURE,
    hre.web3.utils.toWei("10000"),
    true
  );
  await guildRegistry.addGuild(guild.address);
  await repToken.transferOwnership(guild.address);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: repToken.address,
        constructorArguments: [],
        contract: "contracts/utils/ERC20/ERC20SnapshotRep.sol:ERC20SnapshotRep",
      });
    } catch (error) {
      console.error("Error verifying Reptoken contract", error);
    }
    try {
      await hre.run("verify:verify", {
        address: guild.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error(`Error verifying ${config.GUILD_ID} contract`, error);
    }
  }

  console.log(`${config.GUILD_ID} address ${guild.address}`);
};

