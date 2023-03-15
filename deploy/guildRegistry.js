module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const Create2Deployer = await hre.artifacts.require("Create2Deployer");
  const deployerDeployed = await deployments.get("Create2Deployer");
  const deployer = await Create2Deployer.at(deployerDeployed.address);

  const GuildRegistry = await hre.artifacts.require("GuildRegistry");
  const tx = await deployer.deploy(GuildRegistry.bytecode, deploySalt, {
    from: deployerAddress,
  });
  const contractAddress = tx.logs[0].args[0];

  save("GuildRegistry", {
    abi: GuildRegistry.abi,
    address: contractAddress,
    receipt: tx.receipt,
    bytecode: GuildRegistry.bytecode,
    deployedBytecode: GuildRegistry.deployedBytecode,
  });

  const guildRegistry = await GuildRegistry.at(contractAddress);

  try {
    await guildRegistry.initialize();
  } catch (e) {
    console.warn("Guild Registry is already deployed");
  }

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: guildRegistry.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`GuildRegistry address ${guildRegistry.address}`);
};

module.exports.tags = ["GuildRegistry"];
module.exports.dependencies = ["Create2Deployer"];
module.exports.runAtEnd = false;
