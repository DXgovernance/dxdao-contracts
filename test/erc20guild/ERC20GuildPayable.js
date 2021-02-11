import * as helpers from "../helpers";
const constants = require("../helpers/constants");
const ERC20Guild = artifacts.require("ERC20Guild.sol");
const IERC20Guild = artifacts.require("IERC20Guild.sol");
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

contract("ERC20Guild", function (accounts) {

  const ZERO = new BN("0");
  const VOTE_GAS = new BN("50000"); // 50k
  const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei
  const REAL_GAS_PRICE = new BN(constants.ARC_GAS_PRICE); // 8 gwei (check config)

  let walletScheme,
    daoCreator,
    org,
    actionMock,
    votingMachine,
    guildToken,
    erc20Guild,
    tokenVault,
    genericCallDataVote,
    callData,
    genericCallData,
    walletSchemeProposalId,
    genericProposal;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6), [1000, 50, 100, 100, 100, 200]
    );
    
    erc20Guild = await ERC20Guild.new();
    await erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", VOTE_GAS, MAX_GAS_PRICE, 1);
    erc20Guild = await IERC20Guild.at(erc20Guild.address);
    tokenVault = await erc20Guild.tokenVault();

    await guildToken.approve(tokenVault, 100, { from: accounts[2] });
    await guildToken.approve(tokenVault, 100, { from: accounts[3] });
    await guildToken.approve(tokenVault, 100, { from: accounts[4] });
    await guildToken.approve(tokenVault, 200, { from: accounts[5] });

    await erc20Guild.lockTokens(100, { from: accounts[2] });
    await erc20Guild.lockTokens(100, { from: accounts[3] });
    await erc20Guild.lockTokens(100, { from: accounts[4] });
    await erc20Guild.lockTokens(200, { from: accounts[5] });
    
    const createDaoResult = await createDAO(erc20Guild, accounts);
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
      guild: erc20Guild,
      to: [votingMachine.address],
      data: [genericCallDataVote],
      value: [0],
      description: "Guild Test Proposal",
      contentHash: helpers.NULL_ADDRESS,
      account: accounts[3],
    };
    
    const allowVotingMachineProposalId = await createProposal({
      guild: erc20Guild,
      to: [erc20Guild.address],
      data: [await new web3.eth.Contract(
        ERC20Guild.abi
      ).methods.setAllowance(
        [votingMachine.address],
        ["0x359afa49"],
        [true]
      ).encodeABI()],
      value: [0],
      description: "Allow vote in voting machine",
      contentHash: helpers.NULL_ADDRESS,
      account: accounts[3],
    });
    await setAllVotesOnProposal({
      guild: erc20Guild,
      proposalId: allowVotingMachineProposalId,
      account: accounts[5],
    });
    await time.increase(time.duration.seconds(31));
    await erc20Guild.endProposal(allowVotingMachineProposalId);
  });

  describe("with high gas vote setting (above cost) and standard gas price", function () {
    it("can initialize and return gas values", async function () {
      const voteGas = await erc20Guild.voteGas();
      voteGas.should.be.bignumber.equal(VOTE_GAS);

      const maxGasPrice = await erc20Guild.maxGasPrice();
      maxGasPrice.should.be.bignumber.equal(MAX_GAS_PRICE);
    });

    it("can pay ETH to the guild (ot cover votes)", async function () {
      const tracker = await balance.tracker(erc20Guild.address);
      let guildBalance = await tracker.delta();
      guildBalance.should.be.bignumber.equal(ZERO); // empty

      await send.ether(accounts[5], erc20Guild.address, VOTE_GAS, { from: accounts[5] });

      guildBalance = await tracker.delta();
      guildBalance.should.be.bignumber.equal(VOTE_GAS);
    });

    it("can set a vote and refund gas", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20Guild.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20Guild.address, ether("10"), { from: accounts[0] });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[2]);

      const txVote = await erc20Guild.setVote(guildProposalId, 100, {
        from: accounts[2], gasPrice: REAL_GAS_PRICE
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

      const guildTracker = await balance.tracker(erc20Guild.address);

      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ZERO);

      const tracker = await balance.tracker(accounts[2]);

      const txVote = await erc20Guild.setVote(guildProposalId, 100, {
        from: accounts[2], gasPrice: REAL_GAS_PRICE
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
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });
      const txLock = await erc20Guild.lockTokens(50, { from: accounts[1] });
      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(15, 15, 100, 50, 0, 0, 1).encodeABI()
        ],
        value: [0],
        description: "Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[1],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(guildProposalId);

      assert.equal(await erc20Guild.proposalTime(), 30);
      assert.equal(await erc20Guild.votesForCreation(), 100);
      assert.equal(await erc20Guild.votesForExecution(), 200);
      assert.equal(await erc20Guild.voteGas(), 50000);
      assert.equal(await erc20Guild.maxGasPrice(), 8000000000);
    });
    
    it("execute an ERC20Guild setConfig proposal on the guild", async function () {  
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(15, 15, 100, 50, 100000, 500000, 1).encodeABI()
        ],
        value: [0],
        description: "Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      assert.equal(await erc20Guild.proposalTime(), 15);
      assert.equal(await erc20Guild.votesForCreation(), 50);
      assert.equal(await erc20Guild.votesForExecution(), 100);
      assert.equal(await erc20Guild.voteGas(), 100000);
      assert.equal(await erc20Guild.maxGasPrice(), 500000);
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
        guild: erc20Guild,
        to: [votingMachine.address],
        data: [genericCallDataVote],
        value: [0],
        description: "Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const organizationProposal = await walletScheme.getOrganizationProposal(walletSchemeProposalId);
      assert.equal(organizationProposal.state, "3");
      assert.equal(organizationProposal.callData[0], walletSchemeProposalData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });
    
    it("execute a proposal to a contract from the guild", async function () {
      const allowActionMock = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [await new web3.eth.Contract(
          ERC20Guild.abi
        ).methods.setAllowance(
          [actionMock.address],
          [helpers.testCallFrom(erc20Guild.address).substring(0,10)],
          [true]
        ).encodeABI()],
        value: [0],
        description: "Allow vote in voting machine",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: allowActionMock,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(allowActionMock);
      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [actionMock.address],
        data: [helpers.testCallFrom(erc20Guild.address)],
        value: [0],
        description:"Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });
    });
    
  });

  describe("with zero gas allowance", function () {
    const VOTE_GAS = ZERO; // don't pay gas!
    const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei

    beforeEach(async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(30, 30, 200, 100, VOTE_GAS, MAX_GAS_PRICE, 1).encodeABI()
        ],
        value: [0],
        description: "Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
    });

    it("can set a vote and but no refund", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20Guild.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20Guild.address, ether("10"), { from: accounts[0] });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[2]);

      const txVote = await erc20Guild.setVote(guildProposalId, 100, {
        from: accounts[2], gasPrice: REAL_GAS_PRICE
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

  it("only refunds upto max gas price", async function () {
    const guildProposalId = await createProposal(genericProposal);

    const guildTracker = await balance.tracker(erc20Guild.address);

    // send ether to cover gas
    await send.ether(accounts[0], erc20Guild.address, ether("10"), { from: accounts[0] });
    let guildBalance = await guildTracker.delta();
    guildBalance.should.be.bignumber.equal(ether("10"));

    const tracker = await balance.tracker(accounts[2]);

    const txVote = await erc20Guild.setVote(guildProposalId, 100, {
      from: accounts[2], gasPrice: MAX_GAS_PRICE.add(new BN("50"))
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
        new BN(txGasUsed).mul(MAX_GAS_PRICE.add(new BN("50"))).sub(VOTE_GAS.mul(MAX_GAS_PRICE))
      );
    }
  });
});
