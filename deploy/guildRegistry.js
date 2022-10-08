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
  console.log("GuildRegistry deployed at: ", guildRegistryDeploy.address);
  const guildRegistry = await GuildRegistry.at(guildRegistryDeploy.address);
  await guildRegistry.addGuild("0x82c2CE8723Ceb6E42C1AE3cFE8D7336c4328024a");
  await guildRegistry.addGuild("0x721397260624Dfa0B8a254212F95B0897b86BA06");
  await guildRegistry.transferOwnership(
    "0x721397260624Dfa0B8a254212F95B0897b86BA06"
  );

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
module.exports.runAtEnd = true;
