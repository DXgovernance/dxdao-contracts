require("@nomiclabs/hardhat-web3");
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function deployGuildRegistry(
  guildRegistryConfig,
  networkContracts
) {
  const GuildRegistry = await hre.artifacts.require("GuildRegistry");

  const guildRegistry =
    guildRegistryConfig.address === NULL_ADDRESS
      ? await GuildRegistry.new()
      : await GuildRegistry.at(guildRegistryConfig.address);

  if (guildRegistryConfig.owner)
    await guildRegistry.transferOwnership(
      networkContracts.addresses[guildRegistryConfig.owner] ||
        guildRegistryConfig.owner
    );

  networkContracts.addresses["GuildRegistry"] = guildRegistry.address;
  networkContracts.guildRegistry = guildRegistry.address;

  return networkContracts;
}
