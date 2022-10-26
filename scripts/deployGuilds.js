const hre = require("hardhat");
const { deployments } = hre;

async function main() {
  await deployments.fixture(
    [
      "PermissionRegistry",
      "GuildRegistry",
      "DXdaoDevOpsGuild",
      "DXdaoTreasuryGuild",
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
