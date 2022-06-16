import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert } from "chai";
import * as helpers from "../../helpers";
const {
  createAndSetupGuildToken,
  createProposal,
  setVotesOnProposal,
} = require("../../helpers/guild");

const {
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");

const SnapshotERC20Guild = artifacts.require("SnapshotERC20Guild.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");

require("chai").should();

contract("SnapshotERC20Guild", function (accounts) {
  const constants = helpers.constants;

  let guildToken, tokenVault, erc20Guild, permissionRegistry;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6),
      [0, 50000, 50000, 100000, 100000, 200000]
    );

    permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    erc20Guild = await SnapshotERC20Guild.new();
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

    const setGlobaLPermissionProposal = await createProposal({
      guild: erc20Guild,
      actions: [
        {
          to: [erc20Guild.address],
          data: [
            await new web3.eth.Contract(SnapshotERC20Guild.abi).methods
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
      proposalId: setGlobaLPermissionProposal,
      action: 1,
      account: accounts[1],
    });
    await time.increase(30);
    await erc20Guild.endProposal(setGlobaLPermissionProposal);
  });

  describe("create proposal", function () {
    beforeEach(async function () {
      await web3.eth.sendTransaction({
        to: erc20Guild.address,
        value: 100,
        from: accounts[0],
      });
    });

    it("Can create proposal and vote only the ones with voting power when created", async function () {
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
      assert.equal(await erc20Guild.getTotalMembers(), 5);

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
    it("Can withdraw tokens after time limit", async function () {
      // move past the time lock period
      await time.increase(60 + 1);

      // Cant transfer because all user tokens are locked
      await expectRevert(
        guildToken.transfer(accounts[0], 50, { from: accounts[1] }),
        "ERC20: transfer amount exceeds balance"
      );

      // Cannot withdraw zero tokens
      await expectRevert(
        erc20Guild.withdrawTokens(0, { from: accounts[1] }),
        "SnapshotERC20Guild: amount of tokens to withdraw must be greater than 0"
      );

      // try to release more than locked and fail
      await expectRevert(
        erc20Guild.withdrawTokens(50001, { from: accounts[1] }),
        "ERC20Guild: Unable to withdraw more tokens than locked"
      );

      const txRelease = await erc20Guild.withdrawTokens(50000, {
        from: accounts[1],
      });

      const withdrawEvent = helpers.logDecoder.decodeLogs(
        txRelease.receipt.rawLogs
      )[1];
      assert.equal(withdrawEvent.name, "TokensWithdrawn");
      assert.equal(withdrawEvent.args[0], accounts[1]);
      assert.equal(withdrawEvent.args[1], 50000);
      assert.equal(await erc20Guild.getTotalMembers(), 1);

      const votes = await erc20Guild.votingPowerOf(accounts[1]);
      votes.should.be.bignumber.equal("0");
    });
  });
});
