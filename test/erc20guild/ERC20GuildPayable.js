import * as helpers from "../helpers";

const ERC20GuildPayable = artifacts.require("ERC20GuildPayable.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const {
  BN,
  expectEvent,
  balance,
  send,
  ether,
} = require("@openzeppelin/test-helpers");
const {
  createDAO,
  createAndSetupGuildToken,
  createProposal,
} = require("../helpers/guild");

require("chai").should();

contract("ERC20GuildPayable", function (accounts) {
  const ZERO = new BN("0");

  let walletScheme, daoCreator, org, actionMock, votingMachine, guildToken;

  const VOTE_GAS = new BN("50000"); // 50k
  const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei
  const REAL_GAS_PRICE = new BN("10000000000"); // 8 gwei (check config)

  let erc20GuildPayable,
    genericCallDataVote,
    callData,
    genericCallData,
    proposalId;

  const TEST_HASH = helpers.SOME_HASH;

  const DESCRIPTION = "Voting Proposal";

  let genericProposal;

  beforeEach(async function () {
    const guildTokenBalances = [
      new BN("1000"),
      new BN("50"),
      new BN("100"),
      new BN("100"),
      new BN("100"),
      new BN("200"),
    ];

    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6),
      guildTokenBalances
    );

    actionMock = await ActionMock.new();

    erc20GuildPayable = await ERC20GuildPayable.new();
    await erc20GuildPayable.initialize(
      guildToken.address,
      30,
      200,
      100,
      "TestGuild",
      VOTE_GAS,
      MAX_GAS_PRICE
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
      TEST_HASH
    );
    proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    genericCallDataVote = await new web3.eth.Contract(
      votingMachine.contract.abi
    ).methods
      .vote(proposalId, 1, 0, helpers.NULL_ADDRESS)
      .encodeABI();

    genericProposal = {
      guild: erc20GuildPayable,
      to: [votingMachine.address],
      data: [genericCallDataVote],
      value: [0],
      description: DESCRIPTION,
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

      await send.ether(accounts[5], erc20GuildPayable.address, VOTE_GAS, {
        from: accounts[5],
      });

      guildBalance = await tracker.delta();
      guildBalance.should.be.bignumber.equal(VOTE_GAS);
    });

    it("can set a vote and refund gas", async function () {
      const proposalIdGuild = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20GuildPayable.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20GuildPayable.address, ether("10"), {
        from: accounts[0],
      });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[1]);

      const txVote = await erc20GuildPayable.setVote(proposalIdGuild, 50, {
        from: accounts[1], gasPrice: REAL_GAS_PRICE
      });
      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });

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
    });

    it("can set a vote but no refund as contract has no ether", async function () {
      const proposalIdGuild = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20GuildPayable.address);

      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ZERO);

      const tracker = await balance.tracker(accounts[1]);

      const txVote = await erc20GuildPayable.setVote(proposalIdGuild, 50, {
        from: accounts[1], gasPrice: REAL_GAS_PRICE
      });
      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });

      const txGasUsed = txVote.receipt.gasUsed;

      // no change as still no ether
      guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ZERO);

      // account 1 has paid as normal for the vote
      let accounts1Balance = await tracker.delta();
      accounts1Balance.should.be.bignumber.equal(
        new BN(txGasUsed).mul(REAL_GAS_PRICE).neg()
      );
    });
  });

  describe("with zero gas allowance", function () {
    const VOTE_GAS = ZERO; // don't pay gas!
    const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei

    beforeEach(async function () {
      erc20GuildPayable = await ERC20GuildPayable.new();
      await erc20GuildPayable.initialize(
        guildToken.address,
        30,
        200,
        100,
        "TestGuild",
        VOTE_GAS,
        MAX_GAS_PRICE
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
        TEST_HASH
      );
      proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      genericCallDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods
        .vote(proposalId, 1, 0, helpers.NULL_ADDRESS)
        .encodeABI();
    });

    it("can set a vote and but no refund", async function () {
      const proposalIdGuild = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20GuildPayable.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20GuildPayable.address, ether("10"), {
        from: accounts[0],
      });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[1]);

      const txVote = await erc20GuildPayable.setVote(proposalIdGuild, 50, {
        from: accounts[1], gasPrice: REAL_GAS_PRICE
      });
      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });

      const txGasUsed = txVote.receipt.gasUsed;

      // still 10 ether as no refund sent - no change in balance
      guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ZERO);

      // account 1 should not have a refund and should simply pay gas
      let accounts1Balance = await tracker.delta();
      accounts1Balance.should.be.bignumber.equal(
        new BN(txGasUsed).mul(REAL_GAS_PRICE).neg()
      );
    });
  });

  describe("max gas price lower than transaction gas price", function () {
    const VOTE_GAS = new BN("95000"); // 95k - more than enough
    const MAX_GAS_PRICE = new BN("1000000000"); // 1 gwei
    const REAL_GAS_PRICE = new BN("10000000000"); // 8 gwei (check config)

    beforeEach(async function () {
      erc20GuildPayable = await ERC20GuildPayable.new();
      await erc20GuildPayable.initialize(
        guildToken.address,
        30,
        200,
        100,
        "TestGuild",
        VOTE_GAS,
        MAX_GAS_PRICE
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
        TEST_HASH
      );
      proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      genericCallDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods
        .vote(proposalId, 1, 0, helpers.NULL_ADDRESS)
        .encodeABI();
    });

    it("only refunds upto max gas price", async function () {
      const proposalIdGuild = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20GuildPayable.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20GuildPayable.address, ether("10"), {
        from: accounts[0],
      });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[1]);

      const txVote = await erc20GuildPayable.setVote(proposalIdGuild, 50, {
        from: accounts[1], gasPrice: REAL_GAS_PRICE
      });
      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });

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
    });
  });
});
