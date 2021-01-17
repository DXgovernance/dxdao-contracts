import * as helpers from "../helpers";

const constants = require("../helpers/constants");
const ERC20GuildPayable = artifacts.require("ERC20GuildPayable.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const {
  BN,
  expectEvent,
  expectRevert,
  balance,
  send,
  ether,
  time
} = require("@openzeppelin/test-helpers");
const {
  createDAO,
  createAndSetupGuildToken,
  createProposal,
  setAllVotesOnProposal,
  GUILD_PROPOSAL_STATES
} = require("../helpers/guild");

require("chai").should();

contract("ERC20GuildPayable", function (accounts) {
  const ZERO = new BN("0");

  let walletScheme, daoCreator, org, actionMock, votingMachine, guildToken;

  const VOTE_GAS = new BN("50000"); // 50k
  const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei
  const REAL_GAS_PRICE = new BN(constants.ARC_GAS_PRICE); // 8 gwei (check config)

  let erc20GuildPayable,
    genericCallDataVote,
    callData,
    genericCallData,
    walletSchemeProposalId;

  let genericProposal;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6), [1000, 50, 100, 100, 100, 200]
    );
    
    erc20GuildPayable = await ERC20GuildPayable.new();
    await erc20GuildPayable.initialize(guildToken.address, 30, 200, 100, "TestGuild", VOTE_GAS, MAX_GAS_PRICE);

    const createDaoResult = await createDAO(erc20GuildPayable, accounts);
    daoCreator = createDaoResult.daoCreator;
    walletScheme = createDaoResult.walletScheme;
    votingMachine = createDaoResult.votingMachine;
    org = createDaoResult.org;

    callData = helpers.testCallFrom(org.avatar.address);
    actionMock = await ActionMock.new();
    genericCallData = helpers.encodeGenericCallData(
      org.avatar.address, actionMock.address, callData, 0
    );

    const tx = await walletScheme.proposeCalls(
      [org.controller.address],
      [genericCallData],
      [0],
      "Test title",
      helpers.SOME_HASH
    );
    walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    genericCallDataVote = await new web3.eth.Contract(
      votingMachine.contract.abi
    ).methods
      .vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS)
      .encodeABI();

    genericProposal = {
      guild: erc20GuildPayable,
      to: [votingMachine.address],
      data: [genericCallDataVote],
      value: [0],
      description: "Guild Test Proposal",
      contentHash: helpers.NULL_ADDRESS,
      account: accounts[3],
    };
  });

  describe("with high gas vote setting (above cost) and standard gas price", function () {
    it("can initialize and return gas values", async function () {
      const voteGas = await erc20GuildPayable.voteGas();
      voteGas.should.be.bignumber.equal(VOTE_GAS);

      const maxGasPrice = await erc20GuildPayable.maxGasPrice();
      maxGasPrice.should.be.bignumber.equal(MAX_GAS_PRICE);
    });

    it("can pay ETH to the guild (ot cover votes)", async function () {
      const tracker = await balance.tracker(erc20GuildPayable.address);
      let guildBalance = await tracker.delta();
      guildBalance.should.be.bignumber.equal(ZERO); // empty

      await send.ether(accounts[5], erc20GuildPayable.address, VOTE_GAS, { from: accounts[5] });

      guildBalance = await tracker.delta();
      guildBalance.should.be.bignumber.equal(VOTE_GAS);
    });

    it("can set a vote and refund gas", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20GuildPayable.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20GuildPayable.address, ether("10"), { from: accounts[0] });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[1]);

      const txVote = await erc20GuildPayable.setVote(guildProposalId, 50, {
        from: accounts[1], gasPrice: REAL_GAS_PRICE
      });
      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      if (constants.ARC_GAS_PRICE > 1) {
        const txGasUsed = txVote.receipt.gasUsed;

        // mul by -1 as balance has decreased
        guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(
          VOTE_GAS.mul(MAX_GAS_PRICE).neg()
        );
        // account 1 should have a refund
        // the gas for the vote multipled by set gas price minus the real cost of gas multiplied by gas price
        let accounts1Balance = await tracker.delta();
        accounts1Balance.neg().should.be.bignumber.equal(
          new BN(txGasUsed).mul(REAL_GAS_PRICE).sub(VOTE_GAS.mul(MAX_GAS_PRICE))
        );
      }
    });

    it("can set a vote but no refund as contract has no ether", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20GuildPayable.address);

      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ZERO);

      const tracker = await balance.tracker(accounts[1]);

      const txVote = await erc20GuildPayable.setVote(guildProposalId, 50, {
        from: accounts[1], gasPrice: REAL_GAS_PRICE
      });
      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      if (constants.ARC_GAS_PRICE > 1) {
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
    
    it("not execute an ERC20guild setConfig proposal on the guild", async function () {  
      const guildProposalId = await createProposal({
        guild: erc20GuildPayable,
        to: [erc20GuildPayable.address],
        data: [
          await new web3.eth.Contract(
            ERC20GuildPayable.abi
          ).methods.setConfig(15, 100, 50).encodeABI()
        ],
        value: [0],
        description: "Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20GuildPayable,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20GuildPayable.executeProposal(guildProposalId),
        "ERC20Guild: Proposal call failed"
      );

      assert.equal(await erc20GuildPayable.proposalTime(), 30);
      assert.equal(await erc20GuildPayable.votesForCreation(), 100);
      assert.equal(await erc20GuildPayable.votesForExecution(), 200);
      assert.equal(await erc20GuildPayable.voteGas(), 50000);
      assert.equal(await erc20GuildPayable.maxGasPrice(), 8000000000);
    });
    
    it("execute an ERC20GuildPayable setConfig proposal on the guild", async function () {  
      const guildProposalId = await createProposal({
        guild: erc20GuildPayable,
        to: [erc20GuildPayable.address],
        data: [
          await new web3.eth.Contract(
            ERC20GuildPayable.abi
          ).methods.setConfig(15, 100, 50, 100000, 500000).encodeABI()
        ],
        value: [0],
        description: "Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20GuildPayable,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20GuildPayable.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      assert.equal(await erc20GuildPayable.proposalTime(), 15);
      assert.equal(await erc20GuildPayable.votesForCreation(), 50);
      assert.equal(await erc20GuildPayable.votesForExecution(), 100);
      assert.equal(await erc20GuildPayable.voteGas(), 100000);
      assert.equal(await erc20GuildPayable.maxGasPrice(), 500000);
    });
    
    it("execute a proposal in walletScheme from the guild", async function () {
      const walletSchemeProposalData = helpers.encodeGenericCallData(
        org.avatar.address, actionMock.address, helpers.testCallFrom(org.avatar.address), 0
      )
      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [walletSchemeProposalData],
        [0],
        "Test title",
        helpers.SOME_HASH
      );
      const walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      const genericCallDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods.vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS).encodeABI();
    
      const guildProposalId = await createProposal({
        guild: erc20GuildPayable,
        to: [votingMachine.address],
        data: [genericCallDataVote],
        value: [0],
        description: "Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20GuildPayable,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20GuildPayable.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const organizationProposal = await walletScheme.getOrganizationProposal(walletSchemeProposalId);
      assert.equal(organizationProposal.state, GUILD_PROPOSAL_STATES.executed);
      assert.equal(organizationProposal.callData[0], walletSchemeProposalData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });
    
    it("execute a proposal to a contract from the guild", async function () {
      const guildProposalId = await createProposal({
        guild: erc20GuildPayable,
        to: [actionMock.address],
        data: [helpers.testCallFrom(erc20GuildPayable.address)],
        value: [0],
        description:"Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20GuildPayable,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20GuildPayable.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });
    });
    
  });

  describe("with zero gas allowance", function () {
    const VOTE_GAS = ZERO; // don't pay gas!
    const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei

    beforeEach(async function () {
      erc20GuildPayable = await ERC20GuildPayable.new();
      await erc20GuildPayable.initialize(guildToken.address, 30, 200, 100, "TestGuild", VOTE_GAS, MAX_GAS_PRICE);

      const createDaoResult = await createDAO(erc20GuildPayable, accounts);
      daoCreator = createDaoResult.daoCreator;
      walletScheme = createDaoResult.walletScheme;
      votingMachine = createDaoResult.votingMachine;
      org = createDaoResult.org;

      callData = helpers.testCallFrom(org.avatar.address);
      genericCallData = helpers.encodeGenericCallData(
        org.avatar.address,
        actionMock.address,
        callData,
        0
      );

      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        "Test title",
        helpers.SOME_HASH
      );
      walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      genericCallDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods
        .vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS)
        .encodeABI();
    });

    it("can set a vote and but no refund", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20GuildPayable.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20GuildPayable.address, ether("10"), { from: accounts[0] });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[1]);

      const txVote = await erc20GuildPayable.setVote(guildProposalId, 50, {
        from: accounts[1], gasPrice: REAL_GAS_PRICE
      });
      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });
      
      if (constants.ARC_GAS_PRICE > 1) {
        const txGasUsed = txVote.receipt.gasUsed;

        // still 10 ether as no refund sent - no change in balance
        guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO);

        // account 1 should not have a refund and should simply pay gas
        let accounts1Balance = await tracker.delta();
        accounts1Balance.should.be.bignumber.equal(
          new BN(txGasUsed).mul(REAL_GAS_PRICE).neg()
        );
      }
    });
  });

  describe("max gas price lower than transaction gas price", function () {
    const VOTE_GAS = new BN("95000"); // 95k - more than enough
    const MAX_GAS_PRICE = new BN("1");

    beforeEach(async function () {
      erc20GuildPayable = await ERC20GuildPayable.new();
      await erc20GuildPayable.initialize(
        guildToken.address,
        30,
        200,
        100,
        "TestGuild",
        VOTE_GAS,
        1
      );

      const createDaoResult = await createDAO(erc20GuildPayable, accounts);
      daoCreator = createDaoResult.daoCreator;
      walletScheme = createDaoResult.walletScheme;
      votingMachine = createDaoResult.votingMachine;
      org = createDaoResult.org;

      callData = helpers.testCallFrom(org.avatar.address);
      genericCallData = helpers.encodeGenericCallData(
        org.avatar.address,
        actionMock.address,
        callData,
        0
      );

      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        "Test title",
        helpers.SOME_HASH
      );
      walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      genericCallDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods
        .vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS)
        .encodeABI();
    });

    it("only refunds upto max gas price", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20GuildPayable.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20GuildPayable.address, ether("10"), {
        from: accounts[0],
      });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[1]);

      const txVote = await erc20GuildPayable.setVote(guildProposalId, 50, {
        from: accounts[1], gasPrice: REAL_GAS_PRICE
      });
      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      if (constants.ARC_GAS_PRICE > 1) {
        const txGasUsed = txVote.receipt.gasUsed;

        // mul by -1 as balance has decreased
        guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(
          VOTE_GAS.mul(MAX_GAS_PRICE).neg()
        );

        // account 1 should have a small refund but not enough to cover tx gas
        let accounts1Balance = await tracker.delta();
        accounts1Balance.should.be.bignumber.equal(
          new BN(txGasUsed)
            .mul(REAL_GAS_PRICE)
            .sub(VOTE_GAS.mul(MAX_GAS_PRICE))
            .neg()
        );
      }
    });
  });
});
