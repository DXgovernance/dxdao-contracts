const {
  expectEvent,
  time,
  expectRevert,
} = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { constants, testCallFrom } = require("../../helpers");
const {
  createAndSetupGuildToken,
  createProposal,
  setAllVotesOnProposal,
} = require("../../helpers/guild");

const EnforcedBinaryGuild = artifacts.require("EnforcedBinaryGuild.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");

require("chai").should();

contract("EnforcedBinaryGuild", function (accounts) {
  let guildToken, enforcedBinaryGuild, tokenVault;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 5),
      [0, 50, 100, 100, 250]
    );

    const permissionRegistry = await PermissionRegistry.new();

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
      permissionRegistry.address
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
    it("Proposals have enforced 'No' options", async function () {
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

      assert.equal(createdProposal.to[0], accounts[1]);
      assert.equal(createdProposal.data[0], "0x00");
      assert.equal(createdProposal.value[0], "10");

      assert.equal(createdProposal.to[1], ZERO_ADDRESS);
      assert.equal(createdProposal.data[1], "0x");
      assert.equal(createdProposal.value[1], "0");
    });

    it("Proposals have correct number of calls", async function () {
      const guildProposalId = await createProposal({
        guild: enforcedBinaryGuild,
        actions: [
          {
            to: [accounts[1], accounts[2], accounts[3]],
            data: ["0x00", "0x01", "0x02"],
            value: [10, 50, 100],
          },
        ],
        account: accounts[3],
      });

      const createdProposal = await enforcedBinaryGuild.getProposal(
        guildProposalId
      );

      assert.equal(createdProposal.to.length, 6);
      assert.equal(createdProposal.data.length, 6);
      assert.equal(createdProposal.value.length, 6);
      assert.equal(createdProposal.totalActions, 2);

      assert.equal(createdProposal.to[0], accounts[1]);
      assert.equal(createdProposal.data[0], "0x00");
      assert.equal(createdProposal.value[0], "10");

      assert.equal(createdProposal.to[1], accounts[2]);
      assert.equal(createdProposal.data[1], "0x01");
      assert.equal(createdProposal.value[1], "50");

      assert.equal(createdProposal.to[2], accounts[3]);
      assert.equal(createdProposal.data[2], "0x02");
      assert.equal(createdProposal.value[2], "100");

      assert.equal(createdProposal.to[3], ZERO_ADDRESS);
      assert.equal(createdProposal.data[3], "0x");
      assert.equal(createdProposal.value[3], "0");

      assert.equal(createdProposal.to[4], ZERO_ADDRESS);
      assert.equal(createdProposal.data[4], "0x");
      assert.equal(createdProposal.value[4], "0");

      assert.equal(createdProposal.to[5], ZERO_ADDRESS);
      assert.equal(createdProposal.data[5], "0x");
      assert.equal(createdProposal.value[5], "0");
    });
  });

  describe("End proposal", function () {
    it("Proposals are marked as rejected if voted on 'No' option", async function () {
      const proposalId = await createProposal({
        guild: enforcedBinaryGuild,
        actions: [
          {
            to: [accounts[1]],
            data: ["0x00"],
            value: [10],
          },
        ],
        account: accounts[1],
      });

      await setAllVotesOnProposal({
        guild: enforcedBinaryGuild,
        proposalId: proposalId,
        action: 2,
        account: accounts[2],
      });

      await setAllVotesOnProposal({
        guild: enforcedBinaryGuild,
        proposalId: proposalId,
        action: 2,
        account: accounts[3],
      });

      await setAllVotesOnProposal({
        guild: enforcedBinaryGuild,
        proposalId: proposalId,
        action: 2,
        account: accounts[4],
      });

      await expectRevert(
        enforcedBinaryGuild.endProposal(proposalId),
        "EnforcedBinaryGuild: Proposal hasn't ended yet"
      );

      await time.increase(time.duration.seconds(31));

      const receipt = await enforcedBinaryGuild.endProposal(proposalId);

      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "4",
      });
      await expectRevert(
        enforcedBinaryGuild.endProposal(proposalId),
        "EnforcedBinaryGuild: Proposal already executed"
      );

      const proposalInfo = await enforcedBinaryGuild.getProposal(proposalId);
      assert.equal(proposalInfo.state, constants.GuildProposalState.Failed);
    });

    it("Can successfully execute a proposal when not voted on the 'No' option", async function () {
      await web3.eth.sendTransaction({
        to: enforcedBinaryGuild.address,
        value: 10,
        from: accounts[0],
      });

      const yetAnotherProposal = await createProposal({
        guild: enforcedBinaryGuild,
        actions: [
          {
            to: [enforcedBinaryGuild.address],
            data: [
              await new web3.eth.Contract(EnforcedBinaryGuild.abi).methods
                .setPermission(
                  [constants.NULL_ADDRESS],
                  [constants.SOME_ADDRESS],
                  [testCallFrom(enforcedBinaryGuild.address).substring(0, 10)],
                  [10],
                  [true]
                )
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[2],
      });
      await setAllVotesOnProposal({
        guild: enforcedBinaryGuild,
        proposalId: yetAnotherProposal,
        action: 1,
        account: accounts[3],
      });

      await setAllVotesOnProposal({
        guild: enforcedBinaryGuild,
        proposalId: yetAnotherProposal,
        action: 1,
        account: accounts[4],
      });
      await time.increase(time.duration.seconds(31));
      const receipt = await enforcedBinaryGuild.endProposal(yetAnotherProposal);

      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: yetAnotherProposal,
        newState: "3",
      });
    });
  });
});
