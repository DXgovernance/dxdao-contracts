import { config } from "../../deploy/dxgovGuild";
import { ZERO_ADDRESS, NULL_SIGNATURE } from "../helpers/constants";

describe.skip("DXgovGuild deploy script", function () {
  beforeEach(async () => {
    await hre.deployments.fixture("DXgovGuild");
  });

  it("Should initialize guild with correct params", async function () {
    const dxgovGuild = await hre.deployments.get("DXgovGuild");
    const dxgovRepToken = await hre.deployments.get("DXgovRepToken");
    const permissionRegistry = await hre.deployments.get("PermissionRegistry");
    const SnapshotRepERC20Guild = await hre.artifacts.require(
      "SnapshotRepERC20Guild"
    );

    const guild = await SnapshotRepERC20Guild.at(dxgovGuild.address);
    expect(await guild.name()).equal(config.guildConfig.name);
    expect(await guild.token()).equal(dxgovRepToken.address);
    expect((await guild.proposalTime()).toNumber()).equal(
      config.guildConfig.proposalTime
    );
    expect((await guild.timeForExecution()).toNumber()).equal(
      config.guildConfig.timeForExecution
    );
    expect(
      (await guild.votingPowerPercentageForProposalExecution()).toNumber()
    ).equal(config.guildConfig.votingPowerPercentageForProposalExecution);

    expect(
      (await guild.votingPowerPercentageForProposalCreation()).toNumber()
    ).equal(config.guildConfig.votingPowerPercentageForProposalCreation);

    expect((await guild.voteGas()).toString()).equal(
      config.guildConfig.voteGas
    );
    expect((await guild.maxGasPrice()).toString()).equal(
      config.guildConfig.maxGasPrice
    );
    expect((await guild.maxActiveProposals()).toNumber()).equal(
      config.guildConfig.maxActiveProposals
    );
    expect((await guild.lockTime()).toNumber()).equal(
      config.guildConfig.lockTime
    );

    expect(await guild.getPermissionRegistry()).equal(
      permissionRegistry.address
    );
  });
  it("Should add guild to the Guild registry", async function () {
    const guildRegistryDeployed = await hre.deployments.get("GuildRegistry");
    const dxgovGuildDeployed = await hre.deployments.get("DXgovGuild");
    const GuildRegistry = await hre.artifacts.require("GuildRegistry");
    const guildRegistry = await GuildRegistry.at(guildRegistryDeployed.address);

    const registeredGuilds = await guildRegistry.getGuildsAddresses();
    expect(registeredGuilds.includes(dxgovGuildDeployed.address)).to.be.true;
  });

  it("RepToken has correct name and symbol", async function () {
    const repTokenDeployed = await hre.deployments.get("DXgovRepToken");
    const ERC20SnapshotRep = await hre.artifacts.require("ERC20SnapshotRep");
    const repToken = await ERC20SnapshotRep.at(repTokenDeployed.address);

    expect(await repToken.name()).equal(config.TOKEN_NAME);
    expect(await repToken.symbol()).equal(config.TOKEN_SYMBOL);
  });

  it("Initial rep distribution is ok", async function () {
    const repTokenDeployed = await hre.deployments.get("DXgovRepToken");
    const ERC20SnapshotRep = await hre.artifacts.require("ERC20SnapshotRep");
    const repToken = await ERC20SnapshotRep.at(repTokenDeployed.address);

    for (let { address, amount } of config.initialRepHolders) {
      const balance = await repToken.balanceOf(address);
      expect(balance.toString()).equal(hre.web3.utils.toWei(amount));
    }
  });

  it("Token transfer ownership to the guild", async function () {
    const dxgovGuildDeployed = await hre.deployments.get("DXgovGuild");
    const repTokenDeployed = await hre.deployments.get("DXgovRepToken");
    const ERC20SnapshotRep = await hre.artifacts.require("ERC20SnapshotRep");
    const repToken = await ERC20SnapshotRep.at(repTokenDeployed.address);

    expect(await repToken.owner()).equal(dxgovGuildDeployed.address);
  });

  it("PermissionRegistry sets permissions for native asset transfer", async function () {
    const dxgovGuildDeployed = await hre.deployments.get("DXgovGuild");
    const permissionRegistryDeployed = await hre.deployments.get(
      "PermissionRegistry"
    );
    const PermissionRegistry = await hre.artifacts.require(
      "PermissionRegistry"
    );
    const permissionRegistry = await PermissionRegistry.at(
      permissionRegistryDeployed.address
    );
    const permis = await permissionRegistry.getETHPermission(
      dxgovGuildDeployed.address,
      ZERO_ADDRESS,
      NULL_SIGNATURE
    );
    expect(permis.valueAllowed.toString()).equal(hre.web3.utils.toWei("10000"));
  });
});

