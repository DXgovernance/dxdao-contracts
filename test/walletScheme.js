import * as helpers from "./helpers";
const constants = require("./helpers/constants");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const DaoCreator = artifacts.require("./DaoCreator.sol");
const DxControllerCreator = artifacts.require("./DxControllerCreator.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const Wallet = artifacts.require("./Wallet.sol");

const { time, expectRevert } = require("@openzeppelin/test-helpers");

contract("WalletScheme", function(accounts) {
  
  let standardTokenMock,
  permissionRegistry,
  masterWalletScheme,
  quickWalletScheme,
  daoCreator,
  org,
  actionMock,
  votingMachine,
  testToken;
  
  const executionTimeout = 172800 + 86400; // _queuedVotePeriodLimit + _boostedVotePeriodLimit
  function decodeGenericCallError(genericCallDataReturn) {
    assert.equal(genericCallDataReturn.substring(0, 10), web3.eth.abi.encodeFunctionSignature("Error(string)"));
    const errorMsgBytesLength = web3.utils.hexToNumber("0x" + genericCallDataReturn.substring(74, 138)) * 2;
    return web3.utils.hexToUtf8("0x" + genericCallDataReturn.substring(138, 138 + errorMsgBytesLength));
  }
  
  function decodeCallError(genericCallDataReturn) {
    assert.equal(genericCallDataReturn.substring(0, 10), web3.eth.abi.encodeFunctionSignature("Error(string)"));
    const errorMsgBytesLength = web3.utils.hexToNumber("0x" + genericCallDataReturn.substring(10)) * 2;
    return web3.utils.hexToUtf8("0x" + genericCallDataReturn.substring(10, 10 + errorMsgBytesLength));
  }

  
  beforeEach( async function(){
    actionMock = await ActionMock.new();
    testToken = await ERC20Mock.new(accounts[1], 1000);
    const standardTokenMock = await ERC20Mock.new(accounts[1], 1000);
    const controllerCreator = await DxControllerCreator.new({gas: constants.GAS_LIMIT});
    daoCreator = await DaoCreator.new(
      controllerCreator.address, {gas: constants.GAS_LIMIT}
    );
    org = await helpers.setupOrganizationWithArrays(
      daoCreator,
      [accounts[0], accounts[1], accounts[2]],
      [1000, 1000, 1000],
      [20000, 10000, 70000]
    );
    votingMachine = await helpers.setupGenesisProtocol(
      accounts, standardTokenMock.address, 'dxd'
    );
    
    permissionRegistry = await PermissionRegistry.new(accounts[0], 10);
    
    masterWalletScheme = await WalletScheme.new();
    await masterWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      org.controller.address,
      permissionRegistry.address,
      "Master Wallet",
      executionTimeout
    );
    
    quickWalletScheme = await WalletScheme.new();
    await quickWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      constants.NULL_ADDRESS,
      permissionRegistry.address,
      "Quick Wallet",
      executionTimeout
    );
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      true
    );
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      quickWalletScheme.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      true
    );
    
    await time.increase(10);
    
    await daoCreator.setSchemes(
      org.avatar.address,
      [masterWalletScheme.address, quickWalletScheme.address],
      [votingMachine.params, votingMachine.params],
      [helpers.encodePermission({
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
  });
  
  it("MasterWalletScheme - proposal with data - negative decision - proposal rejected", async function() {
    const callData = helpers.testCallFrom(org.avatar.address);
    
    let tx = await masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await votingMachine.contract.vote(
      proposalId, 2, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    const executionEvent = helpers.getWalletSchemeExecutionEvent(tx);
    assert.equal(executionEvent.name, 'ProposalRejected');
    
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.rejected);
    assert.equal(organizationProposal.descriptionHash, constants.SOME_HASH);
    assert.equal(organizationProposal.title, constants.TEST_TITLE);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("MasterWalletScheme - proposal with data - positive decision - proposal executed", async function() {
    const callData = helpers.testCallFrom(org.avatar.address);
    
    const tx = await masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });
  
  it("MasterWalletScheme - positive decision - proposal executed - not allowed by permission registry", async function() {
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      false
    );
    
    const callData = helpers.testCallFrom(org.avatar.address);
    
    const tx = await masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(
      votingMachine.contract.vote( proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
      "call not allowed"
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    await time.increase(executionTimeout);
    
    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.executionTimeout
    );
  });
  
  it("MasterWalletScheme - positive decision - proposal executed - not allowed value by permission registry", async function() {
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      100, 
      true
    );
    
    const callData = helpers.testCallFrom(org.avatar.address);
    
    const tx = await masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [101], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(
      votingMachine.contract.vote( proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
      "value call not allowed"
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    await time.increase(executionTimeout+1);
    
    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.executionTimeout
    );
  });
  
  it("MasterWalletScheme - positive decision - proposal executed - not allowed value by permission registry in multiple calls", async function() {
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      100, 
      true
    );
    
    const callData = helpers.testCallFrom(org.avatar.address);
    
    const tx = await masterWalletScheme.proposeCalls(
      [actionMock.address, actionMock.address], [callData, callData], [50, 51], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(
      votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
      "value call not allowed"
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    await time.increase(executionTimeout+1);
    
    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.executionTimeout
    );
  });
  
  it("MasterWalletScheme - positive decision - proposal executed - allowed by permission registry from scheme", async function() {
    const callData = helpers.testCallFrom(org.avatar.address);
    
    assert.notEqual(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, org.avatar.address, actionMock.address, callData.substring(0,10)
      )).fromTime.toString(),
      0
    );
    assert.notEqual(
      (await permissionRegistry.permissions(
        constants.NULL_ADDRESS, org.avatar.address, constants.ANY_ADDRESS, constants.ANY_FUNC_SIGNATURE
      )).fromTime.toString(),
      0
    );
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      false
    );
    
    const setPermissionData = new web3.eth.Contract(PermissionRegistry.abi).methods
      .setPermission(
        constants.NULL_ADDRESS, actionMock.address, callData.substring(0,10), 666, true
      ).encodeABI();
      
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      permissionRegistry.address, 
      setPermissionData.substring(0,10),
      0, 
      true
    );
    
    assert.equal(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, org.avatar.address, permissionRegistry.address, setPermissionData.substring(0,10)
      )).fromTime.toString(),
      Number(await time.latest()) + 10
    );
    
    await time.increase(10);
    
    // Proposal to allow calling actionMock
    const tx = await masterWalletScheme.proposeCalls(
      [permissionRegistry.address], [setPermissionData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    const voteTx = await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    const setPermissionTime = Number(await time.latest());

    assert.equal(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, org.avatar.address, actionMock.address, callData.substring(0,10)
      )).fromTime.toString(),
      setPermissionTime + 10
    );
    assert.equal(
      (await permissionRegistry.permissions(
        constants.NULL_ADDRESS, org.avatar.address, constants.ANY_ADDRESS, constants.ANY_FUNC_SIGNATURE
      )).fromTime.toString(),
      0
    );
    
    await time.increase(10);

    const tx2 = await masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
    await votingMachine.contract.vote(
      proposalId2, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
        
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId2);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });
  
  it("MasterWalletScheme - positive decision - proposal executed with multiple calls and value", async function() {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0], to: org.avatar.address, value: constants.TEST_VALUE
    });
    await wallet.transferOwnership(org.avatar.address);
    
    const payCallData = await new web3.eth.Contract(wallet.abi).methods.pay(accounts[1]).encodeABI();
    
    const tx = await masterWalletScheme.proposeCalls(
      [wallet.address, wallet.address],
      ["0x0", payCallData],
      [constants.TEST_VALUE, 0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(await web3.eth.getBalance(org.avatar.address), constants.TEST_VALUE);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);

    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2], gas: 9000000}
    );
    assert.equal(await web3.eth.getBalance(org.avatar.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await web3.eth.getBalance(accounts[1]), Number(balanceBeforePay) + constants.TEST_VALUE);
    
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], wallet.address);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.callData[1], payCallData);
    assert.equal(organizationProposal.to[1], wallet.address);
    assert.equal(organizationProposal.value[1], 0);
  });

  it("MasterWalletScheme - positive decision - proposal execute and show revert in return", async function() {
    const callData = helpers.testCallFrom(constants.NULL_ADDRESS);
    
    let tx = await masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [constants.TEST_VALUE], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await expectRevert(
      votingMachine.contract.vote( proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
      "call execution failed"
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    await time.increase(executionTimeout);
    
    tx = await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.executionTimeout
    );
  });

  it("MasterWalletScheme - positive decision - proposal executed without return value", async function() {
    const callData = helpers.testCallWithoutReturnValueFrom(org.avatar.address);
    
    let tx = await masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    const executionEvent = helpers.getWalletSchemeExecutionEvent(tx)

    const returnValue = web3.eth.abi.decodeParameters(["bool", "bytes"], 
      executionEvent.values._callsDataResult[0]);
    assert.equal(returnValue["0"], true);
    assert.equal(returnValue["1"], null);
    
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("MasterWalletScheme - proposal with REP - execute mintReputation & burnReputation", async function() {
    const callDataMintRep = await org.controller.contract.methods.mintReputation(
      constants.TEST_VALUE,
      accounts[4],
      org.avatar.address
    ).encodeABI();
    const callDataBurnRep = await org.controller.contract.methods.burnReputation(
      constants.TEST_VALUE,
      accounts[4],
      org.avatar.address
    ).encodeABI();
    var tx = await masterWalletScheme.proposeCalls(
      [org.controller.address], [callDataMintRep], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await masterWalletScheme.proposeCalls(
      [org.controller.address], [callDataBurnRep], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdBurnRep = await helpers.getValueFromLogs(tx, "_proposalId");

    // Mint Rep
    tx = await votingMachine.contract.vote(
      proposalIdMintRep, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    assert.equal(await org.reputation.balanceOf(accounts[4]), constants.TEST_VALUE);

    // Burn Rep
    tx = await votingMachine.contract.vote(
      proposalIdBurnRep, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);
  });
  
  it("MasterWalletScheme - proposals adding/removing schemes - execute registerScheme & removeScheme", async function() {
    const callDataRegisterScheme = await org.controller.contract.methods.registerScheme(
      constants.SOME_ADDRESS,
      constants.SOME_HASH,
      "0x0000000F",
      org.avatar.address
    ).encodeABI();
    const callDataRemoveScheme = await org.controller.contract.methods.unregisterScheme(
      constants.SOME_ADDRESS,
      org.avatar.address
    ).encodeABI();
    var tx = await masterWalletScheme.proposeCalls(
      [org.controller.address], [callDataRegisterScheme], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdAddScheme = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await masterWalletScheme.proposeCalls(
      [org.controller.address], [callDataRemoveScheme], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdRemoveScheme = await helpers.getValueFromLogs(tx, "_proposalId");

    // Add Scheme
    await votingMachine.contract.vote(
      proposalIdAddScheme, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    const addedScheme = await org.controller.schemes(constants.SOME_ADDRESS);
    assert.equal(addedScheme.paramsHash, constants.SOME_HASH);
    assert.equal(addedScheme.permissions, "0x0000000f");
    
    // Remove Scheme
    await votingMachine.contract.vote(
      proposalIdRemoveScheme, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    const removedScheme = await org.controller.schemes(constants.SOME_ADDRESS);
    assert.equal(removedScheme.paramsHash, constants.NULL_HASH);
    assert.equal(removedScheme.permissions, "0x00000000");
  });

  it("MasterWalletScheme - execute should fail if not passed/executed from votingMachine", async function() {
    const callData = helpers.testCallFrom(org.avatar.address);
    var tx = await masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await votingMachine.contract.execute(proposalId);
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.submitted);
  });
  
  it("MasterWalletScheme - positive decision - proposal executed with transfer, pay and mint rep", async function() {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0], to: org.avatar.address, value: constants.TEST_VALUE
    });
    await wallet.transferOwnership(org.avatar.address);
    
    const payCallData = await new web3.eth.Contract(wallet.abi).methods.pay(accounts[1]).encodeABI();
    const callDataMintRep = await org.controller.contract.methods.mintReputation(
      constants.TEST_VALUE,
      accounts[4],
      org.avatar.address
    ).encodeABI();
    
    const tx = await masterWalletScheme.proposeCalls(
      [wallet.address, wallet.address, org.controller.address],
      ["0x0", payCallData, callDataMintRep],
      [constants.TEST_VALUE, 0, 0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(await web3.eth.getBalance(org.avatar.address), constants.TEST_VALUE);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    assert.equal(await web3.eth.getBalance(org.avatar.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await web3.eth.getBalance(accounts[1]), Number(balanceBeforePay) + constants.TEST_VALUE);
    assert.equal(await org.reputation.balanceOf(accounts[4]), constants.TEST_VALUE);
    
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.descriptionHash, constants.SOME_HASH);
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], wallet.address);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.callData[1], payCallData);
    assert.equal(organizationProposal.to[1], wallet.address);
    assert.equal(organizationProposal.value[1], 0);
    assert.equal(organizationProposal.callData[2], callDataMintRep);
    assert.equal(organizationProposal.to[2], org.controller.address);
    assert.equal(organizationProposal.value[2], 0);
  });
  
  it("MasterWalletScheme - cannot initialize twice", async function() {
    try {
      await masterWalletScheme.initialize(
        org.avatar.address,
        accounts[0],
        accounts[0],
        constants.NULL_ADDRESS,
        permissionRegistry.address,
        "Master Wallet",
        executionTimeout
      );
      assert(false, "cannot init twice");
    } catch(error) {
      helpers.assertVMException(error);
    }
  });

  it("QuickWalletScheme - proposal with data - negative decision - proposal rejected", async function() {
    const callData = helpers.testCallFrom(quickWalletScheme.address);
    
    let tx = await quickWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await votingMachine.contract.vote(
      proposalId, 2, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    const executionEvent = helpers.getWalletSchemeExecutionEvent(tx);
    assert.equal(executionEvent.name, 'ProposalRejected');
    
    const organizationProposal = await quickWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.rejected);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("QuickWalletScheme - proposal with data - positive decision - proposal executed", async function() {
    const callData = helpers.testCallFrom(quickWalletScheme.address);
    
    const tx = await quickWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    const organizationProposal = await quickWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });
  
  it("QuickWalletScheme - proposal with data - positive decision - proposal executed with multiple calls and value", async function() {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0], to: quickWalletScheme.address, value: constants.TEST_VALUE
    });
    await wallet.transferOwnership(quickWalletScheme.address);
    
    const payCallData = await new web3.eth.Contract(wallet.abi).methods.pay(accounts[1]).encodeABI();
    
    const tx = await quickWalletScheme.proposeCalls(
      [wallet.address, wallet.address],
      ["0x0", payCallData],
      [constants.TEST_VALUE, 0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );true;
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(await web3.eth.getBalance(quickWalletScheme.address), constants.TEST_VALUE);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    assert.equal(await web3.eth.getBalance(quickWalletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await web3.eth.getBalance(accounts[1]), Number(balanceBeforePay) + constants.TEST_VALUE);
    
    const organizationProposal = await quickWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], wallet.address);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.callData[1], payCallData);
    assert.equal(organizationProposal.to[1], wallet.address);
    assert.equal(organizationProposal.value[1], 0);
  });

  it("QuickWalletScheme - proposal with data - positive decision - proposal execution fail and timeout", async function() {
    const callData = helpers.testCallFrom(constants.NULL_ADDRESS);
    
    let tx = await quickWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
  
    await expectRevert(
      votingMachine.contract.vote( proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
      "call execution failed"
    );
    
    assert.equal(
      (await quickWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    await time.increase(executionTimeout);
    
    tx = await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    assert.equal(
      (await quickWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.executionTimeout
    );
    
  });

  it("QuickWalletScheme - proposal with data - positive decision - proposal executed without return value", async function() {
    const callData = helpers.testCallWithoutReturnValueFrom(quickWalletScheme.address);
    
    let tx = await quickWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    const executionEvent = helpers.getWalletSchemeExecutionEvent(tx)

    const returnValues = executionEvent.values._callsDataResult[0];
    assert.equal(returnValues, "0x");
    
    const organizationProposal = await quickWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });
  
  it("QuickWalletScheme - proposal with REP - execute mintReputation & burnReputation", async function() {
    const callDataMintRep = await org.controller.contract.methods.mintReputation(
      constants.TEST_VALUE,
      accounts[4],
      org.avatar.address
    ).encodeABI();
    const callDataBurnRep = await org.controller.contract.methods.burnReputation(
      constants.TEST_VALUE,
      accounts[4],
      org.avatar.address
    ).encodeABI();
    var tx = await quickWalletScheme.proposeCalls(
      [org.controller.address], [callDataMintRep], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await quickWalletScheme.proposeCalls(
      [org.controller.address], [callDataBurnRep], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdBurnRep = await helpers.getValueFromLogs(tx, "_proposalId");

    // Mint Rep
    await votingMachine.contract.vote(
      proposalIdMintRep, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    assert.equal(await org.reputation.balanceOf(accounts[4]), constants.TEST_VALUE);

    // Burn Rep
    await votingMachine.contract.vote(
      proposalIdBurnRep, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);
  });
  
  it("QuickWalletScheme - proposals adding/removing schemes - should fail on registerScheme & removeScheme", async function() {
    const callDataRegisterScheme = await org.controller.contract.methods.registerScheme(
      constants.SOME_ADDRESS,
      constants.SOME_HASH,
      "0x0000000F",
      org.avatar.address
    ).encodeABI();
    const callDataRemoveScheme = await org.controller.contract.methods.unregisterScheme(
      masterWalletScheme.address,
      org.avatar.address
    ).encodeABI();
    var tx = await quickWalletScheme.proposeCalls(
      [org.controller.address], [callDataRegisterScheme], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdAddScheme = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await quickWalletScheme.proposeCalls(
      [org.controller.address], [callDataRemoveScheme], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdRemoveScheme = await helpers.getValueFromLogs(tx, "_proposalId");

    // Add Scheme
    await expectRevert(
      votingMachine.contract.vote( proposalIdAddScheme, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
      "call execution failed"
    );
    assert.equal(
      (await quickWalletScheme.getOrganizationProposal(proposalIdAddScheme)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    const addedScheme = await org.controller.schemes(constants.SOME_ADDRESS);
    assert.equal(addedScheme.paramsHash, "0x0000000000000000000000000000000000000000000000000000000000000000");
    assert.equal(addedScheme.permissions, "0x00000000");
    
    // Remove Scheme
    await expectRevert(
      votingMachine.contract.vote( proposalIdRemoveScheme, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
      "call execution failed"
    );
    assert.equal(
      (await quickWalletScheme.getOrganizationProposal(proposalIdRemoveScheme)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    const removedScheme = await org.controller.schemes(masterWalletScheme.address);
    assert.equal(removedScheme.paramsHash, votingMachine.params);
    assert.equal(removedScheme.permissions, "0x0000001f");
    
    await time.increase(executionTimeout);
    await votingMachine.contract.vote(
      proposalIdAddScheme, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    assert.equal(
      (await quickWalletScheme.getOrganizationProposal(proposalIdAddScheme)).state,
      constants.WalletSchemeProposalState.executionTimeout
    );
    
    await votingMachine.contract.vote(
      proposalIdRemoveScheme, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    assert.equal(
      (await quickWalletScheme.getOrganizationProposal(proposalIdRemoveScheme)).state,
      constants.WalletSchemeProposalState.executionTimeout
    );
  });
  
  it("QuickWalletScheme - positive decision - proposal executed - allowed by permission registry from scheme", async function() {
    const callData = helpers.testCallFrom(quickWalletScheme.address);
    
    assert.notEqual(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, quickWalletScheme.address, actionMock.address, callData.substring(0,10)
      )).fromTime.toString(),
      0
    );
    assert.notEqual(
      (await permissionRegistry.permissions(
        constants.NULL_ADDRESS, quickWalletScheme.address, constants.ANY_ADDRESS, constants.ANY_FUNC_SIGNATURE
      )).fromTime.toString(),
      0
    );
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      quickWalletScheme.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      false
    );
    
    assert.equal(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, quickWalletScheme.address, actionMock.address, callData.substring(0,10)
      )).fromTime.toString(),
      0
    );
    assert.equal(
      (await permissionRegistry.permissions(
        constants.NULL_ADDRESS, quickWalletScheme.address, constants.ANY_ADDRESS, constants.ANY_FUNC_SIGNATURE
      )).fromTime.toString(),
      0
    );
    
    const setPermissionData = new web3.eth.Contract(PermissionRegistry.abi).methods
      .setPermission(
        constants.NULL_ADDRESS, constants.ANY_ADDRESS, constants.ANY_FUNC_SIGNATURE, constants.MAX_UINT_256, true
      ).encodeABI();
      
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      quickWalletScheme.address, 
      permissionRegistry.address, 
      setPermissionData.substring(0,10),
      0, 
      true
    );
    
    assert.equal(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, quickWalletScheme.address, permissionRegistry.address, setPermissionData.substring(0,10)
      )).fromTime.toString(),
      Number(await time.latest()) + 10
    );
    
    await time.increase(10);
        
    // Proposal to allow calling actionMock
    const tx = await quickWalletScheme.proposeCalls(
      [permissionRegistry.address], [setPermissionData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    const voteTx = await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    const setPermissionTime = Number(await time.latest());
    
    assert.equal(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, quickWalletScheme.address, actionMock.address, callData.substring(0,10)
      )).fromTime.toString(),
      setPermissionTime + 10
    );
    assert.equal(
      (await permissionRegistry.permissions(
        constants.NULL_ADDRESS, quickWalletScheme.address, constants.ANY_ADDRESS, constants.ANY_FUNC_SIGNATURE
      )).fromTime.toString(),
      setPermissionTime + 10
    );
    
    await time.increase(10);

    const tx2 = await quickWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
    await votingMachine.contract.vote(
      proposalId2, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
        
    const organizationProposal = await quickWalletScheme.getOrganizationProposal(proposalId2);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });
  
  it("QuickWalletScheme - positive decision - proposal executed with transfer, pay and mint rep", async function() {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0], to: quickWalletScheme.address, value: 100000000
    });
    await wallet.transferOwnership(quickWalletScheme.address);
    
    const payCallData = await new web3.eth.Contract(wallet.abi).methods.pay(accounts[1]).encodeABI();
    const callDataMintRep = await org.controller.contract.methods.mintReputation(
      constants.TEST_VALUE,
      accounts[4],
      org.avatar.address
    ).encodeABI();
    
    let tx = await quickWalletScheme.proposeCalls(
      [wallet.address, wallet.address, org.controller.address],
      ["0x0", payCallData, callDataMintRep],
      [constants.TEST_VALUE, 0, 0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(await web3.eth.getBalance(quickWalletScheme.address), 100000000);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    tx = await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    const executionEvent = helpers.getWalletSchemeExecutionEvent(tx)
    assert.equal(executionEvent.values._callsSucessResult[0], true);
    assert.equal(executionEvent.values._callsSucessResult[1], true);
    assert.equal(executionEvent.values._callsSucessResult[2], true);
    assert.equal(executionEvent.values._callsDataResult[0], "0x");
    assert.equal(executionEvent.values._callsDataResult[1], "0x");
    assert.equal(
      executionEvent.values._callsDataResult[2], 
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );
    
    assert.equal(await web3.eth.getBalance(org.avatar.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await web3.eth.getBalance(accounts[1]), Number(balanceBeforePay) + constants.TEST_VALUE);
    assert.equal(await org.reputation.balanceOf(accounts[4]), constants.TEST_VALUE);
    
    const organizationProposal = await quickWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], wallet.address);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.callData[1], payCallData);
    assert.equal(organizationProposal.to[1], wallet.address);
    assert.equal(organizationProposal.value[1], 0);
    assert.equal(organizationProposal.callData[2], callDataMintRep);
    assert.equal(organizationProposal.to[2], org.controller.address);
    assert.equal(organizationProposal.value[2], 0);
  });
  
  describe("ERC20 Transfers", async function(){
    
    it("MasterWalletScheme - positive decision - proposal executed - ERC20 transfer allowed by permission registry from scheme", async function() {
      await testToken.transfer(org.avatar.address, 200, {from: accounts[1]});
      
      await permissionRegistry.setAdminPermission(
        constants.NULL_ADDRESS, 
        org.avatar.address, 
        constants.ANY_ADDRESS, 
        constants.ANY_FUNC_SIGNATURE,
        constants.MAX_UINT_256, 
        false
      );
      
      const setPermissionData = new web3.eth.Contract(PermissionRegistry.abi).methods
        .setPermission(
          testToken.address, actionMock.address, constants.ANY_FUNC_SIGNATURE, 100, true
        ).encodeABI();
        
      await permissionRegistry.setAdminPermission(
        constants.NULL_ADDRESS, 
        org.avatar.address, 
        permissionRegistry.address, 
        setPermissionData.substring(0,10),
        0, 
        true
      );
      
      assert.equal(
        (await permissionRegistry.getPermission(
          constants.NULL_ADDRESS, org.avatar.address, permissionRegistry.address, setPermissionData.substring(0,10)
        )).fromTime.toString(),
        Number(await time.latest()) + 10
      );
      
      await time.increase(10);
      
      // Proposal to allow calling actionMock
      const tx = await masterWalletScheme.proposeCalls(
        [permissionRegistry.address], [setPermissionData], [0], constants.TEST_TITLE, constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      const voteTx = await votingMachine.contract.vote(
        proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
      );
      const setPermissionTime = Number(await time.latest());
      const erc20TransferPermission = await permissionRegistry.getPermission(
        testToken.address, org.avatar.address, actionMock.address, constants.ANY_FUNC_SIGNATURE
      )
      assert.equal(erc20TransferPermission.fromTime.toString(), setPermissionTime + 10);
      assert.equal(erc20TransferPermission.valueAllowed.toString(), 100);
      
      await time.increase(10);
      
      const transferData = await new web3.eth.Contract(testToken.abi).methods.transfer(actionMock.address, "50").encodeABI();
      assert.equal(await testToken.balanceOf(org.avatar.address), "200");
      
      const tx2 = await masterWalletScheme.proposeCalls(
        [testToken.address], [transferData], [0], constants.TEST_TITLE, constants.SOME_HASH
      );
      const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
      await votingMachine.contract.vote(
        proposalId2, 1, 0, constants.NULL_ADDRESS, {from: accounts[2], gas: constants.GAS_LIMIT}
      );
      assert.equal(await testToken.balanceOf(org.avatar.address), "150");
      
      const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId2);
      assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
      assert.equal(organizationProposal.callData[0], transferData);
      assert.equal(organizationProposal.to[0], testToken.address);
      assert.equal(organizationProposal.value[0], 0);
    });
    
    it("MasterWalletScheme - positive decision - proposal executed - not allowed ERC20 value by permission registry in multiple calls", async function() {
      
      await permissionRegistry.setAdminPermission(
        testToken.address, 
        org.avatar.address, 
        constants.ANY_ADDRESS, 
        constants.ANY_FUNC_SIGNATURE,
        101, 
        true
      );
      
      const callData = helpers.testCallFrom(org.avatar.address);
      
      const transferData = await new web3.eth.Contract(testToken.abi)
        .methods.transfer(actionMock.address, "51").encodeABI();

      const tx = await masterWalletScheme.proposeCalls(
        [testToken.address, testToken.address],
        [transferData, transferData],
        [0, 0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      await expectRevert(
        votingMachine.contract.vote( proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
        "value call not allowed"
      );
      
      assert.equal(
        (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
        constants.WalletSchemeProposalState.submitted
      );
      
      await time.increase(executionTimeout);
      
      await votingMachine.contract.vote(
        proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
      );
      
      assert.equal(
        (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
        constants.WalletSchemeProposalState.executionTimeout
      );
    });
    
    it("MasterWalletScheme - positive decision - proposal executed - not allowed ERC20 transfer with value", async function() {
      
      await permissionRegistry.setAdminPermission(
        testToken.address, 
        org.avatar.address, 
        constants.ANY_ADDRESS, 
        constants.ANY_FUNC_SIGNATURE,
        101, 
        true
      );
      
      const callData = helpers.testCallFrom(org.avatar.address);
      
      const transferData = await new web3.eth.Contract(testToken.abi)
        .methods.transfer(actionMock.address, "100").encodeABI();

      await expectRevert(
        masterWalletScheme.proposeCalls(
          [testToken.address],
          [transferData],
          [1],
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "cant propose ERC20 transfers with value"
      );
    
    });
    
    it("QuickWalletScheme - positive decision - proposal executed - ERC20 transfer allowed by permission registry from scheme", async function() {
      await testToken.transfer(quickWalletScheme.address, 200, {from: accounts[1]});
      
      await permissionRegistry.setAdminPermission(
        constants.NULL_ADDRESS, 
        quickWalletScheme.address, 
        constants.ANY_ADDRESS, 
        constants.ANY_FUNC_SIGNATURE,
        constants.MAX_UINT_256, 
        false
      );
      
      const setPermissionData = new web3.eth.Contract(PermissionRegistry.abi).methods
        .setPermission(
          testToken.address, actionMock.address, constants.ANY_FUNC_SIGNATURE, 100, true
        ).encodeABI();
        
      await permissionRegistry.setAdminPermission(
        constants.NULL_ADDRESS, 
        quickWalletScheme.address, 
        permissionRegistry.address, 
        setPermissionData.substring(0,10),
        0, 
        true
      );
      
      assert.equal(
        (await permissionRegistry.getPermission(
          constants.NULL_ADDRESS, quickWalletScheme.address, permissionRegistry.address, setPermissionData.substring(0,10)
        )).fromTime.toString(),
        Number(await time.latest()) + 10
      );
      
      await time.increase(10);
      
      // Proposal to allow calling actionMock
      const tx = await quickWalletScheme.proposeCalls(
        [permissionRegistry.address], [setPermissionData], [0], constants.TEST_TITLE, constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      const voteTx = await votingMachine.contract.vote(
        proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
      );
      const setPermissionTime = Number(await time.latest());

      assert.equal(
        (await permissionRegistry.getPermission(
          testToken.address, quickWalletScheme.address, actionMock.address, constants.ANY_FUNC_SIGNATURE
        )).fromTime.toString(),
        setPermissionTime + 10
      );
      
      await time.increase(10);
      
      const transferData = await new web3.eth.Contract(testToken.abi).methods.transfer(actionMock.address, "50").encodeABI();
      assert.equal(await testToken.balanceOf(quickWalletScheme.address), "200");

      const tx2 = await quickWalletScheme.proposeCalls(
        [testToken.address], [transferData], [0], constants.TEST_TITLE, constants.SOME_HASH
      );
      const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
      await votingMachine.contract.vote(
        proposalId2, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
      );
      assert.equal(await testToken.balanceOf(quickWalletScheme.address), "150");
      
      const organizationProposal = await quickWalletScheme.getOrganizationProposal(proposalId2);
      assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
      assert.equal(organizationProposal.callData[0], transferData);
      assert.equal(organizationProposal.to[0], testToken.address);
      assert.equal(organizationProposal.value[0], 0);
    });
    
  })
  
});
