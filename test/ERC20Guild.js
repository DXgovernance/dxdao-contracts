import * as helpers from "./helpers";
const constants = require("./helpers/constants");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const DaoCreator = artifacts.require("./DaoCreator.sol");
const DxControllerCreator = artifacts.require("./DxControllerCreator.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const IERC20Guild = artifacts.require("./IERC20Guild.sol");
const ERC20Guild = artifacts.require("./ERC20Guild.sol");
const ERC20GuildLockable = artifacts.require("./ERC20GuildLockable.sol");
const ERC20GuildPermissioned = artifacts.require("./ERC20GuildPermissioned.sol");
const ERC20GuildSnapshot = artifacts.require("./ERC20GuildSnapshot.sol");
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
  
  let orgToken, walletScheme, quickWalletScheme, daoCreator, org, actionMock, votingMachine, guildToken;

  const TEST_VALUE = 123;
  const TEST_HASH = helpers.SOME_HASH;
  
  function decodeGenericCallError(genericCallDataReturn) {
    assert.equal(genericCallDataReturn.substring(0, 10), web3.eth.abi.encodeFunctionSignature("Error(string)"));
    const errorMsgBytesLength = web3.utils.hexToNumber("0x" + genericCallDataReturn.substring(74, 138)) * 2;
    return web3.utils.hexToUtf8("0x" + genericCallDataReturn.substring(138, 138 + errorMsgBytesLength));
  }
  
  beforeEach( async function(){
    guildToken = await ERC20Mock.new(accounts[ 0 ], 1000);
    guildToken.transfer(accounts[ 1 ], 50);
    guildToken.transfer(accounts[ 2 ], 100);
    guildToken.transfer(accounts[ 3 ], 100);
    guildToken.transfer(accounts[ 4 ], 100);
    guildToken.transfer(accounts[ 5 ], 200);
    
    actionMock = await ActionMock.new();
    const orgToken = await ERC20Mock.new(accounts[ 0 ], 0);
    const controllerCreator = await DxControllerCreator.new({gas: constants.ARC_GAS_LIMIT});
    daoCreator = await DaoCreator.new(
      controllerCreator.address, {gas: constants.ARC_GAS_LIMIT}
    );
    walletScheme = await WalletScheme.new();
    votingMachine = await helpers.setupGenesisProtocol(
      accounts, orgToken.address, 0, helpers.NULL_ADDRESS
    );
    
  });

  describe("ERC20Guild", function() {
    
    let erc20Guild;
    beforeEach( async function(){
      erc20Guild = await ERC20Guild.new();
      await erc20Guild.initialize(guildToken.address, 0, 200, 100, "TestGuild");
      
      org = await helpers.setupOrganizationWithArrays(
        daoCreator,
        [ accounts[ 0 ], accounts[ 1 ], accounts[ 2 ], erc20Guild.address ],
        [ 0, 0, 0, 0 ],
        [ 20, 10, 10, 50 ]
      );
      await walletScheme.initialize(
        org.avatar.address,
        votingMachine.address,
        votingMachine.params,
        org.controller.address
      );
      await daoCreator.setSchemes(
        org.avatar.address,
        [ walletScheme.address],
        [ votingMachine.params],
        [ helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true
        }) ],
        "metaData"
      );
      
    });
    
    it("cannot initialize with zero address", async function() {
      try {
        const newGuild = await ERC20Guild.new();
        await newGuild.initialize(helpers.NULL_ADDRESS, 10, 10, 10, "TestGuild");
        assert(false, "ERC20Guild: token is the zero address");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot initialize twice", async function() {
      try {
        await erc20Guild.initialize(guildToken.address, 10, 10, 10, "TestGuild");
        assert(false, "ERC20Guild: Only callable by ERC20guild itself when initialized");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });
    
    it("execute a positive vote on the voting machine from the guild", async function() {
      const ierc20Guild = await IERC20Guild.at(erc20Guild.address);
      const callData = helpers.testCallFrom(org.avatar.address);
      const genericCallData = helpers.encodeGenericCallData(
        org.avatar.address, actionMock.address, callData, 0
      );
      const tx = await walletScheme.proposeCalls(
        [ org.controller.address ], [ genericCallData ], [ 0 ], TEST_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      const callDataVote = await new web3.eth.Contract(votingMachine.contract.abi).methods.vote(
        proposalId, 1, 0, helpers.NULL_ADDRESS
      ).encodeABI();

      const txGuild = await ierc20Guild.createProposal(
        [ votingMachine.address ],
        [ callDataVote ],
        [ 0 ],
        "Voting Proposal",
        helpers.NULL_ADDRESS,
        {from: accounts[ 3 ]}
      );

      const proposalIdGuild = await helpers.getValueFromLogs(txGuild, "proposalId", "ProposalCreated");
      const txVote = await ierc20Guild.setVote(proposalIdGuild, 200, {from: accounts[ 5 ]});
      expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: proposalIdGuild});

      await time.increase(time.duration.seconds(30));
      const receipt = await ierc20Guild.executeProposal(proposalIdGuild);
      expectEvent(receipt, "ProposalExecuted", { proposalId: proposalIdGuild });

      await walletScheme.execute(proposalId);
      
      const organizationProposal = await walletScheme.getOrganizationProposal(proposalId);
      assert.equal(organizationProposal.state, ProposalState.executed);
      assert.equal(organizationProposal.callData[ 0 ], genericCallData);
      assert.equal(organizationProposal.to[ 0 ], org.controller.address);
      assert.equal(organizationProposal.value[ 0 ], 0);

    });
    
  });
  
  describe("ERC20GuildPermissioned", function() {
    
    let erc20GuildPermissioned;
    beforeEach( async function(){
      erc20GuildPermissioned = await ERC20GuildPermissioned.new();
      await erc20GuildPermissioned.initialize(guildToken.address, 0, 200, 100, "TestGuild");
      
      org = await helpers.setupOrganizationWithArrays(
        daoCreator,
        [ accounts[ 0 ], accounts[ 1 ], accounts[ 2 ], erc20GuildPermissioned.address ],
        [ 0, 0, 0, 0 ],
        [ 20, 10, 20, 40 ]
      );
      await walletScheme.initialize(
        org.avatar.address,
        votingMachine.address,
        votingMachine.params,
        org.controller.address
      );
      await daoCreator.setSchemes(
        org.avatar.address,
        [ walletScheme.address],
        [ votingMachine.params],
        [ helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true
        }) ],
        "metaData"
      );
      
    });
    
    it("cannot initialize with zero address", async function() {
      try {
        const newGuild = await ERC20GuildPermissioned.new();
        await newGuild.initialize(helpers.NULL_ADDRESS, 10, 10, 10, "TestGuild");
        assert(false, "ERC20Guild: token is the zero address");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot initialize twice", async function() {
      try {
        await erc20GuildPermissioned.initialize(guildToken.address, 10, 10, 10, "TestGuild");
        assert(false, "ERC20Guild: Only callable by ERC20guild itself when initialized");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });
    
  });
  
  describe("ERC20GuildLockable", function() {
    
    let erc20GuildLockable;
    beforeEach( async function(){
      erc20GuildLockable = await ERC20GuildLockable.new();
      await erc20GuildLockable.initialize(guildToken.address, 0, 200, 100, "TestGuild", 1);

      guildToken.approve(erc20GuildLockable.address, 450, {from: accounts[ 0 ]});
      guildToken.approve(erc20GuildLockable.address, 50, {from: accounts[ 1 ]});
      guildToken.approve(erc20GuildLockable.address, 100, {from: accounts[ 2 ]});
      guildToken.approve(erc20GuildLockable.address, 100, {from: accounts[ 3 ]});
      guildToken.approve(erc20GuildLockable.address, 100, {from: accounts[ 4 ]});
      guildToken.approve(erc20GuildLockable.address, 200, {from: accounts[ 5 ]});
      
      org = await helpers.setupOrganizationWithArrays(
        daoCreator,
        [ accounts[ 0 ], accounts[ 1 ], accounts[ 2 ], erc20GuildLockable.address ],
        [ 0, 0, 0, 0 ],
        [ 20, 10, 20, 40 ]
      );
      await walletScheme.initialize(
        org.avatar.address,
        votingMachine.address,
        votingMachine.params,
        org.controller.address
      );
      await daoCreator.setSchemes(
        org.avatar.address,
        [ walletScheme.address],
        [ votingMachine.params],
        [ helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true
        }) ],
        "metaData"
      );
      
    });
    
    it("cannot initialize with zero address", async function() {
      try {
        const newGuild = await ERC20GuildLockable.new();
        await newGuild.initialize(helpers.NULL_ADDRESS, 10, 10, 10, "TestGuild", 1);
        assert(false, "ERC20Guild: token is the zero address");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });
    
  });
  
  describe("ERC20GuildSnapshot", function() {
    
    let erc20GuildSnapshot;
    beforeEach( async function(){
      erc20GuildSnapshot = await ERC20GuildSnapshot.new();
      await erc20GuildSnapshot.initialize(guildToken.address, 0, 200, 100, "TestGuild", 1);

      guildToken.approve(erc20GuildSnapshot.address, 450, {from: accounts[ 0 ]});
      guildToken.approve(erc20GuildSnapshot.address, 50, {from: accounts[ 1 ]});
      guildToken.approve(erc20GuildSnapshot.address, 100, {from: accounts[ 2 ]});
      guildToken.approve(erc20GuildSnapshot.address, 100, {from: accounts[ 3 ]});
      guildToken.approve(erc20GuildSnapshot.address, 100, {from: accounts[ 4 ]});
      guildToken.approve(erc20GuildSnapshot.address, 200, {from: accounts[ 5 ]});
      
      org = await helpers.setupOrganizationWithArrays(
        daoCreator,
        [ accounts[ 0 ], accounts[ 1 ], accounts[ 2 ], erc20GuildSnapshot.address ],
        [ 0, 0, 0, 0 ],
        [ 20, 10, 20, 40 ]
      );
      await walletScheme.initialize(
        org.avatar.address,
        votingMachine.address,
        votingMachine.params,
        org.controller.address
      );
      await daoCreator.setSchemes(
        org.avatar.address,
        [ walletScheme.address],
        [ votingMachine.params],
        [ helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true
        }) ],
        "metaData"
      );
      
    });
    
    it("cannot initialize with zero address", async function() {
      try {
        const newGuild = await ERC20GuildSnapshot.new();
        await newGuild.initialize(helpers.NULL_ADDRESS, 10, 10, 10, "TestGuild", 1);
        assert(false, "ERC20Guild: token is the zero address");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });

    it("cannot initialize twice", async function() {
      try {
        await erc20GuildSnapshot.initialize(guildToken.address, 10, 10, 10, "TestGuild", 1);
        assert(false, "ERC20Guild: Only callable by ERC20guild itself when initialized");
      } catch(error) {
        helpers.assertVMException(error);
      }
    });
    
  });

});
