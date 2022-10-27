const hre = require("hardhat");

async function main() {
  await hre.deployments.fixture(
    [
      "PermissionRegistry",
      "GuildRegistry",
      "DXdaoDevOpsGuild",
      "DXdaoTreasuryGuild",
      "DXDGuild",
    ],
    { fallbackToGlobal: true }
  );
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
