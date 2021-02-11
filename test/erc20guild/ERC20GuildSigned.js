import * as helpers from "../helpers";
const constants = require("../helpers/constants");
const ERC20Guild = artifacts.require("ERC20Guild.sol");
const IERC20Guild = artifacts.require("IERC20Guild.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const { fixSignature } = require("../helpers/sign");
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
    await erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", 0, 0, 1);
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
    genericCallDataVote = await new web3.eth.Contract(
      votingMachine.contract.abi
    ).methods.vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS).encodeABI();
  });
  
  describe("ERC20Guild", function () {
    it("can hash a vote", async function () {
      const hashedVote = await erc20Guild.hashVote(accounts[1], web3.utils.asciiToHex("abc123"), 50);
      hashedVote.should.exist;
    });

    it("can set a vote", async function () {
      const txGuild = await erc20Guild.createProposal(
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
      const hashedVote = await erc20Guild.hashVote(accounts[2], guildProposalId, 50);
      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20Guild.setSignedVote(
        guildProposalId, 50, accounts[2], signature,
        { from: accounts[3] }
      );

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(true);
    });

    it("can set multiple votes", async function () {
      const txGuild = await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallDataVote],
        [0],
        "Guild Test Proposal",
        helpers.NULL_ADDRESS,
        { from: accounts[4] }
      );

      const guildProposalId = await helpers.getValueFromLogs(txGuild, "proposalId", "ProposalCreated");

      const hashedVote1 = await erc20Guild.hashVote(accounts[2], guildProposalId, 50);
      const hashedVote2 = await erc20Guild.hashVote(accounts[3], guildProposalId, 50);

      const signature1 = fixSignature(
        await web3.eth.sign(hashedVote1, accounts[2])
      );
      const signature2 = fixSignature(
        await web3.eth.sign(hashedVote2, accounts[3])
      );

      const txVote = await erc20Guild.methods[
        "setSignedVotes(bytes32[],uint256[],address[],bytes[])"
      ](
        [guildProposalId, guildProposalId],
        [50, 50],
        [accounts[2], accounts[3]],
        [signature1, signature2],
        { from: accounts[4] }
      );

      const addedEvents = txVote.logs.filter(
        (evt) => evt.event === "VoteAdded"
      );
      addedEvents.length.should.be.equal(2);

      (await erc20Guild.signedVotes(hashedVote1)).should.be.equal(true);
      (await erc20Guild.signedVotes(hashedVote2)).should.be.equal(true);
    });

    it("cannot set a signed vote twice", async function () {
      const txGuild = await erc20Guild.createProposal(
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
      const hashedVote = await erc20Guild.hashVote(accounts[2], guildProposalId, 50);
      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20Guild.setSignedVote(
        guildProposalId,
        50,
        accounts[2],
        signature,
        { from: accounts[3] }
      );
      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });
      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(true);

      await expectRevert(
        erc20Guild.setSignedVote(
          guildProposalId,
          50,
          accounts[2],
          signature,
          { from: accounts[3] }
        ),
        "ERC20Guild: Already voted"
      );
    });

    it("cannot set a vote if wrong signer", async function () {
      const txGuild = await erc20Guild.createProposal(
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
      const hashedVote = await erc20Guild.hashVote(accounts[1], guildProposalId, 50);
      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[0])
      ); // wrong signer
      accounts[0].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      // now call from different account aka accounts[1]
      await expectRevert(
        erc20Guild.setSignedVote(
          guildProposalId,
          50,
          accounts[1],
          signature,
          { from: accounts[1] }
        ),
        "ERC20Guild: Wrong signer"
      );
    });

    it("cannot set a vote if not initialized", async function () {
      erc20Guild = await ERC20Guild.new();
      const hashedVote = await erc20Guild.hashVote(accounts[1], web3.utils.asciiToHex("abc123"), 50);
      const signature = fixSignature(await web3.eth.sign(hashedVote, accounts[1]));

      await expectRevert(
        erc20Guild.setSignedVote(
          web3.utils.asciiToHex("abc123"), 50, accounts[1], signature,
          { from: accounts[1] }
        ),
        "ERC20Guild: Not initilized"
      );
    });
  });
});
