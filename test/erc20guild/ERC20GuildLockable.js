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
  const TIMELOCK = new BN("60");  

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
    walletSchemeProposalData,
    walletSchemeProposalId;
    
  describe("ERC20Guild", function () {
    beforeEach(async function () {
      guildToken = await createAndSetupGuildToken(
        accounts.slice(0, 6), [1000, 50, 100, 100, 100, 200]
      );
      
      erc20Guild = await ERC20Guild.new();
      await erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", 0, 0, TIMELOCK);
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
      actionMock = await ActionMock.new();
      tokenVault = await erc20Guild.tokenVault();
      
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
      
      walletSchemeProposalData = helpers.encodeGenericCallData(
        org.avatar.address, actionMock.address, helpers.testCallFrom(org.avatar.address), 0
      )
      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [walletSchemeProposalData],
        [0],
        "Test Title",
        helpers.SOME_HASH
      );
      walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      genericCallDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods.vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS).encodeABI();
    
    });

    it("cannot initialize with zero locktime", async function () {
      erc20Guild = await ERC20Guild.new();
      await expectRevert(
        erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", 0, 0, 0),
        "ERC20Guild: lockTime should be higher than zero"
      );
    });

    it("cannot setConfig with zero locktime", async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(15, 15, 100, 50, 0, 0, 0).encodeABI()
        ],
        value: [0],
        description: "Test description",
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
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal call failed"
      )

      assert.equal(await erc20Guild.proposalTime(), 30);
      assert.equal(await erc20Guild.votesForCreation(), 100);
      assert.equal(await erc20Guild.votesForExecution(), 200);
      assert.equal(await erc20Guild.lockTime(), 60);
    });

    it("cannot setConfig externally", async function () {
      erc20Guild = await ERC20Guild.new();
      await erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", 0, 0, 10);
      await expectRevert(
        erc20Guild.setConfig(30, 30, 200, 100, 0, 0, 0),
        "ERC20Guild: Only callable by ERC20guild itself when initialized"
      );
    });
    
    it("not execute an ERC20guild setConfig proposal on the guild", async function () {      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(15, 15, 100, 50, 0, 0, 10).encodeABI()
        ],
        value: [0],
        description: "Test description",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(guildProposalId);

      assert.equal(await erc20Guild.proposalTime(), 30);
      assert.equal(await erc20Guild.votesForCreation(), 100);
      assert.equal(await erc20Guild.votesForExecution(), 200);
      assert.equal(await erc20Guild.lockTime(), 60);
    });
    
    it("execute an ERC20Guild setConfig proposal on the guild", async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(15, 15, 100, 50, 0, 0, 10).encodeABI()
        ],
        value: [0],
        description: "Test description",
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
      assert.equal(await erc20Guild.lockTime(), 10);
    });
    
    it("execute a proposal in walletScheme from the guild", async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [votingMachine.address],
        data: [genericCallDataVote],
        value: [0],
        description: "Test description",
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
        description: "Test description",
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
      expectEvent.inTransaction(receipt.tx, actionMock, "ReceivedEther");
    });

    it("fail to execute a not allowed proposal to a contract from the guild", async function () {      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [actionMock.address],
        data: [helpers.testCallFrom(erc20Guild.address)],
        value: [0],
        description: "Test description",
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
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Not allowed call"
      )
    });

    it("can lock tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, {from: accounts[1],});

      const tx = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(tx, "TokensLocked", { voter: accounts[1], value: "50" });

      const now = await time.latest();
      const { amount, timestamp } = await erc20Guild.tokensLocked(accounts[1]);
      amount.should.be.bignumber.equal("50");
      timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal("50");

      const totalLocked = await erc20Guild.totalLocked();
      totalLocked.should.be.bignumber.equal("550");
    });

    it("can release tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const txLock = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[1], value: "50" });

      let votes = await erc20Guild.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal("50");

      let totalLocked = await erc20Guild.totalLocked();
      totalLocked.should.be.bignumber.equal("550");

      // move past the time lock period
      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      const txRelease = await erc20Guild.releaseTokens(50, { from: accounts[1] });
      expectEvent(txRelease, "TokensReleased", {
        voter: accounts[1],
        value: "50",
      });

      votes = await erc20Guild.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal("0");

      totalLocked = await erc20Guild.totalLocked();
      totalLocked.should.be.bignumber.equal("500");
    });

    it("cannot release more token than locked", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const txLock = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[1], value: "50" });

      // move past the time lock period
      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      await expectRevert(
        erc20Guild.releaseTokens(100, { from: accounts[1] }),
        "ERC20Guild: Unable to release more tokens than locked"
      );
    });

    it("cannot release before end of timelock", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const txLock = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[1], value: "50" });

      await expectRevert(
        erc20Guild.releaseTokens(25, { from: accounts[1] }),
        "ERC20Guild: Tokens still locked"
      );
    });

    it("cannot transfer locked tokens", async function () {
      let bal = await guildToken.balanceOf(accounts[1]);
      bal.should.be.bignumber.equal("50");

      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const txLock = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[1], value: "50" });

      bal = await guildToken.balanceOf(accounts[1]);
      bal.should.be.bignumber.equal("0");

      await expectRevert(
        guildToken.transfer(accounts[0], 50, { from: accounts[1] }),
        "ERC20: transfer amount exceeds balance"
      );
    });
    
    it("can lock tokens and check snapshot", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, {from: accounts[1]});

      const tx = await erc20Guild.lockTokens(50, {from: accounts[1]});
      expectEvent(tx, "TokensLocked", {
        voter: accounts[1],
        value: "50",
      });

      const now = await time.latest();
      const { amount, timestamp } = await erc20Guild.tokensLocked(
        accounts[1]
      );
      amount.should.be.bignumber.equal(new BN("50"));
      timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](
        accounts[1]
      );
      votes.should.be.bignumber.equal(new BN("50"));

      const totalLocked = await erc20Guild.totalLocked();
      totalLocked.should.be.bignumber.equal(new BN("550"));
    });

    it("can lock tokens for multiple accounts and check snapshot", async function () {
      await createProposal({
        guild: erc20Guild,
        to: [votingMachine.address],
        data: [genericCallDataVote],
        value: [0],
        description: "Test description",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[2],
      });
      await createProposal({
        guild: erc20Guild,
        to: [votingMachine.address],
        data: [genericCallDataVote],
        value: [0],
        description: "Test description",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });
      const res = await erc20Guild.votesOfAt([accounts[2], accounts[3]], [1, 2]);
      res[0].should.be.bignumber.equal(new BN("100"));
      res[1].should.be.bignumber.equal(new BN("100"));
    });

    it("can lock tokens and release tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const tx = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(tx, "TokensLocked", { voter: accounts[1], value: "50" });

      const now = await time.latest();
      const { amount, timestamp } = await erc20Guild.tokensLocked(accounts[1]);
      amount.should.be.bignumber.equal(new BN("50"));
      timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal(new BN("50"));

      (await erc20Guild.totalLocked()).should.be.bignumber.equal(new BN("550"));

      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      await erc20Guild.releaseTokens(50, { from: accounts[1], });
      (await erc20Guild.totalLocked()).should.be.bignumber.equal(new BN("500"));

    });

    it("can lock tokens and create proposal", async function () {
      const { amount, timestamp } = await erc20Guild.tokensLocked(accounts[2]);
      const now = await time.latest();
      amount.should.be.bignumber.equal(new BN("100"));
      // timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](accounts[2]);
      votes.should.be.bignumber.equal(new BN("100"));

      await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallDataVote],
        [0],
        "Guild Test Proposal",
        helpers.NULL_ADDRESS,
        { from: accounts[2] }
      );

      const totalLockedAt = await erc20Guild.totalLockedAt(1);
      totalLockedAt.should.be.bignumber.equal(new BN("500"));

      const votesOfAt = await erc20Guild.methods[
        "votesOfAt(address,uint256)"
      ](accounts[2], 1);
      votesOfAt.should.be.bignumber.equal(new BN("100"));
    });

    it("can not lock tokens, create proposal and setVote", async function () {
      const { amount, timestamp } = await erc20Guild.tokensLocked(accounts[2]);
      amount.should.be.bignumber.equal(new BN("100"));
      // timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](accounts[2]);
      votes.should.be.bignumber.equal(new BN("100"));

      const txGuild = await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallDataVote],
        [0],
        "Guild Test Proposal",
        helpers.NULL_ADDRESS,
        { from: accounts[2] }
      );

      const totalLockedAt = await erc20Guild.totalLockedAt(1);
      totalLockedAt.should.be.bignumber.equal(new BN("500"));

      const votesOfAt = await erc20Guild.methods[
        "votesOfAt(address,uint256)"
      ](accounts[2], 1);
      votesOfAt.should.be.bignumber.equal(new BN("100"));

      const guildProposalId = await helpers.getValueFromLogs(
        txGuild,
        "proposalId",
        "ProposalCreated"
      );

      const txVote = await erc20Guild.setVote(guildProposalId, 10, { from: accounts[2] });
      expectEvent(txVote, "VoteRemoved", { proposalId: guildProposalId });
    });

    it("can not check votesOfAt for invalid nonexistent ID", async function () {    
      await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallDataVote],
        [0],
        "Guild Test Proposal",
        helpers.NULL_ADDRESS,
        { from: accounts[2] }
      );

      await expectRevert(
        erc20Guild.methods["votesOfAt(address,uint256)"](accounts[2], 3),
        "ERC20Guild: nonexistent id"
      );
    });

    it("can check votesOfAt for invalid ID", async function () {
      await expectRevert(
        erc20Guild.methods["votesOfAt(address,uint256)"](accounts[2], 0),
        "ERC20Guild: id is 0"
      );
    });
    
  });
});
