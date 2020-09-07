import * as helpers from "./helpers";
const constants = require("./helpers/constants");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const DaoCreator = artifacts.require("./DaoCreator.sol");
const DxControllerCreator = artifacts.require("./DxControllerCreator.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ERC20Guild = artifacts.require("./ERC20GuildLockable.sol");
const SafeERC20Guild = artifacts.require("./SafeERC20Guild.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const GenesisProtocol = artifacts.require("./GenesisProtocol.sol");
const Wallet = artifacts.require("./Wallet.sol");
const { BN, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

const ProposalState = {
  submitted: 0,
  passed: 1,
  failed: 2,
  executed: 3
};

contract("ERC20Guild", function(accounts) {
  
  let orgToken, walletScheme, quickWalletScheme, daoCreator, org, actionMock, votingMachine, guildToken, i, erc20Guild, standardGuild;

  const TEST_VALUE = 123;
  const TEST_HASH = helpers.SOME_HASH;
  
  function decodeGenericCallError(genericCallDataReturn) {
    assert.equal(genericCallDataReturn.substring(0, 10), web3.eth.abi.encodeFunctionSignature("Error(string)"));
    const errorMsgBytesLength = web3.utils.hexToNumber("0x" + genericCallDataReturn.substring(74, 138)) * 2;
    return web3.utils.hexToUtf8("0x" + genericCallDataReturn.substring(138, 138 + errorMsgBytesLength));
  }
  
  beforeEach( async function(){
    guildToken = await ERC20Mock.new(accounts[ 0 ], 200);
    erc20Guild = await SafeERC20Guild.new();
    await erc20Guild.initialize(guildToken.address, 0, 200, 100, 1);

    actionMock = await ActionMock.new();
    const orgToken = await ERC20Mock.new(accounts[ 0 ], 0);
    const controllerCreator = await DxControllerCreator.new({gas: constants.ARC_GAS_LIMIT});
    daoCreator = await DaoCreator.new(
      controllerCreator.address, {gas: constants.ARC_GAS_LIMIT}
    );
    org = await helpers.setupOrganizationWithArrays(
      daoCreator,
      [ accounts[ 0 ], accounts[ 1 ], accounts[ 2 ], erc20Guild.address ],
      [ 0, 0, 0, 0 ],
      [ 20, 10, 20, 40 ]
    );
    
    walletScheme = await WalletScheme.new();
    votingMachine = await helpers.setupGenesisProtocol(
      accounts, orgToken.address, 0, helpers.NULL_ADDRESS
    );
    await walletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      org.controller.address
    );
    
    quickWalletScheme = await WalletScheme.new();
    await quickWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      helpers.NULL_ADDRESS
    );
    
    await daoCreator.setSchemes(
      org.avatar.address,
      [ walletScheme.address, quickWalletScheme.address ],
      [ votingMachine.params, votingMachine.params ],
      [ helpers.encodePermission({
        canGenericCall: true,
        canUpgrade: true,
        canChangeConstraints: true,
        canRegisterSchemes: true
      }),
      helpers.encodePermission({
        canGenericCall: false,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
      })
      ],
      "metaData"
    );

    guildToken.mint(accounts[ 1 ], 50);
    guildToken.mint(accounts[ 2 ], 500);
    guildToken.mint(accounts[ 3 ], 500);
    guildToken.mint(accounts[ 4 ], 500);
    guildToken.mint(accounts[ 5 ], 500);

    guildToken.approve(erc20Guild.address, 50, {from: accounts[ 0 ]})
    guildToken.approve(erc20Guild.address, 500, {from: accounts[ 1 ]})
    guildToken.approve(erc20Guild.address, 500, {from: accounts[ 2 ]})
    guildToken.approve(erc20Guild.address, 500, {from: accounts[ 3 ]})
    guildToken.approve(erc20Guild.address, 500, {from: accounts[ 4 ]})
    guildToken.approve(erc20Guild.address, 500, {from: accounts[ 5 ]})
    
  });

  describe("Creating guilds", function() {
    
    it("cannot initialize with zero address", async function() {
      try {
        const newGuild = await SafeERC20Guild.new();
        await newGuild.initialize(helpers.NULL_ADDRESS, 10, 10, 10, 1);
        assert(false, "ERC20Guild: token is the zero address");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot initialize twice", async function() {
      try {
        await erc20Guild.initialize(guildToken.address, 10, 10, 10);
        assert(false, "ERC20Guild: Only callable by ERC20guild itself when initialized");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it.skip("initalizes guild", async function() {
      const guild = await ERC20Guild.new();
      const _minimumProposalTime = 10;
      const _tokensForExecution = 11;
      const _tokensForCreation = 12;
      assert.equal(await guild.initialized(), false);

      await guild.initialize(guildToken.address, _minimumProposalTime, _tokensForExecution, _tokensForCreation);

      assert.equal(await guild.minimumProposalTime(), _minimumProposalTime);
      assert.equal(await guild.tokensForExecution(), _tokensForExecution);
      assert.equal(await guild.tokensForExecution(), _tokensForExecution);
      assert.equal(await guild.initialized(), true);
    });

  });

  describe("Creating proposals", function() {

    it.skip("cannot create proposals with insufficient token balance", async function() {
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

    it.skip("cannot create proposals with wrong array length", async function() {
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

    it.skip("cannot create proposals before guild is initlialized", async function() {
      const _tokensForCreation = 10;
      const guild = await ERC20Guild.new(guildToken.address, 10, 10, _tokensForCreation);
      await guildToken.approve(guild.address, _tokensForCreation, {from: accounts[ 3 ]})
      try {
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

    it.skip("emits a ProposalCreated event when proposal created", async function() {
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

    it.skip("cannot create vote with insufficient token balance", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      try {
        await erc20Guild.setVote(proposalId, 100, {from: accounts[ 1 ]});
        assert(false, "ERC20Guild: Insufficent token balance");
      } catch(error) {
        helpers.assertVMException(error);
      }

    });

    it.skip("emits VoteRemoved event when vote was removed", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ], 
        [ 0 ], 
        "Testing Proposal", 
        helpers.NULL_ADDRESS, 
        0, 
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      const receipt = await erc20Guild.setVote(proposalId, 50, {from: accounts[ 3 ]});
      expectEvent(receipt, "VoteAdded", { proposalId: proposalId});
      const receipt2 = await erc20Guild.setVote(proposalId, 20, {from: accounts[ 3 ]});
      expectEvent(receipt2, "VoteRemoved", { proposalId: proposalId });
    });

    it.skip("emits VoteAdded event when vote was submitted", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ], 
        [ 0 ], 
        "Testing Proposal", 
        helpers.NULL_ADDRESS, 
        0, 
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      const receipt = await erc20Guild.setVote(proposalId, 20, {from: accounts[ 1 ]});
      expectEvent(receipt, "VoteAdded", {});
    });

    it.skip("cannot execute proposal with insufficient voting threshold", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      await erc20Guild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      try {
        await erc20Guild.executeProposal(proposalId);
        assert(false, "ERC20Guild: Not enough tokens to execute proposal");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it.skip("cannot execute proposal with endTime in the future", async function() {
      const guild = await ERC20Guild.new();
      await guildToken.approve(guild.address, 200, {from: accounts[ 1 ]});
      await guildToken.approve(guild.address, 200, {from: accounts[ 2 ]});
      await guildToken.approve(guild.address, 200, {from: accounts[ 3 ]});
      await guild.initialize(guildToken.address, 60, 100, 100);
      const tx = await guild.createProposal(
        [ guild.address ],
        [ helpers.NULL_ADDRESS ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      await guild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await guild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      try {
        await guild.executeProposal(proposalId);
        assert(false, "ERC20Guild: Proposal hasnt ended yet");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it.skip("cannot execute proposal with failed call", async function() {
      const tx = await erc20Guild.createProposal(
        [ erc20Guild.address ],
        [ helpers.NULL_ADDRESS ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
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

    it.skip("cannot execute proposal more then once", async function() {
      const callDataMint = await new web3.eth.Contract(guildToken.abi).methods.mint(accounts[ 3 ], 100).encodeABI();
      const tx = await erc20Guild.createProposal(
        [ guildToken.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
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

    it.skip("executes proposals with multiple calls", async function() {
      const callDataMint = await new web3.eth.Contract(guildToken.abi).methods.mint(accounts[ 3 ], 100).encodeABI();
      const tx = await erc20Guild.createProposal(
        [ guildToken.address, guildToken.address ],
        [ callDataMint, callDataMint ],
        [ 0, 0 ],
        "Testing Proposal with two Calls",
        helpers.NULL_ADDRESS, 0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      await erc20Guild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 3 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 4 ]});
      await time.increase(time.duration.hours(1));
      const receipt = await erc20Guild.executeProposal(proposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalId });
    });

    it.skip("cannot execute votes with invalid array input", async function() {
      const callDataMint = await new web3.eth.Contract(guildToken.abi).methods.mint(accounts[ 3 ], 100).encodeABI();
      const tx = await erc20Guild.createProposal(
        [ guildToken.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const tx2 = await erc20Guild.createProposal(
        [ guildToken.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal", 
        helpers.NULL_ADDRESS, 
        0, 
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      const proposalId2 = await helpers.getValueFromLogs(tx2, "proposalId", "ProposalCreated");
      try {
        await erc20Guild.setVotes([ proposalId, proposalId2 ], [ 50, 50, 60 ], {from: accounts[ 3 ]});
        assert(false, "ERC20Guild: Wrong length of proposalIds or tokens");s;
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it.skip("executes multiple votes with setVotes", async function() {
      const callDataMint = await new web3.eth.Contract(guildToken.abi).methods.mint(accounts[ 3 ], 100).encodeABI();
      const tx = await erc20Guild.createProposal(
        [ guildToken.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const tx2 = await erc20Guild.createProposal(
        [ guildToken.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal", 
        helpers.NULL_ADDRESS, 
        0, 
        {from: accounts[ 3 ]}
      );
      const proposalId1 = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      const proposalId2 = await helpers.getValueFromLogs(tx2, "proposalId", "ProposalCreated");
      const txVote = await erc20Guild.setVotes([ proposalId1, proposalId2 ], [ 50, 50 ], {from: accounts[ 3 ]});
      expectEvent(txVote, "VoteAdded", { proposalId: proposalId1 });
      expectEvent(txVote, "VoteAdded", { proposalId: proposalId2 });
    });


    it.skip("executes proposal vote on DXdao proposal", async function() {
      const callDataMint = await new web3.eth.Contract(guildToken.abi).methods.mint(accounts[ 7 ], 107).encodeABI();
      const genericCallData = helpers.encodeGenericCallData(
        org.avatar.address, guildToken.address, callDataMint, 0
      );
      
      const tx = await quickWalletScheme.proposeCalls(
        [ guildToken.address ], [ genericCallData ], [ 0 ], TEST_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      const organizationProposal1 = await quickWalletScheme.getOrganizationProposal(proposalId);
     
      const callDataVote = await new web3.eth.Contract(votingMachine.contract.abi).methods.vote(
        proposalId, 1, 0, helpers.NULL_ADDRESS
      ).encodeABI();

      const txGuild = await erc20Guild.createProposal(
        [ votingMachine.address ],
        [ callDataVote ],
        [ 0 ],
        "Voting Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      
      const proposalIdGuild = await helpers.getValueFromLogs(txGuild, "proposalId", "ProposalCreated");
      await erc20Guild.setVote(proposalIdGuild, 210, {from: accounts[ 5 ]});
      const txVote = await erc20Guild.setVote(proposalIdGuild, 200, {from: accounts[ 4 ]});
      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild});
      
      await time.increase(time.duration.seconds(10));
      const receipt = await erc20Guild.executeProposal(proposalIdGuild);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalIdGuild });
      
      assert.equal(await guildToken.balanceOf(accounts[ 7 ]), 0);

      await quickWalletScheme.execute(proposalId);

      
      const organizationProposal = await quickWalletScheme.getOrganizationProposal(proposalId);
      assert.equal(organizationProposal.state, ProposalState.executed);
      assert.equal(organizationProposal.callData[ 0 ], genericCallData);
      assert.equal(organizationProposal.to[ 0 ], guildToken.address);
      assert.equal(organizationProposal.value[ 0 ], 0);
      //assert.equal(await guildToken.balanceOf(accounts[ 7 ]), (107).toString());

    });

  });

  describe("Release tokens", function() {
    
    it.skip("cannot release tokens for proposal that is not executed", async function() {
      const callDataMint = await new web3.eth.Contract(guildToken.abi).methods.mint(accounts[ 3 ], 100).encodeABI();
      const tx = await erc20Guild.createProposal(
        [ guildToken.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      expectRevert(
        erc20Guild.releaseAllTokens(proposalId), 
        "ERC20Guild: Proposal not executed or not timed out"
      );
    });

    it.skip("releases tokens for executed proposal", async function() {
      const callDataMint = await new web3.eth.Contract(guildToken.abi).methods.mint(accounts[ 7 ], 100).encodeABI();
      assert.equal(await guildToken.balanceOf(accounts[ 1 ]), 50);
      assert.equal(await guildToken.balanceOf(accounts[ 2 ]), 500);
      assert.equal(await guildToken.balanceOf(accounts[ 3 ]), 500);
      assert.equal(await guildToken.balanceOf(accounts[ 4 ]), 500);
      const tx = await erc20Guild.createProposal(
        [ guildToken.address ],
        [ callDataMint ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      await erc20Guild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      await erc20Guild.setVote(proposalId, 100, {from: accounts[ 4 ]});
      
      assert.equal(await guildToken.balanceOf(accounts[ 1 ]), 0);
      assert.equal(await guildToken.balanceOf(accounts[ 2 ]), 400);
      assert.equal(await guildToken.balanceOf(accounts[ 3 ]), 400);
      assert.equal(await guildToken.balanceOf(accounts[ 4 ]), 400);
      
      await time.increase(time.duration.seconds(30));
      const receipt = await erc20Guild.executeProposal(proposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalId });

      await erc20Guild.releaseAllTokens(proposalId);
      assert.equal(await guildToken.balanceOf(accounts[ 1 ]), 50);
      assert.equal(await guildToken.balanceOf(accounts[ 2 ]), 500);
      assert.equal(await guildToken.balanceOf(accounts[ 3 ]), 500);
      assert.equal(await guildToken.balanceOf(accounts[ 4 ]), 500);
      assert.equal(await guildToken.balanceOf(accounts[ 5 ]), 500);
    });

  });

});

contract("ERC20GuildPermissioned", function(accounts) {

  let orgToken, walletScheme, quickWalletScheme, daoCreator, org, actionMock, votingMachine, guildToken, i, erc20Guild, standardGuild;

  const TEST_VALUE = 123;
  const TEST_HASH = helpers.SOME_HASH;
  
  function decodeGenericCallError(genericCallDataReturn) {
    assert.equal(genericCallDataReturn.substring(0, 10), web3.eth.abi.encodeFunctionSignature("Error(string)"));
    const errorMsgBytesLength = web3.utils.hexToNumber("0x" + genericCallDataReturn.substring(74, 138)) * 2;
    return web3.utils.hexToUtf8("0x" + genericCallDataReturn.substring(138, 138 + errorMsgBytesLength));
  }
  
  beforeEach( async function(){
    guildToken = await ERC20Mock.new(accounts[ 0 ], 200);
    erc20Guild = await ERC20Guild.new();
    await erc20Guild.initialize(guildToken.address, 0, 200, 100);

    actionMock = await ActionMock.new();
    const orgToken = await ERC20Mock.new(accounts[ 0 ], 0);
    const controllerCreator = await DxControllerCreator.new({gas: constants.ARC_GAS_LIMIT});
    daoCreator = await DaoCreator.new(
      controllerCreator.address, {gas: constants.ARC_GAS_LIMIT}
    );
    org = await helpers.setupOrganizationWithArrays(
      daoCreator,
      [ accounts[ 0 ], accounts[ 1 ], accounts[ 2 ], erc20Guild.address ],
      [ 0, 0, 0, 0 ],
      [ 20, 10, 20, 40 ]
    );
    
    walletScheme = await WalletScheme.new();
    votingMachine = await helpers.setupGenesisProtocol(
      accounts, orgToken.address, 0, helpers.NULL_ADDRESS
    );
    await walletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      org.controller.address
    );
    
    quickWalletScheme = await WalletScheme.new();
    await quickWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      helpers.NULL_ADDRESS
    );
    
    await daoCreator.setSchemes(
      org.avatar.address,
      [ walletScheme.address, quickWalletScheme.address ],
      [ votingMachine.params, votingMachine.params ],
      [ helpers.encodePermission({
        canGenericCall: true,
        canUpgrade: true,
        canChangeConstraints: true,
        canRegisterSchemes: true
      }),
      helpers.encodePermission({
        canGenericCall: false,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
      })
      ],
      "metaData"
    );

    guildToken.mint(accounts[ 1 ], 50);
    guildToken.mint(accounts[ 2 ], 100);
    guildToken.mint(accounts[ 3 ], 150);
    guildToken.mint(accounts[ 4 ], 200);
    guildToken.mint(accounts[ 5 ], 250);

  });

  describe("Permissioned Guilds", function() {

    it.skip("initiliazes permissioned guild", async function() {

      const permissionedGuild = await ERC20GuildPermissioned.new();
      const _minimumProposalTime = 10;
      const _tokensForExecution = 11;
      const _tokensForCreation = 12;
      assert.equal(await permissionedGuild.initialized(), false);

      await permissionedGuild.initialize(guildToken.address, _minimumProposalTime, _tokensForExecution, _tokensForCreation);

      assert.equal(await permissionedGuild.minimumProposalTime(), _minimumProposalTime);
      assert.equal(await permissionedGuild.tokensForExecution(), _tokensForExecution);
      assert.equal(await permissionedGuild.tokensForExecution(), _tokensForExecution);
      assert.equal(await permissionedGuild.initialized(), true);
    
    });

    it.skip("cannot execute setAllowance with invalid input length", async function() {
      const permissionedGuild = await ERC20GuildPermissioned.new();
      const _minimumProposalTime = 10;
      const _tokensForExecution = 11;
      const _tokensForCreation = 12;
      assert.equal(await permissionedGuild.initialized(), false);

      await permissionedGuild.initialize(guildToken.address, _minimumProposalTime, _tokensForExecution, _tokensForCreation);
      await guildToken.approve(permissionedGuild.address, 50, {from: accounts[ 1 ]});
      await guildToken.approve(permissionedGuild.address, 100, {from: accounts[ 2 ]});
      await guildToken.approve(permissionedGuild.address, 112, {from: accounts[ 3 ]});
      await guildToken.approve(permissionedGuild.address, 100, {from: accounts[ 4 ]});

      const functionSignature = await web3.eth.abi.encodeFunctionSignature("mint(address, uint256)");
      const callDataAllowance = await new web3.eth.Contract(permissionedGuild.abi).methods.setAllowance([ guildToken.address, guildToken.address ], [ functionSignature ], [ true ]).encodeABI();
      const tx = await permissionedGuild.createProposal(
        [ permissionedGuild.address ],
        [ callDataAllowance ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );

      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      await permissionedGuild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await permissionedGuild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      await permissionedGuild.setVote(proposalId, 100, {from: accounts[ 3 ]});
      await permissionedGuild.setVote(proposalId, 100, {from: accounts[ 4 ]});
      await time.increase(time.duration.seconds(20));
      try {
        await permissionedGuild.executeProposal(proposalId);
        assert(false, "ERC20Guild: Wrong length of to, functionSignature or allowance arrays");
      } catch(error) {
        helpers.assertVMException(error);
      }
    
    });

    it.skip("cannot execute setAllowance from outside", async function() {
      const permissionedGuild = await ERC20GuildPermissioned.new();
      await permissionedGuild.initialize(guildToken.address, 10, 11, 12);
      const functionSignature = await web3.eth.abi.encodeFunctionSignature("mint(address, uint256)");
      try {
        await permissionedGuild.setAllowance([ guildToken.address, guildToken.address ], [ functionSignature ], [ true ]);
        assert(false, "ERC20Guild: Only callable by ERC20guild itself");
      } catch(error) {
        helpers.assertVMException(error);
      }
    
    });

    it.skip("cannot execute proposals without allowance", async function() {
      const permissionedGuild = await ERC20GuildPermissioned.new();
      await permissionedGuild.initialize(guildToken.address, 10, 11, 12);
      await guildToken.approve(permissionedGuild.address, 50, {from: accounts[ 1 ]});
      await guildToken.approve(permissionedGuild.address, 100, {from: accounts[ 2 ]});
      await guildToken.approve(permissionedGuild.address, 112, {from: accounts[ 3 ]});
      await guildToken.approve(permissionedGuild.address, 100, {from: accounts[ 4 ]});

      const callData = await new web3.eth.Contract(guildToken.abi).methods.mint(accounts[ 5 ], 100).encodeABI();
      const tx = await permissionedGuild.createProposal(
        [ guildToken.address ],
        [ callData ],
        [ 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );

      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
      await permissionedGuild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await permissionedGuild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      await permissionedGuild.setVote(proposalId, 100, {from: accounts[ 3 ]});
      await permissionedGuild.setVote(proposalId, 100, {from: accounts[ 4 ]});
      await time.increase(time.duration.seconds(20));
      try {
        await permissionedGuild.executeProposal(proposalId);
        assert(false, "ERC20GuildPermissioned: Not allowed call");
      } catch(error) {
        helpers.assertVMException(error);
      }
    
    });

    it.skip("allows to whitelist function calls & execute whitelisted functions", async function() {
      guildToken.mint(accounts[ 1 ], 200);
      guildToken.mint(accounts[ 2 ], 200);
      guildToken.mint(accounts[ 3 ], 200);
      guildToken.mint(accounts[ 4 ], 200);

      const permissionedGuild = await ERC20GuildPermissioned.new();
      const _minimumProposalTime = 10;
      const _tokensForExecution = 11;
      const _tokensForCreation = 12;
      const setAllowanceFuncSignature = web3.eth.abi.encodeFunctionSignature("setAllowance(address[],bytes4[],bool[])");
      assert.equal(await permissionedGuild.initialized(), false);
      assert.equal(await permissionedGuild.getCallPermission(permissionedGuild.address, setAllowanceFuncSignature), false);

      await permissionedGuild.initialize(
        guildToken.address, _minimumProposalTime, _tokensForExecution, _tokensForCreation
      );
      assert.equal(await permissionedGuild.minimumProposalTime(), _minimumProposalTime);
      assert.equal(await permissionedGuild.tokensForExecution(), _tokensForExecution);
      assert.equal(await permissionedGuild.tokensForCreation(), _tokensForCreation);
      assert.equal(await permissionedGuild.initialized(), true);

      const mintData = new web3.eth.Contract(guildToken.abi).methods.mint(accounts[ 8 ], 60).encodeABI();
      const testWithNoargsData = new web3.eth.Contract(actionMock.abi).methods.testWithNoargs().encodeABI();
      const testWithNoargsFuncSignature = await permissionedGuild.getFuncSignature(testWithNoargsData);
      const mintFunctionSignature = await permissionedGuild.getFuncSignature(mintData);
      
      let callDataSetAllowances = new web3.eth.Contract(permissionedGuild.abi).methods.setAllowance(
        [ guildToken.address, actionMock.address ],
        [ mintFunctionSignature, testWithNoargsFuncSignature ],
        [ true, true ]
      ).encodeABI();

      await guildToken.approve(permissionedGuild.address, 250, {from: accounts[ 1 ]});
      await guildToken.approve(permissionedGuild.address, 250, {from: accounts[ 2 ]});
      await guildToken.approve(permissionedGuild.address, 250, {from: accounts[ 3 ]});
      await guildToken.approve(permissionedGuild.address, 250, {from: accounts[ 4 ]});

      // First allow mint and test function to be executed
      const tx = await permissionedGuild.createProposal(
        [ permissionedGuild.address ],
        [ callDataSetAllowances ],
        [ 0 ],
        "Allowing Mint",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");

      await permissionedGuild.setVote(proposalId, 50, {from: accounts[ 1 ]});
      await permissionedGuild.setVote(proposalId, 100, {from: accounts[ 2 ]});
      await permissionedGuild.setVote(proposalId, 100, {from: accounts[ 3 ]});
      await permissionedGuild.setVote(proposalId, 100, {from: accounts[ 4 ]});
      await time.increase(time.duration.seconds(20));

      const receipt = await permissionedGuild.executeProposal(proposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalId });
      expectEvent(receipt, "SetAllowance", { to: guildToken.address });
      expectEvent(receipt, "SetAllowance", { to: actionMock.address });
      
      assert.equal(await permissionedGuild.getCallPermission(guildToken.address, mintFunctionSignature), true);
      assert.equal(await permissionedGuild.getCallPermission(actionMock.address, testWithNoargsFuncSignature), true);
      
      // Execute mint and test functions
      const tx2 = await permissionedGuild.createProposal(
        [ guildToken.address, actionMock.address ],
        [ mintData, testWithNoargsData ],
        [ 0, 0 ],
        "Testing Proposal",
        helpers.NULL_ADDRESS,
        0,
        {from: accounts[ 3 ]}
      );
      
      const proposalId2 = await helpers.getValueFromLogs(tx2, "proposalId", "ProposalCreated");
      await permissionedGuild.setVote(proposalId2, 50, {from: accounts[ 1 ]});
      await permissionedGuild.setVote(proposalId2, 100, {from: accounts[ 2 ]});
      await permissionedGuild.setVote(proposalId2, 100, {from: accounts[ 3 ]});
      await permissionedGuild.setVote(proposalId2, 100, {from: accounts[ 4 ]});
      await time.increase(time.duration.seconds(20));
      
      const receipt2 = await permissionedGuild.executeProposal(proposalId2);
      expectEvent(receipt2, "ProposalExecuted", { proposalId: proposalId2 });

    });

  });

});
