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
    callData,
    genericCallData,
    walletSchemeProposalId,
    genericProposal;
    
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
    walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    genericCallData = await new web3.eth.Contract(
      votingMachine.contract.abi
    ).methods.vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS).encodeABI();
    genericProposal = {
      guild: erc20Guild,
      to: [votingMachine.address],
      data: [genericCallData],
      value: [0],
      description: "Guild Test Proposal",
      contentHash: helpers.NULL_ADDRESS,
      account: accounts[3],
    };
  });

  describe("ERC20Guild", function () {
    
    it("cannot create a proposal without enough creation votes", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [votingMachine.address],
          [genericCallData],
          [0],
          "Guild Test Proposal",
          helpers.NULL_ADDRESS,
          { from: accounts[9] }
        ),
        "ERC20Guild: Not enough tokens to create proposal"
      );
    });

    it("cannot create a proposal with uneven _to and _data arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
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
      await expectRevert(
        erc20Guild.createProposal(
          [votingMachine.address],
          [genericCallData],
          [],
          "Guild Test Proposal",
          helpers.NULL_ADDRESS,
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
          "Guild Test Proposal",
          helpers.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: to, data value arrays cannot be empty"
      );
    });

    it("can read proposal details of in-flight proposal", async function () {
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
        state,
      } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(creator, accounts[3]);
      const now = await time.latest();
      assert.equal(startTime.toString(), now.toString());
      assert.equal(endTime.toString(), now.add(new BN("30")).toString()); // proposalTime and extra time are 0
      assert.deepEqual(to, [votingMachine.address]);
      assert.deepEqual(data, [genericCallData]);
      assert.deepEqual( value.map((bn) => bn.toString()), ["0"] );
      assert.equal(description, "Guild Test Proposal");
      assert.equal(contentHash, helpers.NULL_ADDRESS);
      totalVotes.should.be.bignumber.equal("100");
      assert.equal(state, GUILD_PROPOSAL_STATES.submitted);
    });

    it("can read votesOf single accounts", async function () {
      const votes = await erc20Guild.methods["votesOf(address)"](accounts[2]);
      votes.should.be.bignumber.equal("100");
    });

    it("can read votesOf multiple accounts", async function () {
      const res = await erc20Guild.methods["votesOf(address[])"]([ accounts[2], accounts[5] ]);
      res[0].should.be.bignumber.equal("100");
      res[1].should.be.bignumber.equal("200");
    });

    it("execute a positive vote on the voting machine from the guild", async function () {
      const guildProposalId = await createProposal(genericProposal);

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
      const proposalInfo = await erc20Guild.getProposal(guildProposalId);
      assert.equal(proposalInfo.state, GUILD_PROPOSAL_STATES.executed);
      assert.equal(proposalInfo.data[0], genericCallData);
      assert.equal(proposalInfo.to[0], votingMachine.address);
      assert.equal(proposalInfo.value[0], 0);
    });
    

    it("cannot execute a positive vote on the voting machine from the guild twice", async function () {
      const guildProposalId = await createProposal(genericProposal);

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

      const { state } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(state, GUILD_PROPOSAL_STATES.executed);

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal already executed"
      );
    });

    it("cannot execute as proposal not ended yet", async function () {
      const customProposal = Object.assign({}, genericProposal);
      const guildProposalId = await createProposal(customProposal);

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });
      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal hasnt ended yet"
      );
    });

    it("proposal rejected as not enough tokens to execute proposal when proposal ends", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await time.increase(time.duration.seconds(61));

      await erc20Guild.endProposal(guildProposalId);
      const { state } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(state, GUILD_PROPOSAL_STATES.rejected);
    });

    it("cannot set multiple votes with uneven arrays", async function () {  
      const callDataNegativeVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods.vote(walletSchemeProposalId, 2, 0, helpers.NULL_ADDRESS).encodeABI();

      const customProposal = Object.assign({}, genericProposal);
      customProposal.data = [callDataNegativeVote];
      const guildProposalId = await createProposal(genericProposal);
      const newGuildProposalId = await createProposal(customProposal);

      await expectRevert(
        erc20Guild.setVotes(
          [guildProposalId, newGuildProposalId],
          [10],
          { from: accounts[5] }
        ),
        "ERC20Guild: Wrong length of proposalIds or amounts"
      );
    });

    it("can set multiple votes", async function () {
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

      const txVote = await erc20Guild.setVotes(
        [guildProposalId, guildProposalId], [10, 10],
        { from: accounts[5] }
      );
      
      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });
      expectEvent(txVote, "VoteRemoved", { proposalId: guildProposalId });
    });

    it("cannot set votes once executed", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const txVote = await erc20Guild.setVote(guildProposalId, 200, {
        from: accounts[5],
      });
      
      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const { state } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(state, GUILD_PROPOSAL_STATES.executed);

      await expectRevert(
        erc20Guild.setVote(guildProposalId, 100, { from: accounts[3] }),
        "ERC20Guild: Proposal already executed"
      );
    });

    it("cannot set votes exceeded your voting balance", async function () {
      const guildProposalId = await createProposal(genericProposal);
      await expectRevert(
        erc20Guild.setVote(guildProposalId, 10000, { from: accounts[5] }),
        "ERC20Guild: Invalid amount"
      );
    });

    it("can reduce the total votes on a proposal", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const txVoteAdd = await erc20Guild.setVote( guildProposalId, 200, { from: accounts[5] } );
      
      if (constants.ARC_GAS_PRICE > 1)
        expect(txVoteAdd.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVoteAdd, "VoteAdded", {
        proposalId: guildProposalId,
        voter: accounts[5],
        amount: "200",
      });
      let totalVotes = await erc20Guild.getProposalVotes(
        guildProposalId,
        accounts[5]
      );
      totalVotes.should.be.bignumber.equal("200");

      const txVoteRemove = await erc20Guild.setVote( guildProposalId, 100, { from: accounts[5] } );
      
      if (constants.ARC_GAS_PRICE > 1)
        expect(txVoteRemove.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVoteRemove, "VoteRemoved", {
        proposalId: guildProposalId,
        voter: accounts[5],
        amount: "100",
      });
      totalVotes = await erc20Guild.getProposalVotes(guildProposalId, accounts[5]);
      totalVotes.should.be.bignumber.equal("100");
    });
  });
});
