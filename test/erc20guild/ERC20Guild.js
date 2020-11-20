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
} = require("../helpers/guild");

require("chai").should();

const ProposalState = {
  submitted: 0,
  passed: 1,
  failed: 2,
  executed: 3,
};

contract("ERC20Guild", function (accounts) {
  let walletScheme, daoCreator, org, actionMock, votingMachine, guildToken;

  let erc20Guild, genericCallDataVote, callData, genericCallData, proposalId;

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

    erc20Guild = await ERC20Guild.new();
    await erc20Guild.initialize(
      guildToken.address,
      new BN("0"),
      new BN("200"),
      new BN("100"),
      "TestGuild"
    );

    const createDaoResult = await createDAO(erc20Guild, accounts);
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
      guild: erc20Guild,
      to: [votingMachine.address],
      data: [genericCallDataVote],
      value: [0],
      description: DESCRIPTION,
      contentHash: helpers.NULL_ADDRESS,
      extraTime: 0,
      account: accounts[3],
    };
  });

  describe("ERC20Guild", function () {
    it("cannot initialize with zero address", async function () {
      const newGuild = await ERC20Guild.new();

      await expectRevert(
        newGuild.initialize(
          helpers.NULL_ADDRESS,
          new BN("10"),
          new BN("10"),
          new BN("10"),
          "TestGuild"
        ),
        "ERC20Guild: token is the zero address"
      );
    });

    it("cannot initialize twice", async function () {
      await expectRevert(
        erc20Guild.initialize(
          guildToken.address,
          new BN("10"),
          new BN("10"),
          new BN("10"),
          "TestGuild"
        ),
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
          DESCRIPTION,
          helpers.NULL_ADDRESS,
          0,
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
          DESCRIPTION,
          helpers.NULL_ADDRESS,
          0,
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
          DESCRIPTION,
          helpers.NULL_ADDRESS,
          0,
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
          DESCRIPTION,
          helpers.NULL_ADDRESS,
          0,
          { from: accounts[3] }
        ),
        "ERC20Guild: to, data value arrays cannot be empty"
      );
    });

    it("can read proposal details of in-flight proposal", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const proposalIdGuild = await createProposal(genericProposal);

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
      } = await ierc20Guild.getProposal(proposalIdGuild);
      assert.equal(creator, accounts[3]);
      const now = await time.latest();
      assert.equal(startTime.toString(), now.toString());
      assert.equal(endTime.toString(), now.toString()); // proposalTime and extra time are 0
      assert.deepEqual(to, [votingMachine.address]);
      assert.deepEqual(data, [genericCallDataVote]);
      assert.deepEqual(
        value.map((bn) => bn.toString()),
        ["0"]
      );
      assert.equal(description, DESCRIPTION);
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

      const res = await ierc20Guild.methods["votesOf(address[])"]([
        accounts[1],
        accounts[2],
      ]);
      res[0].should.be.bignumber.equal("50");
      res[1].should.be.bignumber.equal("100");
    });

    it("execute a positive vote on the voting machine from the guild", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const proposalIdGuild = await createProposal(genericProposal);

      const txVote = await setAllVotesOnProposal({
        guild: ierc20Guild,
        proposalId: proposalIdGuild,
        account: accounts[5],
      });

      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });

      await time.increase(time.duration.seconds(1));
      const receipt = await ierc20Guild.executeProposal(proposalIdGuild);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalIdGuild });

      await walletScheme.execute(proposalId);

      const organizationProposal = await walletScheme.getOrganizationProposal(
        proposalId
      );
      assert.equal(organizationProposal.state, ProposalState.executed);
      assert.equal(organizationProposal.callData[0], genericCallData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });

    it("cannot execute a positive vote on the voting machine from the guild twice", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const proposalIdGuild = await createProposal(genericProposal);

      const txVote = await setAllVotesOnProposal({
        guild: ierc20Guild,
        proposalId: proposalIdGuild,
        account: accounts[5],
      });
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });

      await time.increase(time.duration.seconds(1));
      const receipt = await ierc20Guild.executeProposal(proposalIdGuild);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalIdGuild });

      await walletScheme.execute(proposalId);

      const { executed } = await ierc20Guild.getProposal(proposalIdGuild);
      assert.equal(executed, true);

      await expectRevert(
        ierc20Guild.executeProposal(proposalIdGuild),
        "ERC20Guild: Proposal already executed"
      );
    });

    it("cannot execute as proposal not ended yet", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const customProposal = Object.assign({}, genericProposal);
      customProposal.extraTime = 1000;
      const proposalIdGuild = await createProposal(customProposal);

      const txVote = await setAllVotesOnProposal({
        guild: ierc20Guild,
        proposalId: proposalIdGuild,
        account: accounts[5],
      });
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });

      await expectRevert(
        ierc20Guild.executeProposal(proposalIdGuild),
        "ERC20Guild: Proposal hasnt ended yet"
      );
    });

    it("cannot execute as not enough tokens to execute proposal", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const proposalIdGuild = await createProposal(genericProposal);

      const txVote = await ierc20Guild.setVote(proposalIdGuild, new BN("1"), {
        from: accounts[5],
      });
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });

      await time.increase(time.duration.seconds(1));

      await expectRevert(
        ierc20Guild.executeProposal(proposalIdGuild),
        "ERC20Guild: Not enough tokens to execute proposal"
      );
    });

    it("cannot set multiple votes with uneven arrays", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        TEST_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      const callDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods
        .vote(proposalId, 1, 0, helpers.NULL_ADDRESS)
        .encodeABI();

      const customProposal = Object.assign({}, genericProposal);
      customProposal.data = [callDataVote];
      const proposalIdGuild = await createProposal(customProposal);

      await expectRevert(
        ierc20Guild.setVotes(
          [proposalIdGuild, proposalIdGuild],
          [new BN("10")],
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
        TEST_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      const callDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods
        .vote(proposalId, 1, 0, helpers.NULL_ADDRESS)
        .encodeABI();

      const customProposal = Object.assign({}, genericProposal);
      customProposal.data = [callDataVote];
      const proposalIdGuild = await createProposal(customProposal);

      const txVote = await ierc20Guild.setVotes(
        [proposalIdGuild, proposalIdGuild],
        [10, 10],
        { from: accounts[5] }
      );
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });
      expectEvent(txVote, "VoteRemoved", { proposalId: proposalIdGuild });
    });

    it("cannot set votes once executed", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const proposalIdGuild = await createProposal(genericProposal);

      const txVote = await ierc20Guild.setVote(proposalIdGuild, new BN("200"), {
        from: accounts[5],
      });
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild });

      await time.increase(time.duration.seconds(1));
      const receipt = await ierc20Guild.executeProposal(proposalIdGuild);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalIdGuild });

      await walletScheme.execute(proposalId);

      const { executed } = await ierc20Guild.getProposal(proposalIdGuild);
      assert.equal(executed, true);

      await expectRevert(
        ierc20Guild.setVote(proposalIdGuild, new BN("10000"), {
          from: accounts[5],
        }),
        "ERC20Guild: Proposal already executed"
      );
    });

    it("cannot set votes exceeded your voting balance", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const proposalIdGuild = await createProposal(genericProposal);

      await expectRevert(
        ierc20Guild.setVote(proposalIdGuild, new BN("10000"), {
          from: accounts[5],
        }),
        "ERC20Guild: Invalid amount"
      );
    });

    it("can reduce the total votes on a proposal", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const proposalIdGuild = await createProposal(genericProposal);

      const txVoteAdd = await ierc20Guild.setVote(
        proposalIdGuild,
        new BN("200"),
        { from: accounts[5] }
      );
      expect(txVoteAdd.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVoteAdd, "VoteAdded", {
        proposalId: proposalIdGuild,
        voter: accounts[5],
        tokens: new BN("200"),
      });
      let totalVotes = await ierc20Guild.getProposalVotes(
        proposalIdGuild,
        accounts[5]
      );
      totalVotes.should.be.bignumber.equal("200");

      const txVoteRemove = await ierc20Guild.setVote(
        proposalIdGuild,
        new BN("100"),
        { from: accounts[5] }
      );
      expect(txVoteRemove.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVoteRemove, "VoteRemoved", {
        proposalId: proposalIdGuild,
        voter: accounts[5],
        tokens: new BN("100"),
      });
      totalVotes = await ierc20Guild.getProposalVotes(
        proposalIdGuild,
        accounts[5]
      );
      totalVotes.should.be.bignumber.equal("100");
    });
  });
});
