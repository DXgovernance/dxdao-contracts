import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert } from "chai";
import { func } from "fast-check";
import * as helpers from "../helpers";
const { fixSignature, toEthSignedMessageHash } = require("../helpers/sign");
const {
  createDAO,
  createAndSetupGuildToken,
  createProposal,
  setAllVotesOnProposal,
} = require("../helpers/guild");

const {
  BN,
  expectEvent,
  expectRevert,
  balance,
  send,
  ether,
  time,
} = require("@openzeppelin/test-helpers");

const ERC20Guild = artifacts.require("ERC20Guild.sol");
const GlobalPermissionRegistry = artifacts.require("GlobalPermissionRegistry.sol");
const IERC20Guild = artifacts.require("IERC20Guild.sol");
const ActionMock = artifacts.require("ActionMock.sol");

require("chai").should();

contract("ERC20Guild", function (accounts) {
  const constants = helpers.constants;
  const ZERO = new BN("0");
  const VOTE_GAS = new BN(90000) // 90k
  const MAX_GAS_PRICE = new BN(8000000000); // 8 gwei
  const REAL_GAS_PRICE = new BN(constants.GAS_PRICE); // 10 gwei (check config)

  let guildToken,
    actionMockA,
    actionMockB,
    erc20Guild,
    globalPermissionRegistry,
    genericProposal;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(accounts.slice(0, 6), [
      0,
      50000,
      50000,
      100000,
      100000,
      200000
    ]);
    globalPermissionRegistry = await GlobalPermissionRegistry.new();

    erc20Guild = await IERC20Guild.at((await ERC20Guild.new()).address);
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
      globalPermissionRegistry.address
    );

    actionMockA = await ActionMock.new();
    actionMockB = await ActionMock.new();
    genericProposal = {
      guild: erc20Guild,
      actions: [{
        to: [actionMockA.address, actionMockA.address],
        data: [helpers.testCallFrom(erc20Guild.address), helpers.testCallFrom(erc20Guild.address, 666)],
        value: [new BN("0"), new BN("0")],
      },{
        to: [actionMockA.address, constants.NULL_ADDRESS],
        data: [helpers.testCallFrom(erc20Guild.address), "0x00"],
        value: [new BN("101"), new BN("0")],
      },{
        to: [actionMockB.address, , constants.NULL_ADDRESS],
        data: [helpers.testCallFrom(erc20Guild.address, 666), "0x00"],
        value: [new BN("10"), new BN("0")],
      }],
      account: accounts[3],
    };
  });

  const lockTokens = async function() {
    const tokenVault = await erc20Guild.getTokenVault();
    await guildToken.approve(tokenVault, 50000, { from: accounts[1] });
    await guildToken.approve(tokenVault, 50000, { from: accounts[2] });
    await guildToken.approve(tokenVault, 100000, { from: accounts[3] });
    await guildToken.approve(tokenVault, 100000, { from: accounts[4] });
    await guildToken.approve(tokenVault, 200000, { from: accounts[5] });
    await erc20Guild.lockTokens(50000, { from: accounts[1] });
    await erc20Guild.lockTokens(50000, { from: accounts[2] });
    await erc20Guild.lockTokens(100000, { from: accounts[3] });
    await erc20Guild.lockTokens(100000, { from: accounts[4] });
    await erc20Guild.lockTokens(200000, { from: accounts[5] });
  }

  const allowActionMockA = async function() {

    const setPermissionToActionMockA = await createProposal({
      guild: erc20Guild,
      actions: [{
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(ERC20Guild.abi).methods
            .setPermission(
              [constants.NULL_ADDRESS, constants.NULL_ADDRESS, constants.NULL_ADDRESS],
              [constants.ANY_ADDRESS, actionMockA.address, actionMockA.address],
              [constants.ANY_FUNC_SIGNATURE, constants.ANY_FUNC_SIGNATURE, helpers.testCallFrom(erc20Guild.address).substring(0, 10)],
              [200, 100, 50],
              [true, true, true]
            ).encodeABI()
        ],
        value: [0],
      }],
      account: accounts[1],
    });
    await setAllVotesOnProposal({
      guild: erc20Guild,
      proposalId: setPermissionToActionMockA,
      action: 1,
      account: accounts[4],
    });
    await setAllVotesOnProposal({
      guild: erc20Guild,
      proposalId: setPermissionToActionMockA,
      action: 1,
      account: accounts[5],
    });
    await time.increase(30);
    await erc20Guild.endProposal(setPermissionToActionMockA);
  }
  
  describe("EIP1271", function () {

    beforeEach(async function() {
      await lockTokens();
      await allowActionMockA();
    });

    it("Can validate an EIP1271 Signature", async function () {
      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [erc20Guild.address],
          data: [await new web3.eth.Contract(ERC20Guild.abi).methods
            .setEIP1271SignedHash(toEthSignedMessageHash(constants.SOME_HASH), true)
            .encodeABI()],
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
      
      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(90000);
      
      const voteEvent = helpers.logDecoder.decodeLogs(txVote.receipt.rawLogs)[0];
      assert.equal(voteEvent.name, "VoteAdded")
      assert.equal(voteEvent.args[0], guildProposalId);
      assert.equal(voteEvent.args[1], 1);
      assert.equal(voteEvent.args[2], accounts[5]);
      assert.equal(voteEvent.args[3], 200000);
      
      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "3"
      });
      assert.equal(await erc20Guild.getEIP1271SignedHash(toEthSignedMessageHash(constants.SOME_HASH)), true);
      
      const validSignature = await web3.eth.sign(constants.SOME_HASH, accounts[5]);
      const invalidSignature = await web3.eth.sign(constants.SOME_HASH, accounts[10]);

      assert.equal(
        await erc20Guild.isValidSignature(toEthSignedMessageHash(constants.SOME_HASH), validSignature),
        web3.eth.abi.encodeFunctionSignature("isValidSignature(bytes32,bytes)")
      );
      
      assert.equal(
        await erc20Guild.isValidSignature(toEthSignedMessageHash(constants.SOME_HASH), invalidSignature),
        "0x00000000"
      );
      
    });

  });

  describe("initialization", function () {

    it("initial values are correct", async function () {
      assert.equal(await erc20Guild.getToken(), guildToken.address);
      assert.equal(await erc20Guild.getPermissionRegistry(), globalPermissionRegistry.address);
      assert.equal(await erc20Guild.getName(), "TestGuild");
      assert.equal(await erc20Guild.getTotalProposals(), 0);
      assert.equal(await erc20Guild.getActiveProposalsNow(), 0);
      assert.equal(await erc20Guild.getProposalsIdsLength(), 0);
      assert.deepEqual(await erc20Guild.getProposalsIds(), []);
    });

    it("cannot initialize with zero token", async function () {
      erc20Guild = await ERC20Guild.new();
      await expectRevert(
        erc20Guild.initialize(
          constants.NULL_ADDRESS,
          30,
          30,
          5000,
          100,
          "TestGuild",
          0,
          0,
          3,
          60,
          globalPermissionRegistry.address
        ),
        "ERC20Guild: token cant be zero address"
      );
    });

    it("cannot initialize with zero proposalTime", async function () {
      erc20Guild = await ERC20Guild.new();
      await expectRevert(
        erc20Guild.initialize(
          guildToken.address,
          0,
          30,
          5000,
          100,
          "TestGuild",
          0,
          0,
          3,
          60,
          globalPermissionRegistry.address
        ),
        "ERC20Guild: proposal time has to be more tha 0"
      );
    });

    it("cannot initialize with lockTime lower than proposalTime", async function () {
      erc20Guild = await ERC20Guild.new();
      await expectRevert(
        erc20Guild.initialize(
          guildToken.address,
          30,
          30,
          5000,
          100,
          "TestGuild",
          0,
          0,
          3,
          29,
          globalPermissionRegistry.address
        ),
        "ERC20Guild: lockTime has to be higher or equal to proposalTime"
      );
    });

    it("cannot initialize with zero locktime", async function () {
      erc20Guild = await ERC20Guild.new();
      await expectRevert(
        erc20Guild.initialize(
          guildToken.address,
          30,
          30,
          0,
          100,
          "TestGuild",
          0,
          0,
          3,
          60,
          globalPermissionRegistry.address
        ),
        "ERC20Guild: voting power for execution has to be more than 0"
      );
    });

    it("cannot initialize twice", async function () {
      erc20Guild = await ERC20Guild.at(erc20Guild.address);
      await expectRevert(
        erc20Guild.initialize(
          guildToken.address,
          30,
          30,
          5000,
          100,
          "TestGuild",
          0,
          0,
          3,
          60,
          globalPermissionRegistry.address
        ),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("setConfig", function () {

    beforeEach(async function() {
      await lockTokens();
    });

    it("execute an ERC20Guild setConfig proposal on the guild", async function () {
      
      const guildTokenTotalSupply = await guildToken.totalSupply();

      assert.equal(await erc20Guild.getProposalTime(), 30);
      assert.equal(await erc20Guild.getTimeForExecution(), 30);
      assert.equal(
        (await erc20Guild.getVotingPowerForProposalExecution()).toString(), 
        guildTokenTotalSupply.mul(new BN("5000")).div(new BN("10000")).toString()
      );
      assert.equal(
        (await erc20Guild.getVotingPowerForProposalCreation()).toString(), 
        guildTokenTotalSupply.mul(new BN("100")).div(new BN("10000")).toString()
      );
      assert.equal(await erc20Guild.getVoteGas(), 0);
      assert.equal(await erc20Guild.getMaxGasPrice(), 0);
      assert.equal(await erc20Guild.getMaxActiveProposals(), 10);
      assert.equal(await erc20Guild.getLockTime(), 60);
      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [erc20Guild.address],
          data: [await new web3.eth.Contract(ERC20Guild.abi).methods
              .setConfig("15", "30", "5001", "1001", "1", "10", "4", "61")
              .encodeABI()],
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

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", { proposalId: guildProposalId, newState: "3" });


      assert.equal(await erc20Guild.getProposalTime(), 15);
      assert.equal(await erc20Guild.getTimeForExecution(), 30);
      assert.equal(
        (await erc20Guild.getVotingPowerForProposalExecution()).toString(), 
        guildTokenTotalSupply.mul(new BN("5001")).div(new BN("10000")).toString()
      );
      assert.equal(
        (await erc20Guild.getVotingPowerForProposalCreation()).toString(), 
        guildTokenTotalSupply.mul(new BN("1001")).div(new BN("10000")).toString()
      );
      assert.equal(await erc20Guild.getVoteGas(), 1);
      assert.equal(await erc20Guild.getMaxGasPrice(), 10);
      assert.equal(await erc20Guild.getMaxActiveProposals(), 4);
      assert.equal(await erc20Guild.getLockTime(), 61);
    });
  });

  describe("setPermission", function () {

    beforeEach(async function() {
      await lockTokens();
    });

    it("Reverts when not called by guild", async function () {
      await expectRevert(
        erc20Guild.setPermission([constants.NULL_ADDRESS], [actionMockA.address], ["0x0"], [1], [true]),
        "ERC20Guild: Only callable by ERC20guild itself"
      );
    });

    it("Reverts when proposal exec calls setPermission with invalid params", async function () {
      const setPermissionEncoded = await new web3.eth.Contract(
        ERC20Guild.abi
      ).methods
        .setPermission([constants.NULL_ADDRESS], [actionMockB.address], [helpers.testCallFrom(erc20Guild.address).substring(0, 10)], [], [true])
        .encodeABI();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [erc20Guild.address],
          data: [setPermissionEncoded],
          value: [0],
        }],
        account: accounts[2],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[2],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal call failed"
      );
    });

    it("Proposal for setting new method with empty signature allowance for guild should fail", async function () {
      const setPermissionEncoded = await new web3.eth.Contract(
        ERC20Guild.abi
      ).methods
        .setPermission([constants.NULL_ADDRESS], [actionMockB.address], ["0x0"], [0], [true])
        .encodeABI();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [erc20Guild.address],
          data: [setPermissionEncoded],
          value: [0],
        }],
        account: accounts[2],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[2],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal call failed"
      );
      assert.equal(
        await globalPermissionRegistry.getPermissionTime(constants.NULL_ADDRESS, erc20Guild.address, actionMockA.address, "0x0"),
        "0"
      );
    });

    it("Proposal for setting permission delay should succeed", async function () {
      assert.equal( await globalPermissionRegistry.getPermissionDelay(erc20Guild.address), "0" );

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [erc20Guild.address],
          data: [await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods
            .setPermissionDelay(120)
            .encodeABI()],
          value: [0],
        }],
        account: accounts[2],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[4],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(guildProposalId),
      
      assert.equal( await globalPermissionRegistry.getPermissionDelay(erc20Guild.address), "120" );
    });
  });

  describe("createProposal", function () {

    beforeEach(async function() {
      await lockTokens();
    });

    it("cannot create a proposal without enough creation votes", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [actionMockA.address],
          ["0x00"],
          [1],
          1,
          "Guild Test Proposal",
          constants.SOME_HASH,
          { from: accounts[9] }
        ),
        "ERC20Guild: Not enough votes to create proposal"
      );
    });

    it("cannot create a proposal with uneven _to and _data arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [actionMockA.address],
          [],
          [0],
          1,
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with uneven _to and _value arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [actionMockA.address],
          ["0x0"],
          [],
          1,
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with empty _to, _data and _value arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [],
          [],
          [],
          1,
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: to, data value arrays cannot be empty"
      );
    });

    it("cannot create a proposal if the max amount of active proposals is reached", async function () {
      const firstProposalId = await createProposal(genericProposal);
      assert.equal(await erc20Guild.getActiveProposalsNow(), "1");
      await time.increase(10);

      // Create 9 more proposals and have 10 active proposals
      for (let i = 0; i < 9; i++)
        await createProposal(genericProposal);        

      assert.equal(await erc20Guild.getActiveProposalsNow(), "10");

      // Cant create because maxActiveProposals limit reached
      await expectRevert(
        createProposal(genericProposal),
        "ERC20Guild: Maximum amount of active proposals reached"
      );

      // Finish one proposal and can create another
      await time.increase(20);
      await erc20Guild.endProposal(firstProposalId);
      assert.equal(await erc20Guild.getActiveProposalsNow(), "9");

      await createProposal(genericProposal);
    });

  });

  describe("endProposal", function () {

    beforeEach(async function() {
      await lockTokens();
    });

    it("cannot execute as proposal not ended yet", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal hasn't ended yet"
      );
    });

    it("proposal rejected as not enough tokens to execute proposal when proposal ends", async function () {
      const guildProposalId = await createProposal(genericProposal);
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });
      await time.increase(time.duration.seconds(61));

      await erc20Guild.endProposal(guildProposalId);
      const { state } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(state, constants.WalletSchemeProposalState.rejected);
    });

    it("cannot end proposal with an unauthorized function", async function () {
      const testWithNoargsEncoded = await new web3.eth.Contract(
        ActionMock.abi
      ).methods
        .testWithNoargs()
        .encodeABI();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [actionMockA.address],
          data: [testWithNoargsEncoded],
          value: [0],
        }],
        account: accounts[2],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[2],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "GlobalPermissionRegistry: Call not allowed"
      );
    });

    it("proposal fail because it run out of time to execute", async function () {

      const guildProposalId = await createProposal(genericProposal);
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 2,
        account: accounts[2],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 2,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(30));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "GlobalPermissionRegistry: Call not allowed"
      );

      await time.increase(time.duration.seconds(30));
      await erc20Guild.endProposal(guildProposalId);
      assert.equal((await erc20Guild.getProposal(guildProposalId)).state, 4);
    });

  });
  
  describe("setVotes", function () {

    beforeEach(async function() {
      await lockTokens();
      await allowActionMockA();
    })

    it("can set setVotes more efficient than multiple setVote", async function () {
      const guildProposalId1 = await createProposal(genericProposal);
      const guildProposalId2 = await createProposal(genericProposal);
      const guildProposalId3 = await createProposal(genericProposal);
      const guildProposalId4 = await createProposal(genericProposal);
      const guildProposalId5 = await createProposal(genericProposal);
      const guildProposalId6 = await createProposal(genericProposal);
      const guildProposalId7 = await createProposal(genericProposal);
      const guildProposalId8 = await createProposal(genericProposal);
      const guildProposalId9 = await createProposal(genericProposal);
      const guildProposalId10 = await createProposal(genericProposal);

      // Check length of arrays requires
      await expectRevert(
        erc20Guild.setVotes(
          [guildProposalId1, guildProposalId2],
          [1, 1, 1],
          [50, 40],
          { from: accounts[1] }
        ),
        "ERC20Guild: Wrong length of proposalIds, actions or votingPowers"
      );
      await expectRevert(
        erc20Guild.setVotes(
          [guildProposalId1, guildProposalId2],
          [1, 1],
          [50, 40, 10],
          { from: accounts[1] }
        ),
        "ERC20Guild: Wrong length of proposalIds, actions or votingPowers"
      );

      // Using setVotes for a two votes is not almost the same cost as two setVote
      const txVote0 = await erc20Guild.setVotes(
        [guildProposalId1, guildProposalId2],
        [1, 2],
        [50, 40],
        { from: accounts[1] }
      );

      const votesOfVoter = await erc20Guild.getProposalVotesOfVoter(guildProposalId2, accounts[1]);
      assert.equal(votesOfVoter.action, 2);
      assert.equal(votesOfVoter.votingPower, 40);
 
      if (constants.GAS_PRICE > 1)
        expect(txVote0.receipt.gasUsed/(VOTE_GAS*2)).to.be.below(1.011);

      // Using setVotes for three votes is 17% more efficient than three setVote
      const txVote1 = await erc20Guild.setVotes(
        [guildProposalId1, guildProposalId2, guildProposalId3],
        [1, 2, 3],
        [50, 40, 30],
        { from: accounts[2] }
      );

      if (constants.GAS_PRICE > 1)
        expect(txVote1.receipt.gasUsed/(VOTE_GAS*3)).to.be.below(0.83);

      // Using setVotes for five votes is 20% more efficient than five setVote
      const txVote2 = await erc20Guild.setVotes(
        [guildProposalId1, guildProposalId2, guildProposalId3, guildProposalId4, guildProposalId5],
        [1, 2, 3, 1, 2],
        [50, 40, 30, 20, 10],
        { from: accounts[3] }
      );

      if (constants.GAS_PRICE > 1)
        expect(txVote2.receipt.gasUsed/(VOTE_GAS*5)).to.be.below(0.8);

      // Using setVotes for ten votes is 21.5% more efficient than ten setVote
      const txVote3 = await erc20Guild.setVotes(
        [guildProposalId1, guildProposalId2, guildProposalId3, guildProposalId4, guildProposalId5,
        guildProposalId6, guildProposalId7, guildProposalId8, guildProposalId9, guildProposalId10],
        [1, 2, 3, 1, 2, 3, 1, 2, 3, 1],
        [50, 40, 30, 20, 10, 10, 20, 30, 40, 50],
        { from: accounts[4] }
      );

      if (constants.GAS_PRICE > 1)
        expect(txVote3.receipt.gasUsed/(VOTE_GAS*10)).to.be.below(0.785);

    });

    it("cannot set votes once executed", async function () {
      const guildProposalId = await createProposal(genericProposal);
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", { proposalId: guildProposalId, newState: "3" });

      await expectRevert(
        erc20Guild.setVote(guildProposalId, 1, 1, { from: accounts[2] }),
        "ERC20Guild: Proposal ended, cant be voted"
      );
    });

    it("cannot set votes exceeded your voting balance", async function () {
      const guildProposalId = await createProposal(genericProposal);
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });

      await expectRevert(
        erc20Guild.setVote(guildProposalId, 1, 50001, { from: accounts[1] }),
        "ERC20Guild: Invalid votingPower amount"
      );
    });

    it("can increase but no decrease the votes on a proposal", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await erc20Guild.setVote(guildProposalId, 1, 1, { from: accounts[5] });

      await erc20Guild.setVote(guildProposalId, 1, 100, { from: accounts[5] });

      await expectRevert(
        erc20Guild.setVote(guildProposalId, 1, 99, { from: accounts[5] }),
        "ERC20Guild: Invalid votingPower amount"
      );
    });
  });
  describe("permission registry checks", function () {

    beforeEach(async function() {
      await lockTokens();
      await allowActionMockA();

      const setPermissionToActionMockB = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [erc20Guild.address],
          data: [
            await new web3.eth.Contract(ERC20Guild.abi).methods
              .setPermission(
                [constants.NULL_ADDRESS],
                [actionMockB.address],
                [constants.ANY_FUNC_SIGNATURE],
                [0],
                [false]
              ).encodeABI()
          ],
          value: [0],
        }],
        account: accounts[1],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: setPermissionToActionMockB,
        action: 1,
        account: accounts[4],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: setPermissionToActionMockB,
        action: 1,
        account: accounts[5],
      });
      await time.increase(30);
      await erc20Guild.endProposal(setPermissionToActionMockB);

    });

    it("fail to execute a not allowed proposal to a contract from the guild", async function () {
      await web3.eth.sendTransaction({to: erc20Guild.address, value: 300, from: accounts[0]});

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [actionMockB.address],
          data: [helpers.testCallFrom(erc20Guild.address)],
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

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "GlobalPermissionRegistry: Call not allowed"
      );
    });

    it("fail to execute a transfer over global transfer limits", async function () {
      await web3.eth.sendTransaction({to: erc20Guild.address, value: 300, from: accounts[0]});

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [accounts[8], accounts[7], actionMockA.address],
          data: ["0x00", "0x00", helpers.testCallFrom(erc20Guild.address)],
          value: [100, 51, 50],
        }],
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "GlobalPermissionRegistry: Value limit reached"
      );
    });

    it("fail to execute a transfer exceeding the allowed on a call", async function () {
      await web3.eth.sendTransaction({to: erc20Guild.address, value: 300, from: accounts[0]});

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [actionMockA.address, actionMockA.address],
          data: [helpers.testCallFrom(erc20Guild.address), helpers.testCallFrom(erc20Guild.address)],
          value: [25, 26],
        }],
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "GlobalPermissionRegistry: Value limit reached"
      );
    });

    it("fail to execute a transfer exceeding the allowed on a wildcard permission call", async function () {
      await web3.eth.sendTransaction({to: erc20Guild.address, value: 300, from: accounts[0]});

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [actionMockA.address, actionMockA.address],
          data: ["0x00", "0x00"],
          value: [50, 51],
        }],
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[3],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "GlobalPermissionRegistry: Value limit reached'"
      );
    });

  });

  describe("complete proposal process", function () {

    beforeEach(async function() {
      await lockTokens();
      await allowActionMockA();
    });

    it("execute a proposal to a contract from the guild", async function () {

      await web3.eth.sendTransaction({to: erc20Guild.address, value: 10, from: accounts[0]});

      const allowActionMock = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [erc20Guild.address],
          data: [await new web3.eth.Contract(ERC20Guild.abi).methods
            .setPermission(
              [constants.NULL_ADDRESS],
              [actionMockB.address],
              [helpers.testCallFrom(erc20Guild.address).substring(0, 10)],
              [10],
              [true]
            ).encodeABI()],
          value: [0],
        }],
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: allowActionMock,
        action: 1,
        account: accounts[3],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: allowActionMock,
        action: 1,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(allowActionMock);

      const guildProposalId = await createProposal(genericProposal);
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 3,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 3,
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(VOTE_GAS.toNumber());

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", { proposalId: guildProposalId, newState: "3" });
      expectEvent.inTransaction(receipt.tx, actionMockB, "ReceivedEther", {_sender: erc20Guild.address, _value: "10"});
      expectEvent.inTransaction(receipt.tx, actionMockB, "LogNumber", { number: "666"});
    });


    it("can read proposal details of proposal", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const {
        creator,
        startTime,
        endTime,
        to,
        data,
        value,
        title,
        contentHash,
        totalVotes,
        state,
      } = await erc20Guild.getProposal(guildProposalId);

      const callsTo = [], callsData = [], callsValue = [];
      genericProposal.actions.map(action => {
        action.to.map(to => callsTo.push(to));
        action.data.map(data => callsData.push(data));
        action.value.map(value => callsValue.push(value));
      });

      assert.equal(creator, accounts[3]);
      const now = await time.latest();
      assert.equal(startTime.toString(), now.toString());
      assert.equal(endTime.toString(), now.add(new BN("30")).toString());
      assert.deepEqual(to, callsTo);
      assert.deepEqual(data, callsData);
      // assert.equal(value, callsValue);
      assert.equal(title, "Awesome Proposal Title");
      assert.equal(contentHash, constants.SOME_HASH);
      // assert.equal(totalVotes, [new BN("0"), new BN("0")]);
      assert.equal(state, "1");
    });

    it("can read votingPowerOf single accounts", async function () {
      const votes = await erc20Guild.votingPowerOf(accounts[2]);
      votes.should.be.bignumber.equal("50000");
    });

    it("can read votingPowerOf multiple accounts", async function () {
      const res = await erc20Guild.votingPowerOfMultiple([
        accounts[2],
        accounts[5],
      ]);
      res[0].should.be.bignumber.equal("50000");
      res[1].should.be.bignumber.equal("200000");
    });
  });

  describe("lock/release tokens", function () {

    it("can lock/release tokens", async function () {
      const tokenVault = await erc20Guild.getTokenVault();
      const TIMELOCK = new BN("60");

      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50000, { from: accounts[1] });

      const txLock = await erc20Guild.lockTokens(50000, { from: accounts[1] });
      const lockEvent = helpers.logDecoder.decodeLogs(txLock.receipt.rawLogs)[2];
      assert.equal(lockEvent.name, "TokensLocked")
      assert.equal(lockEvent.args[0], accounts[1]);
      assert.equal(lockEvent.args[1], 50000);

      const now = await time.latest();
      let voterLockTimestamp = await erc20Guild.getVoterLockTimestamp(accounts[1]);
      voterLockTimestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      let voterLocked = await erc20Guild.votingPowerOf(accounts[1]);
      voterLocked.should.be.bignumber.equal("50000");

      let votes = await erc20Guild.votingPowerOf(accounts[1]);
      votes.should.be.bignumber.equal("50000");

      let totalLocked = await erc20Guild.getTotalLocked();
      totalLocked.should.be.bignumber.equal("50000");
      
      // try lo release before time and fail
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.withdrawTokens(1, { from: accounts[1] }),
        "ERC20Guild: Tokens still locked"
      );

      // move past the time lock period
      await time.increase(TIMELOCK.add(new BN("1")));

      // Can transfer because all user tokens are locked
      await expectRevert(
        guildToken.transfer(accounts[0], 50, { from: accounts[1] }),
        "ERC20: transfer amount exceeds balance"
      );

      // try to release more tha locked and fail
      await expectRevert(
        erc20Guild.withdrawTokens(50001, { from: accounts[1] }),
        "ERC20Guild: Unable to withdraw more tokens than locked"
      );

      const txRelease = await erc20Guild.withdrawTokens(50000, {
        from: accounts[1],
      });

      const withdrawEvent = helpers.logDecoder.decodeLogs(txRelease.receipt.rawLogs)[1];
      assert.equal(withdrawEvent.name, "TokensWithdrawn")
      assert.equal(withdrawEvent.args[0], accounts[1]);
      assert.equal(withdrawEvent.args[1], 50000);

      votes = await erc20Guild.votingPowerOf(accounts[1]);
      votes.should.be.bignumber.equal("0");

      totalLocked = await erc20Guild.getTotalLocked();
      totalLocked.should.be.bignumber.equal("0");
    });

    it("can lock tokens and check snapshot", async function () {

    });

  });
  describe("refund votes", function () {

    beforeEach(async function () {
      await lockTokens();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        actions: [{
          to: [erc20Guild.address],
          data: [await new web3.eth.Contract(ERC20Guild.abi).methods
            .setConfig(30, 30, 200, 100, VOTE_GAS, MAX_GAS_PRICE, 3, 60)
            .encodeABI()],
          value: [0],
        }],
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[4],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        action: 1,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(guildProposalId);
      (await erc20Guild.getVoteGas()).should.be.bignumber.equal(VOTE_GAS);
      (await erc20Guild.getMaxGasPrice()).should.be.bignumber.equal(MAX_GAS_PRICE);

    });

    describe("with high gas vote setting (above cost) and standard gas price", function () {
      it("can pay ETH to the guild (ot cover votes)", async function () {
        const tracker = await balance.tracker(erc20Guild.address);
        let guildBalance = await tracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO); // empty

        await send.ether(accounts[5], erc20Guild.address, VOTE_GAS, {
          from: accounts[5],
        });

        guildBalance = await tracker.delta();
        guildBalance.should.be.bignumber.equal(VOTE_GAS);
      });

      it("can set a vote and refund gas", async function () {
        const guildProposalId = await createProposal(genericProposal);

        const guildTracker = await balance.tracker(erc20Guild.address);

        // send ether to cover gas
        await send.ether(accounts[0], erc20Guild.address, ether("10"), {
          from: accounts[0],
        });
        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ether("10"));

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await erc20Guild.setVote(guildProposalId, 1, 100, {
          from: accounts[2],
          gasPrice: REAL_GAS_PRICE,
        });
        const voteEvent = helpers.logDecoder.decodeLogs(txVote.receipt.rawLogs)[0];
        assert.equal(voteEvent.name, "VoteAdded")
        assert.equal(voteEvent.args[0], guildProposalId);
        assert.equal(voteEvent.args[1], 1);
        assert.equal(voteEvent.args[2], accounts[2]);
        assert.equal(voteEvent.args[3], 100);

        if (constants.GAS_PRICE > 1) {
          const txGasUsed = txVote.receipt.gasUsed;

          // mul by -1 as balance has decreased
          guildBalance = await guildTracker.delta();
          guildBalance.should.be.bignumber.equal(
            VOTE_GAS.mul(MAX_GAS_PRICE).neg()
          );
          // account 1 should have a refund
          // the gas for the vote multipled by set gas price minus the real cost of gas multiplied by gas price
          let accounts1Balance = await tracker.delta();
          accounts1Balance
            .neg()
            .should.be.bignumber.equal(
              new BN(txGasUsed)
                .mul(REAL_GAS_PRICE)
                .sub(VOTE_GAS.mul(MAX_GAS_PRICE))
            );
        }
      });

      it("can set a vote but no refund as contract has no ether", async function () {
        const guildProposalId = await createProposal(genericProposal);

        const guildTracker = await balance.tracker(erc20Guild.address);

        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO);

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await erc20Guild.setVote(guildProposalId, 1, 100, {
          from: accounts[2],
          gasPrice: REAL_GAS_PRICE,
        });

        const voteEvent = helpers.logDecoder.decodeLogs(txVote.receipt.rawLogs)[0];
        assert.equal(voteEvent.name, "VoteAdded")
        assert.equal(voteEvent.args[0], guildProposalId);
        assert.equal(voteEvent.args[1], 1);
        assert.equal(voteEvent.args[2], accounts[2]);
        assert.equal(voteEvent.args[3],100);

        if (constants.GAS_PRICE > 1) {
          const txGasUsed = txVote.receipt.gasUsed;

          // no change as still no ether
          guildBalance = await guildTracker.delta();
          guildBalance.should.be.bignumber.equal(ZERO);

          // account 1 has paid as normal for the vote
          let accounts1Balance = await tracker.delta();
          accounts1Balance.should.be.bignumber.equal(
            new BN(txGasUsed).mul(REAL_GAS_PRICE).neg()
          );
        }
      });

    });

    it("only refunds upto max gas price", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20Guild.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20Guild.address, ether("10"), {
        from: accounts[0],
      });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[2]);

      const txVote = await erc20Guild.setVote(guildProposalId, 1, 100, {
        from: accounts[2],
        gasPrice: MAX_GAS_PRICE.add(new BN("50")),
      });
      const voteEvent = helpers.logDecoder.decodeLogs(txVote.receipt.rawLogs)[0];
      assert.equal(voteEvent.name, "VoteAdded")
      assert.equal(voteEvent.args[0], guildProposalId);
      assert.equal(voteEvent.args[1], 1);
      assert.equal(voteEvent.args[2], accounts[2]);
      assert.equal(voteEvent.args[3], 100);

      if (constants.GAS_PRICE > 1) {
        const txGasUsed = txVote.receipt.gasUsed;

        // mul by -1 as balance has decreased
        guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(
          VOTE_GAS.mul(MAX_GAS_PRICE).neg()
        );
        // account 1 should have a refund
        // the gas for the vote multipled by set gas price minus the real cost of gas multiplied by gas price
        let accounts1Balance = await tracker.delta();
        accounts1Balance
          .neg()
          .should.be.bignumber.equal(
            new BN(txGasUsed)
              .mul(MAX_GAS_PRICE.add(new BN("50")))
              .sub(VOTE_GAS.mul(MAX_GAS_PRICE))
          );
      }
    });
  });

  describe("Signed votes", function () {

    beforeEach(async function() {
      const tokenVault = await erc20Guild.getTokenVault();
      await guildToken.approve(tokenVault, 50000, { from: accounts[1] });
      await guildToken.approve(tokenVault, 50000, { from: accounts[2] });
      await guildToken.approve(tokenVault, 100000, { from: accounts[3] });
      await guildToken.approve(tokenVault, 100000, { from: accounts[4] });
      await guildToken.approve(tokenVault, 200000, { from: accounts[5] });
      await erc20Guild.lockTokens(50000, { from: accounts[1] });
      await erc20Guild.lockTokens(50000, { from: accounts[2] });
      await erc20Guild.lockTokens(100000, { from: accounts[3] });
      await erc20Guild.lockTokens(100000, { from: accounts[4] });
      await erc20Guild.lockTokens(200000, { from: accounts[5] });
    });

    it("can hash a vote", async function () {
      const hashedVote = await erc20Guild.hashVote(
        accounts[1],
        web3.utils.asciiToHex("abc123"),
        1,
        50
      );
      hashedVote.should.exist;
    });

    it("can set a signed vote", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const hashedVote = await erc20Guild.hashVote(
        accounts[2],
        guildProposalId,
        1,
        50
      );
      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20Guild.setSignedVote(
        guildProposalId,
        1,
        50,
        accounts[2],
        signature,
        { from: accounts[3] }
      );
      
      const voteEvent = helpers.logDecoder.decodeLogs(txVote.receipt.rawLogs)[0];
      assert.equal(voteEvent.name, "VoteAdded")
      assert.equal(voteEvent.args[0], guildProposalId);
      assert.equal(voteEvent.args[1], 1);
      assert.equal(voteEvent.args[2], accounts[2]);
      assert.equal(voteEvent.args[3], 50);

      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(true);
    });

    it("can set setVotes more efficient than multiple setVote", async function () {
  
      // Forwarding ~10 votes is 18% less effective than 10 setVote functions
      const getSignature = async function(proposalId, account) {
        const hash = await erc20Guild.hashVote(account, proposalId, 1, 10);
        return fixSignature(await web3.eth.sign(hash, account));
      }

      let proposalIds = [], actions = [], votes = [],voters = [], signatures = [];

      for (let i = 0; i < 10; i++) {
        const guildProposalId = await createProposal(genericProposal);
        proposalIds.push(guildProposalId);
        actions.push(1);
        votes.push(10)
        voters.push(accounts[1]);    
        signatures.push(await getSignature(guildProposalId, accounts[1]));  
      }
      const txVote3 = await erc20Guild.setSignedVotes(
        proposalIds, actions, votes, voters, signatures,
        { from: accounts[4] }
      );

      if (constants.GAS_PRICE > 1)
        expect(txVote3.receipt.gasUsed/(VOTE_GAS*10)).to.be.below(1.21);

    });

    it("cannot set a signed vote twice", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const hashedVote = await erc20Guild.hashVote(
        accounts[2],
        guildProposalId,
        1,
        50
      );
      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20Guild.setSignedVote(
        guildProposalId,
        1,
        50,
        accounts[2],
        signature,
        { from: accounts[3] }
      );

      const voteEvent = helpers.logDecoder.decodeLogs(txVote.receipt.rawLogs)[0];
      assert.equal(voteEvent.name, "VoteAdded")
      assert.equal(voteEvent.args[0], guildProposalId);
      assert.equal(voteEvent.args[1], 1);
      assert.equal(voteEvent.args[2], accounts[2]);
      assert.equal(voteEvent.args[3], 50);
     
      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(true);

      await expectRevert(
        erc20Guild.setSignedVote(guildProposalId, 1, 50, accounts[2], signature, {
          from: accounts[3],
        }),
        "ERC20Guild: Already voted"
      );
    });

    it("cannot set a vote if wrong signer", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const hashedVote = await erc20Guild.hashVote(
        accounts[1],
        guildProposalId,
        1,
        50
      );
      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[0])
      ); // wrong signer
      accounts[0].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      // now call from different account aka accounts[1]
      await expectRevert(
        erc20Guild.setSignedVote(guildProposalId, 1, 50, accounts[1], signature, {
          from: accounts[1],
        }),
        "ERC20Guild: Wrong signer"
      );
    });
  });
});
