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
  setVotesOnProposal,
} = require("../../helpers/guild");

const EnforcedBinarySnapshotERC20Guild = artifacts.require(
  "EnforcedBinarySnapshotERC20Guild.sol"
);
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");

require("chai").should();

contract("EnforcedBinarySnapshotERC20Guild", function (accounts) {
  let guildToken, erc20Guild, tokenVault;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6),
      [0, 50000, 50000, 100000, 100000, 200000]
    );

    const permissionRegistry = await PermissionRegistry.new();

    erc20Guild = await EnforcedBinarySnapshotERC20Guild.new();
    await erc20Guild.initialize(
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

    tokenVault = await erc20Guild.getTokenVault();

    await guildToken.approve(tokenVault, 50000, { from: accounts[1] });
    await guildToken.approve(tokenVault, 50000, { from: accounts[2] });

    await erc20Guild.lockTokens(50000, { from: accounts[1] });
    await erc20Guild.lockTokens(50000, { from: accounts[2] });

    const setGlobalPermissionProposal = await createProposal({
      guild: erc20Guild,
      actions: [
        {
          to: [erc20Guild.address],
          data: [
            await new web3.eth.Contract(
              EnforcedBinarySnapshotERC20Guild.abi
            ).methods
              .setPermission(
                [constants.NULL_ADDRESS],
                [constants.ANY_ADDRESS],
                [constants.ANY_FUNC_SIGNATURE],
                [100],
                [true]
              )
              .encodeABI(),
          ],
          value: [0],
        },
      ],
      account: accounts[1],
    });
    await setVotesOnProposal({
      guild: erc20Guild,
      proposalId: setGlobalPermissionProposal,
      action: 1,
      account: accounts[1],
    });
    await time.increase(30);
    await erc20Guild.endProposal(setGlobalPermissionProposal);
  });

  describe("Create proposal", function () {
    beforeEach(async function () {
      await web3.eth.sendTransaction({
        to: erc20Guild.address,
        value: 100,
        from: accounts[0],
      });
    });

    it("Proposals have enforced 'No' options", async function () {
      await guildToken.approve(tokenVault, 100000, { from: accounts[3] });
      await erc20Guild.lockTokens(100000, { from: accounts[3] });

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [
          {
            to: [accounts[1]],
            data: ["0x00"],
            value: [10],
          },
        ],
        account: accounts[3],
      });

      const createdProposal = await erc20Guild.getProposal(guildProposalId);

      assert.equal(createdProposal.to.length, 2);
      assert.equal(createdProposal.data.length, 2);
      assert.equal(createdProposal.value.length, 2);
      assert.equal(createdProposal.totalVotes.length, 3);

      assert.equal(createdProposal.to[0], accounts[1]);
      assert.equal(createdProposal.data[0], "0x00");
      assert.equal(createdProposal.value[0], "10");

      assert.equal(createdProposal.to[1], ZERO_ADDRESS);
      assert.equal(createdProposal.data[1], "0x");
      assert.equal(createdProposal.value[1], "0");
    });

    it("Proposals have correct number of calls", async function () {
      await guildToken.approve(tokenVault, 100000, { from: accounts[3] });
      await erc20Guild.lockTokens(100000, { from: accounts[3] });

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [
          {
            to: [accounts[1], accounts[2], accounts[3]],
            data: ["0x00", "0x01", "0x02"],
            value: [10, 50, 100],
          },
        ],
        account: accounts[3],
      });

      const createdProposal = await erc20Guild.getProposal(guildProposalId);

      assert.equal(createdProposal.to.length, 6);
      assert.equal(createdProposal.data.length, 6);
      assert.equal(createdProposal.value.length, 6);
      assert.equal(createdProposal.totalVotes.length, 3);

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

    it("Only the ones with voting power at proposal creation can vote", async function () {
      await guildToken.approve(tokenVault, 100000, { from: accounts[3] });
      await erc20Guild.lockTokens(100000, { from: accounts[3] });
      const snapshotIdBeforeProposal = await erc20Guild.getCurrentSnapshotId();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [
          {
            to: [accounts[1]],
            data: ["0x00"],
            value: [10],
          },
        ],
        account: accounts[3],
      });
      const guildProposalIdSnapshot = await erc20Guild.getProposalSnapshotId(
        guildProposalId
      );

      assert(snapshotIdBeforeProposal < guildProposalIdSnapshot);

      await guildToken.approve(tokenVault, 100000, { from: accounts[4] });
      await guildToken.approve(tokenVault, 200000, { from: accounts[5] });
      await erc20Guild.lockTokens(100000, { from: accounts[4] });
      await erc20Guild.lockTokens(200000, { from: accounts[5] });

      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[1], snapshotIdBeforeProposal),
        "50000"
      );
      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[1], guildProposalIdSnapshot),
        "50000"
      );
      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[2], snapshotIdBeforeProposal),
        "50000"
      );
      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[2], guildProposalIdSnapshot),
        "50000"
      );
      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[3], snapshotIdBeforeProposal),
        "0"
      );
      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[3], guildProposalIdSnapshot),
        "100000"
      );
      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[4], snapshotIdBeforeProposal),
        "0"
      );
      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[4], guildProposalIdSnapshot),
        "0"
      );
      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[5], snapshotIdBeforeProposal),
        "0"
      );
      assert.equal(
        await erc20Guild.votingPowerOfAt(accounts[5], guildProposalIdSnapshot),
        "0"
      );

      // Cant vote because it locked tokens after proposal
      await expectRevert(
        erc20Guild.setVote(guildProposalId, 1, 10, { from: accounts[4] }),
        "SnapshotERC20Guild: Invalid votingPower amount"
      );

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });

      assert.equal(await erc20Guild.votingPowerOf(accounts[1]), "50000");
      assert.equal(await erc20Guild.votingPowerOf(accounts[2]), "50000");
      assert.equal(await erc20Guild.votingPowerOf(accounts[3]), "100000");
      assert.equal(await erc20Guild.votingPowerOf(accounts[4]), "100000");
      assert.equal(await erc20Guild.votingPowerOf(accounts[5]), "200000");

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "3",
      });
    });
  });

  describe("End proposal", function () {
    beforeEach(async function () {
      await guildToken.approve(tokenVault, 100000, { from: accounts[3] });
      await guildToken.approve(tokenVault, 100000, { from: accounts[4] });

      await erc20Guild.lockTokens(100000, { from: accounts[3] });
      await erc20Guild.lockTokens(100000, { from: accounts[4] });
    });

    it("Proposals are marked as rejected if voted on 'No' option", async function () {
      const proposalId = await createProposal({
        guild: erc20Guild,
        actions: [
          {
            to: [accounts[1]],
            data: ["0x00"],
            value: [10],
          },
        ],
        account: accounts[1],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: proposalId,
        action: 2,
        account: accounts[2],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: proposalId,
        action: 2,
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: proposalId,
        action: 2,
        account: accounts[4],
      });

      await expectRevert(
        erc20Guild.endProposal(proposalId),
        "EnforcedBinarySnapshotERC20Guild: Proposal hasn't ended yet"
      );

      await time.increase(time.duration.seconds(31));

      const receipt = await erc20Guild.endProposal(proposalId);

      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "4",
      });
      await expectRevert(
        erc20Guild.endProposal(proposalId),
        "EnforcedBinarySnapshotERC20Guild: Proposal already executed"
      );

      const proposalInfo = await erc20Guild.getProposal(proposalId);
      assert.equal(proposalInfo.state, constants.GUILD_PROPOSAL_STATES.Failed);
    });

    it("Can successfully execute a proposal when not voted on the 'No' option", async function () {
      await web3.eth.sendTransaction({
        to: erc20Guild.address,
        value: 10,
        from: accounts[0],
      });

      const yetAnotherProposal = await createProposal({
        guild: erc20Guild,
        actions: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(
                EnforcedBinarySnapshotERC20Guild.abi
              ).methods
                .setPermission(
                  [constants.NULL_ADDRESS],
                  [constants.SOME_ADDRESS],
                  [testCallFrom(erc20Guild.address).substring(0, 10)],
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
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: yetAnotherProposal,
        action: 1,
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: yetAnotherProposal,
        action: 1,
        account: accounts[4],
      });
      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(yetAnotherProposal);

      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: yetAnotherProposal,
        newState: "3",
      });
    });
  });
});
