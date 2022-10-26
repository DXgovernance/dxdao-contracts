module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const GuildRegistry = await hre.artifacts.require("GuildRegistry");

  const guildRegistryDeploy = await deploy("GuildRegistry", {
    name: "GuildRegistry",
    from: deployer,
    args: [],
    deterministicDeployment: deploySalt,
  });
  const guildRegistry = await GuildRegistry.at(guildRegistryDeploy.address);
  await guildRegistry.initialize();

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
module.exports.runAtEnd = false;
