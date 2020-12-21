import * as helpers from "../helpers";
const IERC20Guild = artifacts.require("IERC20Guild.sol");
const ERC20Guild = artifacts.require("ERC20Guild.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const {
  BN,
  expectEvent,
  expectRevert,
  time,
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
  let walletScheme, daoCreator, org, actionMock, votingMachine, guildToken,
    erc20Guild, genericCallDataVote, callData, genericCallData, walletSchemeProposalId, genericProposal;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6), [1000, 50, 100, 100, 100, 200]
    );
    
    erc20Guild = await ERC20Guild.new();
    await erc20Guild.initialize(guildToken.address, 30, 200, 100, "TestGuild");

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
    ).methods.vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS).encodeABI();

    genericProposal = {
      guild: erc20Guild,
      to: [votingMachine.address],
      data: [genericCallDataVote],
      value: [0],
      description: "Guild Test Proposal",
      contentHash: helpers.NULL_ADDRESS,
      account: accounts[3],
    };
  });

  describe("ERC20Guild", function () {
    it("cannot initialize with zero address", async function () {
      const newGuild = await ERC20Guild.new();
      await expectRevert(
        newGuild.initialize(helpers.NULL_ADDRESS, 10, 10, 10, "TestGuild"),
        "ERC20Guild: token is the zero address"
      );
    });

    it("cannot initialize twice", async function () {
      await expectRevert(
        erc20Guild.initialize(guildToken.address, 10, 10, 10, "TestGuild"),
        "ERC20Guild: Only callable by ERC20guild itself when initialized"
      );
    });

    it("cannot create a proposal without enough creation votes", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      await expectRevert(
        ierc20Guild.createProposal(
          [votingMachine.address],
          [genericCallDataVote],
          [0],
          "Guild Test Proposal",
          helpers.NULL_ADDRESS,
          { from: accounts[9] }
        ),
        "ERC20Guild: Not enough tokens to create proposal"
      );
    });

    it("cannot create a proposal with uneven _to and _data arrays", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      await expectRevert(
        ierc20Guild.createProposal(
          [votingMachine.address],
          [],
          [0],
          "Guild Test Proposal",
          helpers.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with uneven _to and _value arrays", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      await expectRevert(
        ierc20Guild.createProposal(
          [votingMachine.address],
          [genericCallDataVote],
          [],
          "Guild Test Proposal",
          helpers.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with empty _to, _data and _value arrays", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);
      await expectRevert(
        ierc20Guild.createProposal(
          [],
          [],
          [],
          "Guild Test Proposal",
          helpers.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: to, data value arrays cannot be empty"
      );
    });

    it("can read proposal details of in-flight proposal", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const guildProposalId = await createProposal(genericProposal);

      const {
        creator,
        startTime,
        endTime,
        to,
        data,
        value,
        description,
        contentHash,
        totalVotes,
        executed,
      } = await ierc20Guild.getProposal(guildProposalId);
      assert.equal(creator, accounts[3]);
      const now = await time.latest();
      assert.equal(startTime.toString(), now.toString());
      assert.equal(endTime.toString(), now.add(new BN("30")).toString()); // proposalTime and extra time are 0
      assert.deepEqual(to, [votingMachine.address]);
      assert.deepEqual(data, [genericCallDataVote]);
      assert.deepEqual( value.map((bn) => bn.toString()), ["0"] );
      assert.equal(description, "Guild Test Proposal");
      assert.equal(contentHash, helpers.NULL_ADDRESS);
      totalVotes.should.be.bignumber.equal("100");
      assert.equal(executed, false);
    });

    it("can read votesOf single accounts", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const votes = await ierc20Guild.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal("50");
    });

    it("can read votesOf multiple accounts", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const res = await ierc20Guild.methods["votesOf(address[])"]([ accounts[1], accounts[2] ]);
      res[0].should.be.bignumber.equal("50");
      res[1].should.be.bignumber.equal("100");
    });

    it("execute a positive vote on the voting machine from the guild", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const guildProposalId = await createProposal(genericProposal);

      const txVote = await setAllVotesOnProposal({
        guild: ierc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(30));
      const receipt = await ierc20Guild.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const organizationProposal = await walletScheme.getOrganizationProposal(walletSchemeProposalId);
      assert.equal(organizationProposal.state, GUILD_PROPOSAL_STATES.executed);
      assert.equal(organizationProposal.callData[0], genericCallData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });
    
    it("execute a setConfig vote on the guild", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(15, 100, 50).encodeABI()
        ],
        value: [0],
        description: "Guild Test Proposal",
        contentHash: helpers.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: ierc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(30));
      const receipt = await ierc20Guild.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      assert.equal(await erc20Guild.proposalTime(), 15);
      assert.equal(await erc20Guild.votesForCreation(), 50);
      assert.equal(await erc20Guild.votesForExecution(), 100);
    });

    it("cannot execute a positive vote on the voting machine from the guild twice", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const guildProposalId = await createProposal(genericProposal);

      const txVote = await setAllVotesOnProposal({
        guild: ierc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(30));
      const receipt = await ierc20Guild.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const { executed } = await ierc20Guild.getProposal(guildProposalId);
      assert.equal(executed, true);

      await expectRevert(
        ierc20Guild.executeProposal(guildProposalId),
        "ERC20Guild: Proposal already executed"
      );
    });

    it("cannot execute as proposal not ended yet", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const customProposal = Object.assign({}, genericProposal);
      const guildProposalId = await createProposal(customProposal);

      const txVote = await setAllVotesOnProposal({
        guild: ierc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await expectRevert(
        ierc20Guild.executeProposal(guildProposalId),
        "ERC20Guild: Proposal hasnt ended yet"
      );
    });

    it("cannot execute as not enough tokens to execute proposal", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const guildProposalId = await createProposal(genericProposal);

      const txVote = await ierc20Guild.setVote(guildProposalId, 1, { from: accounts[5], });
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(30));

      await expectRevert(
        ierc20Guild.executeProposal(guildProposalId),
        "ERC20Guild: Not enough tokens to execute proposal"
      );
    });

    it("cannot set multiple votes with uneven arrays", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        "Test title",
        helpers.SOME_HASH
      );
      const walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      const callDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods.vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS).encodeABI();

      const customProposal = Object.assign({}, genericProposal);
      customProposal.data = [callDataVote];
      const guildProposalId = await createProposal(customProposal);

      await expectRevert(
        ierc20Guild.setVotes(
          [guildProposalId, guildProposalId],
          [10],
          { from: accounts[5] }
        ),
        "ERC20Guild: Wrong length of proposalIds or amounts"
      );
    });

    it("can set multiple votes", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        "Test title",
        helpers.SOME_HASH
      );
      const walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      const callDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods.vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS).encodeABI();

      const customProposal = Object.assign({}, genericProposal);
      customProposal.data = [callDataVote];
      const guildProposalId = await createProposal(customProposal);

      const txVote = await ierc20Guild.setVotes(
        [guildProposalId, guildProposalId], [10, 10],
        { from: accounts[5] }
      );
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });
      expectEvent(txVote, "VoteRemoved", { proposalId: guildProposalId });
    });

    it("cannot set votes once executed", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const guildProposalId = await createProposal(genericProposal);

      const txVote = await ierc20Guild.setVote(guildProposalId, 200, {
        from: accounts[5],
      });
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(30));
      const receipt = await ierc20Guild.executeProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const { executed } = await ierc20Guild.getProposal(guildProposalId);
      assert.equal(executed, true);

      await expectRevert(
        ierc20Guild.setVote(guildProposalId, 10000, { from: accounts[5] }),
        "ERC20Guild: Proposal already executed"
      );
    });

    it("cannot set votes exceeded your voting balance", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const guildProposalId = await createProposal(genericProposal);

      await expectRevert(
        ierc20Guild.setVote(guildProposalId, 10000, { from: accounts[5] }),
        "ERC20Guild: Invalid amount"
      );
    });

    it("can reduce the total votes on a proposal", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const guildProposalId = await createProposal(genericProposal);

      const txVoteAdd = await ierc20Guild.setVote( guildProposalId, 200, { from: accounts[5] } );
      expect(txVoteAdd.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVoteAdd, "VoteAdded", {
        proposalId: guildProposalId,
        voter: accounts[5],
        amount: "200",
      });
      let totalVotes = await ierc20Guild.getProposalVotes(
        guildProposalId,
        accounts[5]
      );
      totalVotes.should.be.bignumber.equal("200");

      const txVoteRemove = await ierc20Guild.setVote( guildProposalId, 100, { from: accounts[5] } );
      expect(txVoteRemove.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVoteRemove, "VoteRemoved", {
        proposalId: guildProposalId,
        voter: accounts[5],
        amount: "100",
      });
      totalVotes = await ierc20Guild.getProposalVotes(guildProposalId, accounts[5]);
      totalVotes.should.be.bignumber.equal("100");
    });
  });
});
