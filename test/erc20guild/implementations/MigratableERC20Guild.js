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

const MigratableERC20Guild = artifacts.require("MigratableERC20Guild.sol");
const GlobalPermissionRegistry = artifacts.require("GlobalPermissionRegistry.sol");
const TokenVault = artifacts.require("TokenVault.sol");

require("chai").should();

contract("MigratableERC20Guild", function (accounts) {
  const constants = helpers.constants;
  const ZERO = new BN("0");
  const VOTE_GAS = new BN(90000) // 90k
  const MAX_GAS_PRICE = new BN(8000000000); // 8 gwei
  const REAL_GAS_PRICE = new BN(constants.GAS_PRICE); // 10 gwei (check config)

  let guildTokenA, guildTokenB, tokenVaultA, tokenVaultB, erc20Guild, globalPermissionRegistry, genericProposal;

  beforeEach(async function () {
    guildTokenA = await createAndSetupGuildToken(accounts.slice(0, 6), [
      0,
      50000,
      50000,
      100000,
      100000,
      200000
    ]);

    guildTokenB = await createAndSetupGuildToken(accounts.slice(0, 4), [
        0,
        500000,
        500000,
        500000
    ]);
    globalPermissionRegistry = await GlobalPermissionRegistry.new();

    erc20Guild = await MigratableERC20Guild.new();
    await erc20Guild.initialize(
      guildTokenA.address,
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

    tokenVaultB = await TokenVault.new();
    await tokenVaultB.initialize(guildTokenB.address, erc20Guild.address);
    
    const setPermissionToChangeTokenVault = await createProposal({
      guild: erc20Guild,
      actions: [{
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(MigratableERC20Guild.abi).methods
            .setPermission(
              [erc20Guild.address],
              [web3.eth.abi.encodeFunctionSignature("changeTokenVault(address)")],
              [0],
              [true]
            ).encodeABI()
        ],
        value: [0],
      }],
      account: accounts[1],
    });
    await setAllVotesOnProposal({
      guild: erc20Guild,
      proposalId: setPermissionToChangeTokenVault,
      action: 1,
      account: accounts[4],
    });
    await setAllVotesOnProposal({
      guild: erc20Guild,
      proposalId: setPermissionToChangeTokenVault,
      action: 1,
      account: accounts[5],
    });
    await time.increase(30);
    await erc20Guild.endProposal(setPermissionToChangeTokenVault);
  });
  
  describe("migrate", function () {

    it("Can migrate to a new vault and token", async function () {

      await guildTokenB.approve(tokenVaultB.address, 500000, { from: accounts[1] });
      await guildTokenB.approve(tokenVaultB.address, 500000, { from: accounts[2] });
      await erc20Guild.lockExternalTokens(500000, tokenVaultB.address, { from: accounts[1] });
      await erc20Guild.lockExternalTokens(500000, tokenVaultB.address, { from: accounts[2] });
      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(MigratableERC20Guild.abi)
                .methods.changeTokenVault(tokenVaultB.address).encodeABI()
            ],
            value: [0],
        }],
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });
      
      const txVote = await setAllVotesOnProposal({
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
        newState: "3"
      });

      assert.equal(await erc20Guild.votingPowerOf(accounts[1]), "500000");
      assert.equal(await erc20Guild.votingPowerOf(accounts[2]), "500000");
      assert.equal(await erc20Guild.votingPowerOf(accounts[3]), "0");
      assert.equal(await erc20Guild.votingPowerOf(accounts[4]), "0");
      assert.equal(await erc20Guild.votingPowerOf(accounts[5]), "0");

      assert.equal(await erc20Guild.getToken(), guildTokenB.address);
      assert.equal(await erc20Guild.getTokenVault(), tokenVaultB.address);

      await guildTokenB.approve(tokenVaultB.address, 500000, { from: accounts[3] });
      await erc20Guild.lockTokens(500000, { from: accounts[3] });
      assert.equal(await erc20Guild.votingPowerOf(accounts[3]), "500000");
    });

  });

});
