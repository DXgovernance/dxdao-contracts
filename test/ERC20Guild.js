import * as helpers from "./helpers";
const constants = require("./helpers/constants");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ERC20Guild = artifacts.require("./ERC20Guild.sol");
const { BN, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

contract("ERC20Guild", function(accounts) {
  
  let tokenMock, i, erc20Guild, standardGuild;
  
  beforeEach( async function(){

    tokenMock = await ERC20Mock.new(accounts[ 0 ], 200);
    tokenMock.mint(accounts[ 1 ], 50);
    tokenMock.mint(accounts[ 2 ], 100);
    tokenMock.mint(accounts[ 3 ], 150);
    tokenMock.mint(accounts[ 4 ], 200);

    erc20Guild = await ERC20Guild.new();
    await erc20Guild.initilize(tokenMock.address, 0, 200, 100);
  });

  describe("Creating guilds", function() {
    
    it("cannot initialize with zero address", async function() {
      try {
        const guild = await ERC20Guild.new(tokenMock.address, 10, 10, 10);
        await guild.initilize(helpers.NULL_ADDRESS, 10, 10, 10);
        assert(false, "ERC20Guild: token is the zero address");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot initialize twice", async function() {
      try {
        await erc20Guild.initilize(tokenMock.address, 10, 10, 10);
        assert(false, "ERC20Guild: Only callable by ERC20guild itself when initialized");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("initalizes guild", async function() {
      const guild = await ERC20Guild.new();
      const _minimumProposalTime = 10;
      const _tokensForExecution = 11;
      const _tokensForCreation = 12;
      assert.equal(await guild.initialized(), false);

      await guild.initilize(tokenMock.address, _minimumProposalTime, _tokensForExecution, _tokensForCreation);

      assert.equal(await guild.minimumProposalTime(), _minimumProposalTime);
      assert.equal(await guild.tokensForExecution(), _tokensForExecution);
      assert.equal(await guild.tokensForExecution(), _tokensForExecution);
      assert.equal(await guild.initialized(), true);
    });

  });

  describe("Creating proposals", function() {

    it("cannot create proposals with insufficient token balance", async function() {
      try {
        await erc20Guild.createProposal(
          [ erc20Guild.address ], 
          [ helpers.NULL_ADDRESS ], 
          [ 0 ], 
          "Testing Proposal", 
          helpers.NULL_ADDRESS, 
          0, 
          {from: accounts[ 1 ]}
        );
        assert(false, "ERC20Guild: Not enough tokens to create proposal");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot create proposals with wrong array length", async function() {
      try {
        await erc20Guild.createProposal(
          [ erc20Guild.address ], 
          [ helpers.NULL_ADDRESS, helpers.NULL_ADDRESS ], 
          [ 0, 1, 5 ], 
          "Testing Proposal", 
          helpers.NULL_ADDRESS, 
          0, 
          {from: accounts[ 3 ]}
        );
        assert(false, "ERC20Guild: Wrong length of to, data or value arrays");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot create proposals before guild is initlialized", async function() {
      try {
        const guild = await ERC20Guild.new(tokenMock.address, 10, 10, 10);
        await guild.createProposal(
          [ guild.address ],
          [ helpers.NULL_ADDRESS ],
          [ 0 ],
          "Testing Proposal",
          helpers.NULL_ADDRESS,
          0,
          {from: accounts[ 3 ]}
        );
        assert(false, "ERC20Guild: Not initilized");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("emits a ProposalCreated event when proposal created", async function() {
      const receipt = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      expectEvent(receipt, "ProposalCreated", {});
    });

  });

  describe("Voting & executing proposals", function() {

    it("cannot create vote with insufficient token balance", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      try {
        await erc20Guild.setVote(proposalId, 100, {from: accounts[ 1 ]});
        assert(false, "ERC20Guild: Invalid tokens amount");
      } catch(error) {
        helpers.assertVMException(error);
      }

    });

    it("emits VoteRemoved event when vote was removed", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ], 
        [ 0 ], 
        "Testing Proposal", 
        helpers.NULL_ADDRESS, 
        0, 
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      const receipt = await erc20Guild.setVote(proposalId, 50, {from: accounts[ 3 ]});
      expectEvent(receipt, "VoteAdded", { proposalId: proposalId});
      const receipt2 = await erc20Guild.setVote(proposalId, 20, {from: accounts[ 3 ]});
      expectEvent(receipt2, "VoteRemoved", { proposalId: proposalId });
    });

    it("emits VoteAdded event when vote was submitted", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ], 
        [ 0 ], 
        "Testing Proposal", 
        helpers.NULL_ADDRESS, 
        0, 
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      const receipt = await erc20Guild.setVote(proposalId, 20, {from: accounts[ 1 ]});
      expectEvent(receipt, "VoteAdded", {});
    });

    it("cannot execute proposal with insufficient voting threshold", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      await erc20Guild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      try {
        await erc20Guild.executeProposal(proposalId);
        assert(false, "ERC20Guild: Not enough tokens to execute proposal");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot execute proposal with endTime in the future", async function() {
      const guild = await ERC20Guild.new();
      await guild.initilize(tokenMock.address, 60, 100, 100);
      const tx = await guild.createProposal(
        [ guild.address ],
        [ helpers.NULL_ADDRESS ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      await guild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await guild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      try {
        await guild.executeProposal(proposalId);
        assert(false, "ERC20Guild: Proposal hasnt ended yet");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot execute proposal with failed call", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      await erc20Guild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      await erc20Guild.setVote(proposalId, 150, {from: accounts[ 3 ]});
      await time.increase(time.duration.hours(1));
      try {
        await erc20Guild.executeProposal(proposalId);
        assert(false, "ERC20Guild: Proposal call failed");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot execute proposal more then once", async function() {
      const callDataMint = await new web3.eth.Contract(tokenMock.abi).methods.mint(accounts[ 3 ], 100).encodeABI();
      const tx = await erc20Guild.createProposal(
        [ tokenMock.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      await erc20Guild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 3 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 4 ]});
      await time.increase(time.duration.hours(1));
      const receipt = await erc20Guild.executeProposal(proposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalId });
      try {
        await erc20Guild.executeProposal(proposalId);
        assert(false, "ERC20Guild: Proposal already executed");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("executes proposals with multiple calls", async function() {
      const callDataMint = await new web3.eth.Contract(tokenMock.abi).methods.mint(accounts[ 3 ], 100).encodeABI();
      const tx = await erc20Guild.createProposal(
        [ tokenMock.address, tokenMock.address ],
        [ callDataMint, callDataMint ],
        [ 0, 0 ],
        "Testing Proposal with two Calls",
        helpers.NULL_ADDRESS, 0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      await erc20Guild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 3 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 4 ]});
      await time.increase(time.duration.hours(1));
      const receipt = await erc20Guild.executeProposal(proposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalId });
    });

    it("cannot execute votes with invalid array input", async function() {
      const callDataMint = await new web3.eth.Contract(tokenMock.abi).methods.mint(accounts[ 3 ], 100).encodeABI();
      const tx = await erc20Guild.createProposal(
        [ tokenMock.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const tx2 = await erc20Guild.createProposal(
        [ tokenMock.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal", 
        helpers.NULL_ADDRESS, 
        0, 
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      const proposalId2 = await helpers.getValueFromLogs(tx2, "proposalId");
      try {
        await erc20Guild.setVotes([ proposalId, proposalId2 ], [ 50, 50, 60 ], {from: accounts[ 3 ]});
        assert(false, "ERC20Guild: Wrong length of proposalIds or tokens");s;
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("executes multiple votes with setVotes", async function() {
      const callDataMint = await new web3.eth.Contract(tokenMock.abi).methods.mint(accounts[ 3 ], 100).encodeABI();
      const tx = await erc20Guild.createProposal(
        [ tokenMock.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const tx2 = await erc20Guild.createProposal(
        [ tokenMock.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal", 
        helpers.NULL_ADDRESS, 
        0, 
        {from: accounts[ 3 ]}
      );
      const proposalId1 = await helpers.getValueFromLogs(tx, "proposalId");
      const proposalId2 = await helpers.getValueFromLogs(tx2, "proposalId");
      const txVote = await erc20Guild.setVotes([ proposalId1, proposalId2 ], [ 50, 50 ], {from: accounts[ 3 ]});
      expectEvent(txVote, "VoteAdded", { proposalId: proposalId1});
      expectEvent(txVote, "VoteAdded", { proposalId: proposalId2});
    });

  });

});
