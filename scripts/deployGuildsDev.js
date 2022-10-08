const hre = require("hardhat");
const { deployments } = hre;

async function main() {
  process.env.DEPLOY_SALT =
    "0x3260d6d86e2f3e66d141e7b3966d3d21dd93f2461c073f186b995eb15d20b135";
  await deployments.fixture(
    [
      "PermissionRegistry",
      "GuildRegistry",
      "DXdaoDevOpsGuild",
      "DXdaoTreasuryGuild",
    ],
    { fallbackToGlobal: false }
  );
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
