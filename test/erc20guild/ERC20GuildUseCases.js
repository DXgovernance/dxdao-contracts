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
  setXVotesOnProposal,
} = require("../helpers/guild");

require("chai").should();

contract("ERC20Guild use cases", function (accounts) {
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
      new BN("100")
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
    it("execute a positive (and zero) votes on two proposals", async function () {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);

      const customProposalOne = Object.assign({}, genericProposal);
      customProposalOne.account = accounts[2];

      const customProposalTwo = Object.assign({}, genericProposal);
      customProposalTwo.account = accounts[5];

      const proposalIdOne = await createProposal(customProposalOne);
      const proposalIdTwo = await createProposal(customProposalTwo);

      const txVoteOne = await setXVotesOnProposal({
        guild: ierc20Guild,
        proposalId: proposalIdOne,
        votes: new BN("10"),
        account: accounts[4],
      });

      const txVoteTwo = await setXVotesOnProposal({
        guild: ierc20Guild,
        proposalId: proposalIdTwo,
        votes: new BN("5"),
        account: accounts[4],
      });

      const txVoteThree = await setXVotesOnProposal({
        guild: ierc20Guild,
        proposalId: proposalIdOne,
        votes: new BN("1"),
        account: accounts[3],
      });

      expectEvent(txVoteOne, "VoteAdded", {
        proposalId: proposalIdOne,
        voter: accounts[4],
        tokens: new BN("10"),
      });

      expectEvent(txVoteTwo, "VoteAdded", {
        proposalId: proposalIdTwo,
        voter: accounts[4],
        tokens: new BN("5"),
      });

      expectEvent(txVoteThree, "VoteAdded", {
        proposalId: proposalIdOne,
        voter: accounts[3],
        tokens: new BN("1"),
      });

      let proposalOne = await ierc20Guild.getProposal(proposalIdOne);
      const proposalTwo = await ierc20Guild.getProposal(proposalIdTwo);

      proposalOne.totalVotes.should.be.bignumber.equal("111"); // 100 (on creation) + 10 + 1
      proposalTwo.totalVotes.should.be.bignumber.equal("205"); // 200 (on creation) + 5

      const txVoteFour = await setXVotesOnProposal({
        guild: ierc20Guild,
        proposalId: proposalIdOne,
        votes: new BN("0"),
        account: accounts[4],
      });

      expectEvent(txVoteFour, "VoteRemoved", {
        proposalId: proposalIdOne,
        voter: accounts[4],
        tokens: new BN("10"),
      });

      proposalOne = await ierc20Guild.getProposal(proposalIdOne);
      proposalOne.totalVotes.should.be.bignumber.equal("101"); // 100 (on creation) + 10 + 1 - 10
    });
  });
});
