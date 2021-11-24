import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert } from "chai";
import { func } from "fast-check";
import * as helpers from "../../helpers";
const { fixSignature, toEthSignedMessageHash } = require("../../helpers/sign");
const {
  createDAO,
  createAndSetupGuildToken,
  createProposal,
  setAllVotesOnProposal,
} = require("../../helpers/guild");

const {
  BN,
  expectEvent,
  expectRevert,
  balance,
  send,
  ether,
  time,
} = require("@openzeppelin/test-helpers");

const AugurGuild = artifacts.require("AugurGuild.sol");
const SnapshotRepERC20Guild = artifacts.require("SnapshotRepERC20Guild.sol");
const GlobalPermissionRegistry = artifacts.require("GlobalPermissionRegistry.sol");
const TokenVault = artifacts.require("TokenVault.sol");
const AugurUniverseMock = artifacts.require("AugurUniverseMock.sol");
const ERC20SnapshotRep = artifacts.require("ERC20SnapshotRep.sol");

require("chai").should();

contract("AugurGuild", function (accounts) {
  const constants = helpers.constants;
  const ZERO = new BN("0");
  const VOTE_GAS = new BN(90000) // 90k
  const MAX_GAS_PRICE = new BN(8000000000); // 8 gwei
  const REAL_GAS_PRICE = new BN(constants.GAS_PRICE); // 10 gwei (check config)

  let guardianREPToken,
    guardianGuild,
    guildTokenA,
    guildTokenB,
    tokenVaultA, 
    tokenVaultB,
    augurGuild,
    globalPermissionRegistry,
    augurUniverseA,
    augurUniverseB;

  beforeEach(async function () {
    globalPermissionRegistry = await GlobalPermissionRegistry.new();

    guardianREPToken = await ERC20SnapshotRep.new("AugurGuildGuardianToken", "AGGT", {from: accounts[0]});
    await guardianREPToken.mint(accounts[7], "500000");
    await guardianREPToken.mint(accounts[8], "500000");
    await guardianREPToken.mint(accounts[9], "500000");
    guardianGuild = await SnapshotRepERC20Guild.new();
    await guardianGuild.initialize(
      guardianREPToken.address,
      10,
      20,
      5000,
      100,
      "AugurGuardianGuild",
      0,
      0,
      10,
      60,
      globalPermissionRegistry.address
    );

    guildTokenA = await createAndSetupGuildToken(accounts.slice(0, 6), [
      0,
      50000,
      50000,
      100000,
      100000,
      200000
    ]);
    augurUniverseA = await AugurUniverseMock.new(guildTokenA.address);

    guildTokenB = await createAndSetupGuildToken(accounts.slice(0, 4), [
        0,
        500000,
        500000,
        500000
    ]);
    augurUniverseB = await AugurUniverseMock.new(guildTokenB.address);

    augurGuild = await AugurGuild.new();
    await augurGuild
      .methods["initialize(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address,address)"](
        guildTokenA.address,
        30,
        30,
        5000,
        100,
        0,
        0,
        10,
        60,
        globalPermissionRegistry.address,
        augurUniverseA.address
    );

    tokenVaultA = await augurGuild.getTokenVault();
    await guildTokenA.approve(tokenVaultA, 50000, { from: accounts[1] });
    await guildTokenA.approve(tokenVaultA, 50000, { from: accounts[2] });
    await guildTokenA.approve(tokenVaultA, 100000, { from: accounts[3] });
    await guildTokenA.approve(tokenVaultA, 100000, { from: accounts[4] });
    await guildTokenA.approve(tokenVaultA, 200000, { from: accounts[5] });
    await augurGuild.lockTokens(50000, { from: accounts[1] });
    await augurGuild.lockTokens(50000, { from: accounts[2] });
    await augurGuild.lockTokens(100000, { from: accounts[3] });
    await augurGuild.lockTokens(100000, { from: accounts[4] });
    await augurGuild.lockTokens(200000, { from: accounts[5] });

    tokenVaultB = await TokenVault.new();
    await tokenVaultB.initialize(guildTokenB.address, augurGuild.address);
    
    const setAugurGuildPermissionsProposal = await createProposal({
      guild: augurGuild,
      actions: [{
        to: [augurGuild.address, augurGuild.address],
        data: [
          await new web3.eth.Contract(AugurGuild.abi).methods
            .setPermission(
              [constants.ANY_ADDRESS],
              [constants.ANY_FUNC_SIGNATURE],
              [100],
              [true]
            ).encodeABI(),
          await new web3.eth.Contract(AugurGuild.abi).methods
            .setGuardianConfig(guardianGuild.address, 30).encodeABI(), 
        ],
        value: [0, 0],
      }],
      account: accounts[1],
    });
    await setAllVotesOnProposal({
      guild: augurGuild,
      proposalId: setAugurGuildPermissionsProposal,
      action: 1,
      account: accounts[4],
    });
    await setAllVotesOnProposal({
      guild: augurGuild,
      proposalId: setAugurGuildPermissionsProposal,
      action: 1,
      account: accounts[5],
    });
    await time.increase(31);
    await augurGuild.endProposal(setAugurGuildPermissionsProposal);

    const setAugurGuardianGuildPermissionsProposal = await createProposal({
      guild: guardianGuild,
      actions: [{
        to: [guardianGuild.address],
        data: [
          await new web3.eth.Contract(AugurGuild.abi).methods
            .setPermission(
              [augurGuild.address],
              [constants.ANY_FUNC_SIGNATURE],
              [0],
              [true]
            ).encodeABI()
        ],
        value: [0],
      }],
      account: accounts[7],
    });
    await setAllVotesOnProposal({
      guild: guardianGuild,
      proposalId: setAugurGuardianGuildPermissionsProposal,
      action: 1,
      account: accounts[7],
    });
    await setAllVotesOnProposal({
      guild: guardianGuild,
      proposalId: setAugurGuardianGuildPermissionsProposal,
      action: 1,
      account: accounts[8],
    });
    await time.increase(10);
    await guardianGuild.endProposal(setAugurGuardianGuildPermissionsProposal);
  });
  
  describe("migrate", function () {

    beforeEach( async function() {
      await web3.eth.sendTransaction({to: augurGuild.address, value: 100, from: accounts[0]});
    })

    it("Can migrate to a new vault and token", async function () {

      await guildTokenB.approve(tokenVaultB.address, 500000, { from: accounts[1] });
      await guildTokenB.approve(tokenVaultB.address, 500000, { from: accounts[2] });
      await augurGuild.lockExternalTokens(500000, tokenVaultB.address, { from: accounts[1] });
      await augurGuild.lockExternalTokens(500000, tokenVaultB.address, { from: accounts[2] });
      
      // A fork disputes happen in augur and is set to happens in 60 seconds
      const forkTime = await time.latest() + 60;
      console.log(augurUniverseB.address, forkTime)
      await augurUniverseA.setFork(augurUniverseB.address, forkTime);

      // Advance 40 seconds and create a proposal that wont be able to execute
      await time.increase(time.duration.seconds(40));

      const guildProposalId = await createProposal({
        guild: augurGuild,
        actions: [{
            to: [accounts[1]],
            data: ["0x00"],
            value: [10],
        }],
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: augurGuild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: augurGuild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });
      
      assert.equal(await augurGuild.votingPowerOf(accounts[1]), "50000");
      assert.equal(await augurGuild.votingPowerOf(accounts[2]), "50000");

      await time.increaseTo(forkTime + 1);
      await augurGuild.changeTokenVault(tokenVaultB.address);

      await time.increase(time.duration.seconds(10));

      // The proposal will fail because it was created before the fork
      const receipt = await augurGuild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "4"
      });

      assert.equal(await augurGuild.votingPowerOf(accounts[1]), "500000");
      assert.equal(await augurGuild.votingPowerOf(accounts[2]), "500000");
      assert.equal(await augurGuild.votingPowerOf(accounts[3]), "0");
      assert.equal(await augurGuild.votingPowerOf(accounts[4]), "0");
      assert.equal(await augurGuild.votingPowerOf(accounts[5]), "0");

      assert.equal(await augurGuild.getToken(), guildTokenB.address);
      assert.equal(await augurGuild.getTokenVault(), tokenVaultB.address);

      await guildTokenB.approve(tokenVaultB.address, 500000, { from: accounts[3] });
      await augurGuild.lockTokens(500000, { from: accounts[3] });
      assert.equal(await augurGuild.votingPowerOf(accounts[3]), "500000");

      const guildProposalId2 = await createProposal({
        guild: augurGuild,
        actions: [{
            to: [accounts[1]],
            data: ["0x00"],
            value: [10],
        }],
        account: accounts[1],
      });
      await setAllVotesOnProposal({
        guild: augurGuild,
        proposalId: guildProposalId2,
        action: 1,
        account: accounts[1],
      });
      await setAllVotesOnProposal({
        guild: augurGuild,
        proposalId: guildProposalId2,
        action: 1,
        account: accounts[2],
      });

      await time.increase(time.duration.seconds(30));

      // The proposal wont end because it is still in guardian check time
      await expectRevert(
        augurGuild.endProposal(guildProposalId2),
        "GuardedERC20Guild: Proposal hasn't ended yet for guild"
      );

      const endGuildProposalFromGuardianGuild = await createProposal({
        guild: guardianGuild,
        actions: [{
          to: [augurGuild.address],
          data: [
            await new web3.eth.Contract(AugurGuild.abi).methods
              .endProposal(guildProposalId2).encodeABI()
          ],
          value: [0]
        }],
        account: accounts[7],
      });
      await setAllVotesOnProposal({
        guild: guardianGuild,
        proposalId: endGuildProposalFromGuardianGuild,
        action: 1,
        account: accounts[7],
      });
      await setAllVotesOnProposal({
        guild: guardianGuild,
        proposalId: endGuildProposalFromGuardianGuild,
        action: 1,
        account: accounts[8],
      });

      await time.increase(time.duration.seconds(10));

      // The proposal wont end because it is still in guardian check time
      await expectRevert(
        augurGuild.endProposal(guildProposalId2),
        "GuardedERC20Guild: Proposal hasn't ended yet for guild"
      );

      // End proposal from guardian guild
      const endGuildProposalFromGuardianGuildTx = await guardianGuild.endProposal(endGuildProposalFromGuardianGuild);
      expectEvent(endGuildProposalFromGuardianGuildTx, "ProposalStateChanged", {
        proposalId: endGuildProposalFromGuardianGuild,
        newState: "3"
      });
      expectEvent(endGuildProposalFromGuardianGuildTx, "ProposalStateChanged", {
        proposalId: guildProposalId2,
        newState: "3"
      });

    });

  });

});
