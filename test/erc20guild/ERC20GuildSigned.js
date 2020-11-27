import * as helpers from "../helpers";

const ERC20GuildSigned = artifacts.require("ERC20GuildSigned.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const { BN, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const { fixSignature } = require("../helpers/sign");

require("chai").should();

const { createDAO, createAndSetupGuildToken } = require("../helpers/guild");

contract("ERC20GuildSigned", function (accounts) {
  let walletScheme, daoCreator, org, actionMock, votingMachine, guildToken;
  let erc20GuildSigned,
    genericCallDataVote,
    callData,
    genericCallData,
    proposalId;

  beforeEach(async function () {
    const guildTokenBalances = [1000, 50, 100, 100, 100, 200];
    guildToken = await createAndSetupGuildToken(accounts.slice(0, 6), guildTokenBalances);

    actionMock = await ActionMock.new();

    erc20GuildSigned = await ERC20GuildSigned.new();
    await erc20GuildSigned.initialize(guildToken.address,30, 200, 100, "TestGuild");

    const createDaoResult = await createDAO(erc20GuildSigned, accounts);
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
      helpers.SOME_HASH
    );
    proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    
    genericCallDataVote = await new web3.eth.Contract(
      votingMachine.contract.abi
    ).methods
      .vote(proposalId, 1, 0, helpers.NULL_ADDRESS)
      .encodeABI();
  });

  describe("ERC20GuildSigned", function () {
    it("can hash a vote", async function () {
      const hashedVote = await erc20GuildSigned.hashVote(accounts[1], web3.utils.asciiToHex("abc123"), 50);
      hashedVote.should.exist;
    });

    it("can set a vote", async function () {
      const txGuild = await erc20GuildSigned.createProposal(
        [votingMachine.address],
        [genericCallDataVote],
        [0],
        "Guild Test Proposal",
        helpers.NULL_ADDRESS,
        { from: accounts[3] }
      );

      const guildProposalId = await helpers.getValueFromLogs(
        txGuild,
        "proposalId",
        "ProposalCreated"
      );
      const hashedVote = await erc20GuildSigned.hashVote(accounts[1], guildProposalId, 50);
      (await erc20GuildSigned.signedVotes(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[1])
      );
      accounts[1].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20GuildSigned.setVote(
        guildProposalId, 50, accounts[1], signature,
        { from: accounts[1] }
      );

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      (await erc20GuildSigned.signedVotes(hashedVote)).should.be.equal(true);
    });

    it("can set multiple votes", async function () {
      const txGuild = await erc20GuildSigned.createProposal(
        [votingMachine.address],
        [genericCallDataVote],
        [0],
        "Guild Test Proposal",
        helpers.NULL_ADDRESS,
        { from: accounts[3] }
      );

      const guildProposalId = await helpers.getValueFromLogs(txGuild, "proposalId", "ProposalCreated");

      const hashedVote1 = await erc20GuildSigned.hashVote(accounts[1], guildProposalId, 50);
      const hashedVote2 = await erc20GuildSigned.hashVote(accounts[2], guildProposalId, 50);

      const signature1 = fixSignature(
        await web3.eth.sign(hashedVote1, accounts[1])
      );
      const signature2 = fixSignature(
        await web3.eth.sign(hashedVote2, accounts[2])
      );

      const txVote = await erc20GuildSigned.methods[
        "setVotes(bytes32[],uint256[],address[],bytes[])"
      ](
        [guildProposalId, guildProposalId],
        [50, 50],
        [accounts[1], accounts[2]],
        [signature1, signature2],
        { from: accounts[3] }
      );

      const addedEvents = txVote.logs.filter(
        (evt) => evt.event === "VoteAdded"
      );
      addedEvents.length.should.be.equal(2);

      (await erc20GuildSigned.signedVotes(hashedVote1)).should.be.equal(true);
      (await erc20GuildSigned.signedVotes(hashedVote2)).should.be.equal(true);
    });

    it("cannot set a vote if already voted", async function () {
      const txGuild = await erc20GuildSigned.createProposal(
        [votingMachine.address],
        [genericCallDataVote],
        [0],
        "Guild Test Proposal",
        helpers.NULL_ADDRESS,
        { from: accounts[3] }
      );

      const guildProposalId = await helpers.getValueFromLogs(
        txGuild,
        "proposalId",
        "ProposalCreated"
      );
      const hashedVote = await erc20GuildSigned.hashVote(accounts[1], guildProposalId, 50);
      (await erc20GuildSigned.signedVotes(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[1])
      );
      accounts[1].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20GuildSigned.setVote(
        guildProposalId,
        50,
        accounts[1],
        signature,
        { from: accounts[1] }
      );
      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });
      (await erc20GuildSigned.signedVotes(hashedVote)).should.be.equal(true);

      await expectRevert(
        erc20GuildSigned.setVote(
          guildProposalId,
          50,
          accounts[1],
          signature,
          { from: accounts[1] }
        ),
        "ERC20GuildSigned: Already voted"
      );
    });

    it("cannot set a vote if wrong signer", async function () {
      const txGuild = await erc20GuildSigned.createProposal(
        [votingMachine.address],
        [genericCallDataVote],
        [0],
        "Guild Test Proposal",
        helpers.NULL_ADDRESS,
        { from: accounts[3] }
      );

      const guildProposalId = await helpers.getValueFromLogs(
        txGuild,
        "proposalId",
        "ProposalCreated"
      );
      const hashedVote = await erc20GuildSigned.hashVote(accounts[1], guildProposalId, 50);
      (await erc20GuildSigned.signedVotes(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[0])
      ); // wrong signer
      accounts[0].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      // now call from different account aka accounts[1]
      await expectRevert(
        erc20GuildSigned.setVote(
          guildProposalId,
          50,
          accounts[1],
          signature,
          { from: accounts[1] }
        ),
        "ERC20GuildSigned: Wrong signer"
      );
    });

    it("cannot set a vote if not initialised", async function () {
      erc20GuildSigned = await ERC20GuildSigned.new();
      const hashedVote = await erc20GuildSigned.hashVote(accounts[1], web3.utils.asciiToHex("abc123"), 50);
      const signature = fixSignature(await web3.eth.sign(hashedVote, accounts[1]));

      await expectRevert(
        erc20GuildSigned.setVote(
          web3.utils.asciiToHex("abc123"), 50, accounts[1], signature,
          { from: accounts[1] }
        ),
        "ERC20Guild: Not initilized"
      );
    });
  });
});
