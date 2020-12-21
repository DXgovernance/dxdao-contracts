import * as helpers from "../helpers";

const ERC20GuildLockable = artifacts.require("ERC20GuildLockable.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const {
  BN,
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");
const {
  createDAO,
  createProposal,
  createAndSetupGuildToken,
  setAllVotesOnProposal,
  GUILD_PROPOSAL_STATES
} = require("../helpers/guild");

require("chai").should();

contract("ERC20GuildLockable", function (accounts) {
  let walletScheme, daoCreator, org, actionMock, votingMachine, guildToken;

  let erc20GuildLockable;

  const TIMELOCK = new BN("60");

  describe("ERC20GuildLockable", function () {
    beforeEach(async function () {
      guildToken = await createAndSetupGuildToken(
        accounts.slice(0, 6), [1000, 50, 100, 100, 100, 200]
      );
      
      erc20GuildLockable = await ERC20GuildLockable.new();
      await erc20GuildLockable.initialize(guildToken.address, 30, 200, 100, "TestGuild", TIMELOCK);

      const createDaoResult = await createDAO(erc20GuildLockable, accounts);
      daoCreator = createDaoResult.daoCreator;
      walletScheme = createDaoResult.walletScheme;
      votingMachine = createDaoResult.votingMachine;
      org = createDaoResult.org;
      actionMock = await ActionMock.new();
    });

    it("cannot initialize with zero locktime", async function () {
      erc20GuildLockable = await ERC20GuildLockable.new();
      await expectRevert(
        erc20GuildLockable.initialize(guildToken.address, 30, 200, 100, "TestGuild", 0),
        "ERC20Guild: lockTime should be higher than zero"
      );
    });

    it("cannot setConfig with zero locktime", async function () {
      erc20GuildLockable = await ERC20GuildLockable.new();
      await erc20GuildLockable.initialize(guildToken.address, 30, 200, 100, "TestGuild", 1);
      await expectRevert(
        erc20GuildLockable.setConfig(30, 200, 100, 0),
        "ERC20Guild: lockTime should be higher than zero"
      );
    });

    it("cannot setConfig externally", async function () {
      erc20GuildLockable = await ERC20GuildLockable.new();
      await erc20GuildLockable.initialize(guildToken.address, 30, 200, 100, "TestGuild", 10);
      await expectRevert(
        erc20GuildLockable.setConfig(0, 200, 100, 100),
        "ERC20Guild: Only callable by ERC20guild itself when initialized"
      );
    });
    
    it("not execute an ERC20guild setConfig proposal on the guild", async function () {
      await guildToken.approve(erc20GuildLockable.address, 200, { from: accounts[5] });
      await erc20GuildLockable.lockTokens(200, { from: accounts[5] });
      await guildToken.approve(erc20GuildLockable.address, 100, { from: accounts[3] });
      await erc20GuildLockable.lockTokens(100, { from: accounts[3] });
      
      const guildProposalId = await createProposal({
        guild: erc20GuildLockable,
        to: [erc20GuildLockable.address],
        data: [
          await new web3.eth.Contract(
            ERC20GuildLockable.abi
          ).methods.setConfig(15, 100, 50).encodeABI()
        ],
        value: [0],
        description: "Test description",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20GuildLockable,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(30));
      await expectRevert(
        erc20GuildLockable.executeProposal(guildProposalId),
        "ERC20Guild: Proposal call failed"
      );

      assert.equal(await erc20GuildLockable.proposalTime(), 30);
      assert.equal(await erc20GuildLockable.votesForCreation(), 100);
      assert.equal(await erc20GuildLockable.votesForExecution(), 200);
      assert.equal(await erc20GuildLockable.lockTime(), 60);
    });
    
    it("execute an ERC20GuildLockable setConfig proposal on the guild", async function () {
      await guildToken.approve(erc20GuildLockable.address, 200, { from: accounts[5] });
      await erc20GuildLockable.lockTokens(200, { from: accounts[5] });
      await guildToken.approve(erc20GuildLockable.address, 100, { from: accounts[3] });
      await erc20GuildLockable.lockTokens(100, { from: accounts[3] });
      
      const guildProposalId = await createProposal({
        guild: erc20GuildLockable,
        to: [erc20GuildLockable.address],
        data: [
          await new web3.eth.Contract(
            ERC20GuildLockable.abi
          ).methods.setConfig(15, 100, 50, 10).encodeABI()
        ],
        value: [0],
        description: "Test description",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20GuildLockable,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(30));
      const receipt = await erc20GuildLockable.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      assert.equal(await erc20GuildLockable.proposalTime(), 15);
      assert.equal(await erc20GuildLockable.votesForCreation(), 50);
      assert.equal(await erc20GuildLockable.votesForExecution(), 100);
      assert.equal(await erc20GuildLockable.lockTime(), 10);
    });
    
    it("execute a proposal in walletScheme from the guild", async function () {
      
      const walletSchemeProposalData = helpers.encodeGenericCallData(
        org.avatar.address, actionMock.address, helpers.testCallFrom(org.avatar.address), 0
      )
      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [walletSchemeProposalData],
        [0],
        "Test Title",
        helpers.SOME_HASH
      );
      const walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      const genericCallDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods.vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS).encodeABI();

      await guildToken.approve(erc20GuildLockable.address, 200, { from: accounts[5] });
      await erc20GuildLockable.lockTokens(200, { from: accounts[5] });
      await guildToken.approve(erc20GuildLockable.address, 100, { from: accounts[3] });
      await erc20GuildLockable.lockTokens(100, { from: accounts[3] });
      
      const guildProposalId = await createProposal({
        guild: erc20GuildLockable,
        to: [votingMachine.address],
        data: [genericCallDataVote],
        value: [0],
        description: "Test description",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20GuildLockable,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(30));
      const receipt = await erc20GuildLockable.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const organizationProposal = await walletScheme.getOrganizationProposal(walletSchemeProposalId);
      assert.equal(organizationProposal.state, GUILD_PROPOSAL_STATES.executed);
      assert.equal(organizationProposal.callData[0], walletSchemeProposalData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });
    
    it("execute a proposal to a contract from the guild", async function () {
      await guildToken.approve(erc20GuildLockable.address, 200, { from: accounts[5] });
      await erc20GuildLockable.lockTokens(200, { from: accounts[5] });
      await guildToken.approve(erc20GuildLockable.address, 100, { from: accounts[3] });
      await erc20GuildLockable.lockTokens(100, { from: accounts[3] });
      
      const guildProposalId = await createProposal({
        guild: erc20GuildLockable,
        to: [actionMock.address],
        data: [helpers.testCallFrom(erc20GuildLockable.address)],
        value: [0],
        description: "Test description",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20GuildLockable,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(30));
      const receipt = await erc20GuildLockable.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });
      expectEvent.inTransaction(receipt.tx, actionMock, "ReceivedEther");
    });

    it("can lock tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, 50, {
        from: accounts[1],
      });

      const tx = await erc20GuildLockable.lockTokens(50, { from: accounts[1] });
      expectEvent(tx, "TokensLocked", { voter: accounts[1], value: "50" });

      const now = await time.latest();
      const { amount, timestamp } = await erc20GuildLockable.tokensLocked(accounts[1]);
      amount.should.be.bignumber.equal("50");
      timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20GuildLockable.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal("50");

      const totalLocked = await erc20GuildLockable.totalLocked();
      totalLocked.should.be.bignumber.equal("50");
    });

    it("can release tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, 50, { from: accounts[2] });

      const txLock = await erc20GuildLockable.lockTokens(50, { from: accounts[2] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[2], value: "50" });

      let votes = await erc20GuildLockable.methods["votesOf(address)"](accounts[2]);
      votes.should.be.bignumber.equal("50");

      let totalLocked = await erc20GuildLockable.totalLocked();
      totalLocked.should.be.bignumber.equal("50");

      // move past the time lock period
      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      const txRelease = await erc20GuildLockable.releaseTokens(50, { from: accounts[2] });
      expectEvent(txRelease, "TokensReleased", {
        voter: accounts[2],
        value: "50",
      });

      votes = await erc20GuildLockable.methods["votesOf(address)"](accounts[2]);
      votes.should.be.bignumber.equal("0");

      totalLocked = await erc20GuildLockable.totalLocked();
      totalLocked.should.be.bignumber.equal("0");
    });

    it("cannot release more token than locked", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, 50, { from: accounts[2] });

      const txLock = await erc20GuildLockable.lockTokens(50, { from: accounts[2] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[2], value: "50" });

      // move past the time lock period
      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      await expectRevert(
        erc20GuildLockable.releaseTokens(100, { from: accounts[2] }),
        "ERC20GuildLockable: Unable to release more tokens than locked"
      );
    });

    it("cannot release before end of timelock", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, 50, { from: accounts[2] });

      const txLock = await erc20GuildLockable.lockTokens(50, { from: accounts[2] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[2], value: "50" });

      await expectRevert(
        erc20GuildLockable.releaseTokens(25, { from: accounts[2] }),
        "ERC20GuildLockable: Tokens still locked"
      );
    });

    it("cannot transfer locked tokens", async function () {
      let bal = await guildToken.balanceOf(accounts[2]);
      bal.should.be.bignumber.equal("100");

      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, 100, { from: accounts[2] });

      const txLock = await erc20GuildLockable.lockTokens(100, { from: accounts[2] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[2], value: "100" });

      bal = await guildToken.balanceOf(accounts[2]);
      bal.should.be.bignumber.equal("0");

      await expectRevert(
        guildToken.transfer(accounts[0], 50, { from: accounts[2] }),
        "ERC20: transfer amount exceeds balance"
      );
    });
  });
});
