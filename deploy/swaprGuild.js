const moment = require("moment");

const GUILD_ID = "SwaprGuild";
const TOKEN_ID = "SwaprRepToken";
const TOKEN_NAME = "Swapr Reputation Token";
const TOKEN_SYMBOL = "SRT";
const guildConfig = {
  proposalTime: moment.duration(3, "days").asSeconds(),
  timeForExecution: moment.duration(7, "days").asSeconds(),
  votingPowerPercentageForProposalExecution: 4000, // 40% voting power for proposal execution
  votingPowerPercentageForProposalCreation: 200, // 2% voting power for proposal creation
  name: "Swapr Guild", // guild name
  voteGas: "0", // vote gas
  maxGasPrice: "0", // max gas price
  maxActiveProposals: 20, // max active proposals
  lockTime: moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
};

const initialRepHolders = [
  { address: "0xb5806a701c2ae0366e15bde9be140e82190fa3d6", amount: "17" }, //  zett
  { address: "0x617512FA7d3fd26bdA51b9Ac8c23b04a48D625f1", amount: "15" }, //  venky
  { address: "0xF006779eAbE823F8EEd05464A1628383af1f7afb", amount: "15" }, //  Adam
  { address: "0x26358E62C2eDEd350e311bfde51588b8383A9315", amount: "12" }, //  Violet
  { address: "0xe716ec63c5673b3a4732d22909b38d779fa47c3f", amount: "10" }, //  Leo
  { address: "0x05A4Ed2367BD2F0Aa63cC14897850be7474bc722", amount: "8" }, // Diogo
  { address: "0xe836a47d43c684a3089290c7d64db65ddcbd20eb", amount: "8" }, // MilanV
  { address: "0x3b2c9a92a448be45dcff2c08a0d3af4178fc14d7", amount: "5" }, // Velu
  { address: "0x261e421a08028e2236928efb1a1f93cea7e95ce7", amount: "5" }, // Paolo
  { address: "0x8a5749a90c334953fd068aca14f1044eb3f7dfdd", amount: "3" }, // Vance
  { address: "0xb492873d940dac02b5021dff82282d8374509582", amount: "2" }, // Mirko
];
const deployExtraSalt = "swapr";

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
  console.log("Setting permissions for native transfer");
  await permissionRegistry.setETHPermission(
    guild.address,
    "0x0000000000000000000000000000000000000000",
    "0x00000000",
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

