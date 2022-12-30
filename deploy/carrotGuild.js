const moment = require("moment");

const GUILD_ID = "CarrotGuild";
const TOKEN_ID = "CarrotRepToken";
const TOKEN_NAME = "Carrot Reputation Token";
const TOKEN_SYMBOL = "CRT";
const guildConfig = {
  proposalTime: moment.duration(3, "days").asSeconds(),
  timeForExecution: moment.duration(7, "days").asSeconds(),
  votingPowerPercentageForProposalExecution: 4000, // 40% voting power for proposal execution
  votingPowerPercentageForProposalCreation: 200, // 2% voting power for proposal creation
  name: "Carrot Guild", // guild name
  voteGas: "0", // vote gas
  maxGasPrice: "0", // max gas price
  maxActiveProposals: 20, // max active proposals
  lockTime: moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
};
const initialRepHolders = [
  { address: "0x35E2acD3f46B13151BC941daa44785A38F3BD97A", amount: "30" }, // Federico
  { address: "0x261e421a08028e2236928efb1a1f93cea7e95ce7", amount: "25" }, // Paolo
  { address: "0x05A4Ed2367BD2F0Aa63cC14897850be7474bc722", amount: "20" }, // Diogo
  { address: "0xe836a47d43c684a3089290c7d64db65ddcbd20eb", amount: "10" }, // MilanV
  { address: "0x617512FA7d3fd26bdA51b9Ac8c23b04a48D625f1", amount: "10" }, // venky
  { address: "0x436Bb9e1f02C9cA7164afb5753C03c071430216d", amount: "5" }, // Boris
];

const deployExtraSalt = "carrot";

module.exports = async ({ getNamedAccounts, deployments }) => {
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
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const repTokenAddress = tx.logs[0].args[0];

  save(TOKEN_ID, {
    abi: ERC20SnapshotRep.abi,
    address: repTokenAddress,
    receipt: tx.receipt,
    bytecode: ERC20SnapshotRep.bytecode,
    deployedBytecode: ERC20SnapshotRep.deployedBytecode,
  });

  console.log(`${TOKEN_ID} Address: `, repTokenAddress);

  const repToken = await ERC20SnapshotRep.at(repTokenAddress);
  await repToken.initialize(TOKEN_NAME, TOKEN_SYMBOL);
  // mint rep
  for (let { address, amount } of initialRepHolders) {
    await repToken.mint(address, hre.web3.utils.toWei(amount));
  }

  const guildTx = await deployer.deploy(
    SnapshotRepERC20Guild.bytecode,
    hre.web3.utils.sha3(deploySalt + deployExtraSalt),
    {
      from: deployerAddress,
    }
  );
  const guildAddress = guildTx.logs[0].args[0];

  save(GUILD_ID, {
    abi: SnapshotRepERC20Guild.abi,
    address: guildAddress,
    receipt: guildTx.receipt,
    bytecode: SnapshotRepERC20Guild.bytecode,
    deployedBytecode: SnapshotRepERC20Guild.deployedBytecode,
  });

  const guild = await SnapshotRepERC20Guild.at(guildAddress);

  await guild.initialize(
    repToken.address,
    guildConfig.proposalTime,
    guildConfig.timeForExecution,
    guildConfig.votingPowerPercentageForProposalExecution,
    guildConfig.votingPowerPercentageForProposalCreation,
    guildConfig.name,
    guildConfig.voteGas,
    guildConfig.maxGasPrice,
    guildConfig.maxActiveProposals,
    guildConfig.lockTime,
    permissionRegistry.address
  );

  await permissionRegistry.setETHPermissionDelay(guild.address, 1);
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
      console.error(`Error verifying ${GUILD_ID} contract`, error);
    }
  }

  console.log(`${GUILD_ID} address ${guild.address}`);
};

module.exports.dependencies = [
  //   "Create2Deployer",
  //   "PermissionRegistry",
  //   "GuildRegistry",
];

module.exports.tags = [GUILD_ID];

