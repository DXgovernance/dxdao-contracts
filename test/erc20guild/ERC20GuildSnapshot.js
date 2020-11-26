import * as helpers from "../helpers";

const constants = require("../helpers/constants");
const WalletScheme = artifacts.require("WalletScheme.sol");
const DaoCreator = artifacts.require("DaoCreator.sol");
const DxControllerCreator = artifacts.require("DxControllerCreator.sol");
const ERC20Mock = artifacts.require("ERC20Mock.sol");
const ERC20GuildSnapshot = artifacts.require("ERC20GuildSnapshot.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const {
  BN,
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");

require("chai").should();

const { createAndSetupGuildToken, createDAO } = require("../helpers/guild");

contract("ERC20GuildSnapshot", function (accounts) {
  let walletScheme,
    daoCreator,
    org,
    actionMock,
    votingMachine,
    guildToken,
    erc20GuildSnapshot,
    genericCallDataVote,
    callData,
    genericCallData,
    proposalId;

  const TIMELOCK = new BN("60");

  beforeEach(async function () {  
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6), [1000, 50, 100, 100, 100, 200]
    );
    
    erc20GuildSnapshot = await ERC20GuildSnapshot.new();
    await erc20GuildSnapshot.initialize(guildToken.address, 30, 200, 100, "TestGuild", TIMELOCK);

    const createDaoResult = await createDAO(erc20GuildSnapshot, accounts);
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
      helpers.SOME_HASH
    );
    proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    genericCallDataVote = await new web3.eth.Contract(
      votingMachine.contract.abi
    ).methods
      .vote(proposalId, 1, 0, helpers.NULL_ADDRESS)
      .encodeABI();
  });

  it("can lock tokens and check snapshot", async function () {
    // approve lockable guild to "transfer in" tokens to lock
    await guildToken.approve(erc20GuildSnapshot.address, 50, {from: accounts[1]});

    const tx = await erc20GuildSnapshot.lockTokens(50, {from: accounts[1]});
    expectEvent(tx, "TokensLocked", {
      voter: accounts[1],
      value: "50",
    });

    const now = await time.latest();
    const { amount, timestamp } = await erc20GuildSnapshot.tokensLocked(
      accounts[1]
    );
    amount.should.be.bignumber.equal(new BN("50"));
    timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

    const votes = await erc20GuildSnapshot.methods["votesOf(address)"](
      accounts[1]
    );
    votes.should.be.bignumber.equal(new BN("50"));

    const totalLocked = await erc20GuildSnapshot.totalLocked();
    totalLocked.should.be.bignumber.equal(new BN("50"));
  });

  it("can lock tokens for multiple accounts and check snapshot", async function () {
    // approve lockable guild to "transfer in" tokens to lock
    await guildToken.approve(erc20GuildSnapshot.address, 100, { from: accounts[2] });
    await guildToken.approve(erc20GuildSnapshot.address, 100, { from: accounts[3] });

    let tx = await erc20GuildSnapshot.lockTokens(100, { from: accounts[2] });
    expectEvent(tx, "TokensLocked", { voter: accounts[2], value: "100" });

    await erc20GuildSnapshot.createProposal(
      [votingMachine.address],
      [genericCallDataVote],
      [0],
      "Voting Proposal",
      helpers.NULL_ADDRESS,
      { from: accounts[2] }
    );

    tx = await erc20GuildSnapshot.lockTokens(100, { from: accounts[3], });
    expectEvent(tx, "TokensLocked", { voter: accounts[3], value: "100" });

    await erc20GuildSnapshot.createProposal(
      [votingMachine.address],
      [genericCallDataVote],
      [0],
      "Voting Proposal",
      helpers.NULL_ADDRESS,
      { from: accounts[3] }
    );

    const res = await erc20GuildSnapshot.methods[
      "votesOfAt(address[],uint256[])"
    ]([accounts[2], accounts[3]], [1, 2]);
    res[0].should.be.bignumber.equal(new BN("100"));
    res[1].should.be.bignumber.equal(new BN("100"));
  });

  it("can lock tokens and release tokens", async function () {
    // approve lockable guild to "transfer in" tokens to lock
    await guildToken.approve(erc20GuildSnapshot.address, 50, {
      from: accounts[1],
    });

    const tx = await erc20GuildSnapshot.lockTokens(50, { from: accounts[1], });
    expectEvent(tx, "TokensLocked", { voter: accounts[1], value: "50", });

    const now = await time.latest();
    const { amount, timestamp } = await erc20GuildSnapshot.tokensLocked( accounts[1] );
    amount.should.be.bignumber.equal(new BN("50"));
    timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

    const votes = await erc20GuildSnapshot.methods["votesOf(address)"](
      accounts[1]
    );
    votes.should.be.bignumber.equal(new BN("50"));

    const totalLocked = await erc20GuildSnapshot.totalLocked();
    totalLocked.should.be.bignumber.equal(new BN("50"));

    await time.latest();
    await time.increase(TIMELOCK.add(new BN("1")));

    await erc20GuildSnapshot.releaseTokens(50, {
      from: accounts[1],
    });
  });

  it("can lock tokens and create proposal", async function () {
    // approve lockable guild to "transfer in" tokens to lock
    await guildToken.approve(erc20GuildSnapshot.address, 100, { from: accounts[2] });

    const tx = await erc20GuildSnapshot.lockTokens(100, { from: accounts[2] });
    expectEvent(tx, "TokensLocked", { voter: accounts[2], value: "100" });

    const now = await time.latest();
    const { amount, timestamp } = await erc20GuildSnapshot.tokensLocked(accounts[2]);
    amount.should.be.bignumber.equal(new BN("100"));
    timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

    const votes = await erc20GuildSnapshot.methods["votesOf(address)"](accounts[2]);
    votes.should.be.bignumber.equal(new BN("100"));

    await erc20GuildSnapshot.createProposal(
      [votingMachine.address],
      [genericCallDataVote],
      [0],
      "Voting Proposal",
      helpers.NULL_ADDRESS,
      { from: accounts[2] }
    );

    const totalLockedAt = await erc20GuildSnapshot.totalLockedAt(1);
    totalLockedAt.should.be.bignumber.equal(new BN("100"));

    const votesOfAt = await erc20GuildSnapshot.methods[
      "votesOfAt(address,uint256)"
    ](accounts[2], 1);
    votesOfAt.should.be.bignumber.equal(new BN("100"));
  });

  it("can not lock tokens, create proposal and setVote", async function () {
    // approve lockable guild to "transfer in" tokens to lock
    await guildToken.approve(erc20GuildSnapshot.address, 100, {
      from: accounts[2],
    });

    const tx = await erc20GuildSnapshot.lockTokens(100, { from: accounts[2], });
    expectEvent(tx, "TokensLocked", { voter: accounts[2], value: "100", });

    const now = await time.latest();
    const { amount, timestamp } = await erc20GuildSnapshot.tokensLocked(
      accounts[2]
    );
    amount.should.be.bignumber.equal(new BN("100"));
    timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

    const votes = await erc20GuildSnapshot.methods["votesOf(address)"](
      accounts[2]
    );
    votes.should.be.bignumber.equal(new BN("100"));

    const txGuild = await erc20GuildSnapshot.createProposal(
      [votingMachine.address],
      [genericCallDataVote],
      [0],
      "Voting Proposal",
      helpers.NULL_ADDRESS,
      { from: accounts[2] }
    );

    const totalLockedAt = await erc20GuildSnapshot.totalLockedAt(1);
    totalLockedAt.should.be.bignumber.equal(new BN("100"));

    const votesOfAt = await erc20GuildSnapshot.methods[
      "votesOfAt(address,uint256)"
    ](accounts[2], 1);
    votesOfAt.should.be.bignumber.equal(new BN("100"));

    const proposalIdGuild = await helpers.getValueFromLogs(
      txGuild,
      "proposalId",
      "ProposalCreated"
    );

    const txVote = await erc20GuildSnapshot.setVote( proposalIdGuild, 10, { from: accounts[2] } );
    expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });
  });

  it("can not check votesOfAt for invalid nonexistent ID", async function () {
    // approve lockable guild to "transfer in" tokens to lock
    await guildToken.approve(erc20GuildSnapshot.address, 100, {
      from: accounts[2],
    });

    const tx = await erc20GuildSnapshot.lockTokens(100, {
      from: accounts[2],
    });
    expectEvent(tx, "TokensLocked", {
      voter: accounts[2],
      value: "100",
    });

    const now = await time.latest();
    const { amount, timestamp } = await erc20GuildSnapshot.tokensLocked(
      accounts[2]
    );
    amount.should.be.bignumber.equal("100");
    timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

    await erc20GuildSnapshot.createProposal(
      [votingMachine.address],
      [genericCallDataVote],
      [0],
      "Voting Proposal",
      helpers.NULL_ADDRESS,
      { from: accounts[2] }
    );

    await expectRevert(
      erc20GuildSnapshot.methods["votesOfAt(address,uint256)"](
        accounts[2],
        44
      ),
      "ERC20Snapshot: nonexistent id"
    );
  });

  it("can check votesOfAt for invalid nonexistent ID", async function () {
    // approve lockable guild to "transfer in" tokens to lock
    await guildToken.approve(erc20GuildSnapshot.address, 100, {
      from: accounts[2],
    });

    const tx = await erc20GuildSnapshot.lockTokens(100, {
      from: accounts[2],
    });
    expectEvent(tx, "TokensLocked", {
      voter: accounts[2],
      value: "100",
    });

    const now = await time.latest();
    const { amount, timestamp } = await erc20GuildSnapshot.tokensLocked(
      accounts[2]
    );
    amount.should.be.bignumber.equal("100");
    timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

    await expectRevert(
      erc20GuildSnapshot.methods["votesOfAt(address,uint256)"]( accounts[2], 0),
      "ERC20Snapshot: id is 0"
    );
  });
});
