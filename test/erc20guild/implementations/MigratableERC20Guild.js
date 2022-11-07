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

const MigratableERC20Guild = artifacts.require("MigratableERC20Guild.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");
const TokenVault = artifacts.require("TokenVault.sol");
const TokenVaultThief = artifacts.require("TokenVaultThief.sol");

require("chai").should();

contract("MigratableERC20Guild", function (accounts) {
  let guildTokenA,
    guildTokenB,
    tokenVaultA,
    tokenVaultB,
    erc20Guild,
    permissionRegistry;

  beforeEach(async function () {
    guildTokenA = await createAndSetupGuildToken(
      accounts.slice(0, 6),
      [0, 50000, 50000, 100000, 100000, 200000]
    );

    guildTokenB = await createAndSetupGuildToken(
      accounts.slice(0, 4),
      [0, 500000, 500000, 500000]
    );
    permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    erc20Guild = await MigratableERC20Guild.new(
      guildTokenA.address,
      30,
      5000,
      100,
      "MigrateableGuild",
      60,
      permissionRegistry.address
    );

    tokenVaultA = await erc20Guild.getTokenVault();
    await guildTokenA.approve(tokenVaultA, 50000, { from: accounts[1] });
    await guildTokenA.approve(tokenVaultA, 50000, { from: accounts[2] });
    await guildTokenA.approve(tokenVaultA, 100000, { from: accounts[3] });
    await guildTokenA.approve(tokenVaultA, 100000, { from: accounts[4] });
    await guildTokenA.approve(tokenVaultA, 200000, { from: accounts[5] });
    await erc20Guild.lockTokens(50000, { from: accounts[1] });
    await erc20Guild.lockTokens(50000, { from: accounts[2] });
    await erc20Guild.lockTokens(100000, { from: accounts[3] });
    await erc20Guild.lockTokens(100000, { from: accounts[4] });
    await erc20Guild.lockTokens(200000, { from: accounts[5] });

    tokenVaultB = await TokenVault.new(guildTokenB.address, erc20Guild.address);
  });

  describe("migrate", function () {
    it("Can migrate to a new vault and token", async function () {
      await guildTokenB.approve(tokenVaultB.address, 500000, {
        from: accounts[1],
      });
      await guildTokenB.approve(tokenVaultB.address, 500000, {
        from: accounts[2],
      });
      await erc20Guild.lockExternalTokens(500000, tokenVaultB.address, {
        from: accounts[1],
      });
      await erc20Guild.lockExternalTokens(500000, tokenVaultB.address, {
        from: accounts[2],
      });

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(MigratableERC20Guild.abi).methods
                .changeTokenVault(tokenVaultB.address)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[3],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      assert.equal(await erc20Guild.votingPowerOf(accounts[1]), "50000");
      assert.equal(await erc20Guild.votingPowerOf(accounts[2]), "50000");

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "3",
      });

      assert.equal(await erc20Guild.votingPowerOf(accounts[1]), "500000");
      assert.equal(await erc20Guild.votingPowerOf(accounts[2]), "500000");
      assert.equal(await erc20Guild.votingPowerOf(accounts[3]), "0");
      assert.equal(await erc20Guild.votingPowerOf(accounts[4]), "0");
      assert.equal(await erc20Guild.votingPowerOf(accounts[5]), "0");

      assert.equal(await erc20Guild.getToken(), guildTokenB.address);
      assert.equal(await erc20Guild.getTokenVault(), tokenVaultB.address);

      await guildTokenB.approve(tokenVaultB.address, 500000, {
        from: accounts[3],
      });
      await erc20Guild.lockTokens(500000, { from: accounts[3] });
      assert.equal(await erc20Guild.votingPowerOf(accounts[3]), "500000");
    });
  });

  it("Cant migrate to a invalid new vault", async function () {
    tokenVaultB = await TokenVaultThief.new(
      guildTokenB.address,
      erc20Guild.address
    );

    await guildTokenB.approve(tokenVaultB.address, 500000, {
      from: accounts[1],
    });
    await guildTokenB.approve(tokenVaultB.address, 500000, {
      from: accounts[2],
    });
    await erc20Guild.lockExternalTokens(500000, tokenVaultB.address, {
      from: accounts[1],
    });
    await erc20Guild.lockExternalTokens(500000, tokenVaultB.address, {
      from: accounts[2],
    });

    const guildProposalId = await createProposal({
      guild: erc20Guild,
      actions: [
        {
          to: [erc20Guild.address],
          data: [
            await new web3.eth.Contract(MigratableERC20Guild.abi).methods
              .changeTokenVault(tokenVaultB.address)
              .encodeABI(),
          ],
          value: [0],
        },
      ],
      account: accounts[3],
    });
    await setVotesOnProposal({
      guild: erc20Guild,
      proposalId: guildProposalId,
      action: 1,
      account: accounts[3],
    });

    await setVotesOnProposal({
      guild: erc20Guild,
      proposalId: guildProposalId,
      action: 1,
      account: accounts[5],
    });

    assert.equal(await erc20Guild.votingPowerOf(accounts[1]), "50000");
    assert.equal(await erc20Guild.votingPowerOf(accounts[2]), "50000");

    await time.increase(time.duration.seconds(31));
    await expectRevert(
      erc20Guild.endProposal(guildProposalId),
      "ERC20Guild: Proposal call failed"
    );

    assert.equal(await erc20Guild.getToken(), guildTokenA.address);
    assert.equal(await erc20Guild.getTokenVault(), tokenVaultA);
  });

  describe("withdrawTokens", () => {
    it("Should revert action if withdrawn tokens are > than tokens locked", async () => {
      const votingPower = await erc20Guild.votingPowerOf(accounts[1]);
      await expectRevert(
        erc20Guild.withdrawTokens(votingPower.toNumber() + 1000, {
          from: accounts[1],
        }),
        "MigratableERC2Guild: Unable to withdraw more tokens than locked"
      );
    });
  });
});
