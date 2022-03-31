const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { createAndSetupGuildToken, createProposal } = require("../../helpers/guild");

const EnforcedBinaryGuild = artifacts.require("EnforcedBinaryGuild.sol");
const GlobalPermissionRegistry = artifacts.require(
  "GlobalPermissionRegistry.sol"
);

require("chai").should();

contract("EnforcedBinaryGuild", function (accounts) {
  let guildToken, enforcedBinaryGuild, tokenVault;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 5),
      [0, 50, 100, 100, 250]
    );

    const globalPermissionRegistry = await GlobalPermissionRegistry.new();

    enforcedBinaryGuild = await EnforcedBinaryGuild.new();
    await enforcedBinaryGuild.initialize(
      guildToken.address,
      30,
      30,
      5000,
      100,
      "TestGuild",
      0,
      0,
      10,
      60,
      globalPermissionRegistry.address
    );

    tokenVault = await enforcedBinaryGuild.getTokenVault();

    await guildToken.approve(tokenVault, 50, { from: accounts[1] });
    await guildToken.approve(tokenVault, 100, { from: accounts[2] });
    await guildToken.approve(tokenVault, 100, { from: accounts[3] });
    await guildToken.approve(tokenVault, 250, { from: accounts[4] });

    await enforcedBinaryGuild.lockTokens(50, { from: accounts[1] });
    await enforcedBinaryGuild.lockTokens(100, { from: accounts[2] });
    await enforcedBinaryGuild.lockTokens(100, { from: accounts[3] });
    await enforcedBinaryGuild.lockTokens(250, { from: accounts[4] });
  });

  describe("Create proposal", function () {
    it.only("Can create proposal with enforced options", async function () {
      const guildProposalId = await createProposal({
        guild: enforcedBinaryGuild,
        actions: [
          {
            to: [accounts[1]],
            data: ["0x00"],
            value: [10],
          },
        ],
        account: accounts[3],
      });

      const createdProposal = await enforcedBinaryGuild.getProposal(
        guildProposalId
      );

      assert.equal(createdProposal.to.length, 2);
      assert.equal(createdProposal.data.length, 2);
      assert.equal(createdProposal.value.length, 2);
      assert.equal(createdProposal.totalActions, 2);

      assert.equal(createdProposal.to[createdProposal.to.length - 1], ZERO_ADDRESS);
      assert.equal(createdProposal.data[createdProposal.data.length - 1], "0x");
      assert.equal(createdProposal.value[createdProposal.value.length - 1], "0");
    });
  });
});

