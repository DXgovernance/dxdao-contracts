require("@nomiclabs/hardhat-web3");
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function deployPermissionRegistry(
  permissionRegistryConfig,
  networkContracts
) {
  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");

  const permissionRegistry =
    permissionRegistryConfig.address === NULL_ADDRESS
      ? await PermissionRegistry.new()
      : await PermissionRegistry.at(permissionRegistryConfig.address);

  if (permissionRegistryConfig.owner)
    await permissionRegistry.transferOwnership(
      networkContracts.addresses[permissionRegistryConfig.owner] ||
        permissionRegistryConfig.owner
    );

  networkContracts.addresses["PermissionRegistry"] = permissionRegistry.address;

  return networkContracts;
}
