import * as helpers from "../helpers";
const { fixSignature } = require('../helpers/sign');
const { time, expectRevert } = require("@openzeppelin/test-helpers");

const WalletScheme = artifacts.require("./WalletScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const DaoCreator = artifacts.require("./DaoCreator.sol");
const DxControllerCreator = artifacts.require("./DxControllerCreator.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const Wallet = artifacts.require("./Wallet.sol");

contract("WalletScheme", function(accounts) {
  
  let standardTokenMock,
  permissionRegistry,
  registrarWalletScheme,
  masterWalletScheme,
  quickWalletScheme,
  daoCreator,
  org,
  actionMock,
  votingMachine,
  testToken;
  
  const constants = helpers.constants;
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
    standardTokenMock = await ERC20Mock.new(accounts[1], 1000);
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
    votingMachine = await helpers.setupGenesisProtocol(accounts, standardTokenMock.address, 'dxd',
      constants.NULL_ADDRESS, // voteOnBehalf
      50, // queuedVoteRequiredPercentage
      172800, // queuedVotePeriodLimit
      86400, // boostedVotePeriodLimit
      3600, // preBoostedVotePeriodLimit
      2000, // thresholdConst
      0, // quietEndingPeriod
      0, // proposingRepReward
      0, // votersReputationLossRatio
      15, // minimumDaoBounty
      10, // daoBountyConst
      0 // activationTime
    );
    
    permissionRegistry = await PermissionRegistry.new(accounts[0], 30);
    
    registrarWalletScheme = await WalletScheme.new();
    await registrarWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      org.controller.address,
      permissionRegistry.address,
      "Wallet Scheme Registrar",
      executionTimeout,
      0
    );
    
    masterWalletScheme = await WalletScheme.new();
    await masterWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      org.controller.address,
      permissionRegistry.address,
      "Master Wallet",
      executionTimeout,
      5
    );
    
    quickWalletScheme = await WalletScheme.new();
    await quickWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      constants.NULL_ADDRESS,
      permissionRegistry.address,
      "Quick Wallet",
      executionTimeout,
      1
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
    
    // Only allow genericCall, mintReputation, burnReputation, registerScheme and removeScheme 
    // functions to be called in the controller by Wallet Schemes
    await Promise.all([
      org.controller.contract._jsonInterface.find(method => method.name == 'mintTokens').signature,
      org.controller.contract._jsonInterface.find(method => method.name == 'unregisterSelf').signature,
      org.controller.contract._jsonInterface.find(method => method.name == 'addGlobalConstraint').signature,
      org.controller.contract._jsonInterface.find(method => method.name == 'removeGlobalConstraint').signature,
      org.controller.contract._jsonInterface.find(method => method.name == 'upgradeController').signature,
      org.controller.contract._jsonInterface.find(method => method.name == 'sendEther').signature,
      org.controller.contract._jsonInterface.find(method => method.name == 'externalTokenTransfer').signature,
      org.controller.contract._jsonInterface.find(method => method.name == 'externalTokenTransferFrom').signature,
      org.controller.contract._jsonInterface.find(method => method.name == 'externalTokenApproval').signature,
      org.controller.contract._jsonInterface.find(method => method.name == 'metaData').signature
    ].map(async (funcSignature) => {
      await permissionRegistry.setAdminPermission(
        constants.NULL_ADDRESS, 
        org.avatar.address, 
        org.controller.address, 
        funcSignature,
        constants.MAX_UINT_256, 
        false
      );
    }));
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS,
      org.avatar.address,
      org.controller.address,
      constants.ANY_FUNC_SIGNATURE,
      0,
      true
    );
    
    await time.increase(30);
    
    await daoCreator.setSchemes(
      org.avatar.address,
      [registrarWalletScheme.address, masterWalletScheme.address, quickWalletScheme.address],
      [votingMachine.params, votingMachine.params, votingMachine.params],
      [helpers.encodePermission({
        canGenericCall: true,
        canUpgrade: true,
        canChangeConstraints: true,
        canRegisterSchemes: true
      }),
      helpers.encodePermission({
        canGenericCall: true,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
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
  
  it("Registrar Wallet Scheme", async function() {
    
    await web3.eth.sendTransaction({ from: accounts[0], to: org.avatar.address, value: 1000 });
    
    const newWalletScheme = await WalletScheme.new();
    await newWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      constants.NULL_ADDRESS,
      permissionRegistry.address,
      "New Wallet",
      executionTimeout,
      0
    );
    
    // Check that calls to controller that were set as not allowed are not executable in schemes that calls the
    // controller
    const callsToController = [
      await org.controller.contract.methods.mintTokens(1, accounts[5], org.avatar.address).encodeABI(),
      await org.controller.contract.methods.unregisterSelf(org.avatar.address).encodeABI(),
      await org.controller.contract.methods.addGlobalConstraint(accounts[5], constants.SOME_HASH, org.avatar.address).encodeABI(),
      await org.controller.contract.methods.removeGlobalConstraint (accounts[5], org.avatar.address).encodeABI(),
      await org.controller.contract.methods.upgradeController(accounts[5], org.avatar.address).encodeABI(),
      await org.controller.contract.methods.sendEther(1, accounts[5], org.avatar.address).encodeABI(),
      await org.controller.contract.methods.externalTokenTransfer(standardTokenMock.address, accounts[5], 1, org.avatar.address).encodeABI(),
      await org.controller.contract.methods.externalTokenTransferFrom(standardTokenMock.address, org.avatar.address, accounts[5], 1, org.avatar.address).encodeABI(),
      await org.controller.contract.methods.externalTokenApproval(standardTokenMock.address, accounts[5], 1, org.avatar.address).encodeABI(),
      await org.controller.contract.methods.metaData("test", org.avatar.address).encodeABI()
    ];
    await Promise.all(callsToController.map(async (callToControllerData) => {
      const callToControllerProposal = await helpers.getValueFromLogs(await registrarWalletScheme.proposeCalls(
        [org.controller.address], [callToControllerData], [0], constants.TEST_TITLE, constants.SOME_HASH
      ), "_proposalId");
      await expectRevert(
        votingMachine.contract.vote( callToControllerProposal, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
        "call not allowed"
      );
    }));
    await Promise.all(callsToController.map(async (callToControllerData) => {
      const callToControllerProposal = await helpers.getValueFromLogs(await masterWalletScheme.proposeCalls(
        [org.controller.address], [callToControllerData], [0], constants.TEST_TITLE, constants.SOME_HASH
      ), "_proposalId");
      await expectRevert(
        votingMachine.contract.vote( callToControllerProposal, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
        "call not allowed"
      );
    }));
    
    const registerSchemeData = await org.controller.contract.methods.registerScheme(
      newWalletScheme.address,
      votingMachine.params,
      helpers.encodePermission({
        canGenericCall: false,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
      }),
      org.avatar.address
    ).encodeABI();
    
    await votingMachine.contract.setParameters(
      [ 60, 86400, 3600, 1800, 1050, 0, 60, 10, 15, 10, 0 ], constants.NULL_ADDRESS
    );
    const newVotingParamsHash = await votingMachine.contract.getParametersHash(
      [ 60, 86400, 3600, 1800, 1050, 0, 60, 10, 15, 10, 0 ], constants.NULL_ADDRESS
    );
    
    const updateSchemeParamsData = await org.controller.contract.methods.registerScheme(
      masterWalletScheme.address,
      newVotingParamsHash,
      helpers.encodePermission({
        canGenericCall: true,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
      }),
      org.avatar.address
    ).encodeABI();
    
    const unregisterSchemeData = await org.controller.contract.methods.unregisterScheme(
      quickWalletScheme.address,
      org.avatar.address
    ).encodeABI();
    
    const proposalId1 = await helpers.getValueFromLogs(await masterWalletScheme.proposeCalls(
      [org.controller.address], [registerSchemeData], [0], constants.TEST_TITLE, constants.SOME_HASH
    ), "_proposalId");
    await expectRevert(
      votingMachine.contract.vote( proposalId1, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
      "call execution failed"
    );
    
    const proposalId2 = await helpers.getValueFromLogs(await masterWalletScheme.proposeCalls(
      [org.controller.address], [unregisterSchemeData], [0], constants.TEST_TITLE, constants.SOME_HASH
    ), "_proposalId");
    await expectRevert(
      votingMachine.contract.vote( proposalId2, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} ),
      "call execution failed"
    );
    
    const proposalId3 = await helpers.getValueFromLogs(await registrarWalletScheme.proposeCalls(
      [org.controller.address], [registerSchemeData], [0], constants.TEST_TITLE, constants.SOME_HASH
    ), "_proposalId");
    await votingMachine.contract.vote( proposalId3, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} );
    
    const proposalId4 = await helpers.getValueFromLogs(await registrarWalletScheme.proposeCalls(
      [org.controller.address], [unregisterSchemeData], [0], constants.TEST_TITLE, constants.SOME_HASH
    ), "_proposalId");
    await votingMachine.contract.vote( proposalId4, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} );
    
    const proposalId5 = await helpers.getValueFromLogs(await registrarWalletScheme.proposeCalls(
      [org.controller.address], [updateSchemeParamsData], [0], constants.TEST_TITLE, constants.SOME_HASH
    ), "_proposalId");
    await votingMachine.contract.vote( proposalId5, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]} );
    
    const organizationProposal1 = await registrarWalletScheme.getOrganizationProposal(proposalId3);
    assert.equal(organizationProposal1.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal1.callData[0], registerSchemeData);
    assert.equal(organizationProposal1.to[0], org.controller.address);
    assert.equal(organizationProposal1.value[0], 0);
    
    const organizationProposal2 = await registrarWalletScheme.getOrganizationProposal(proposalId4);
    assert.equal(organizationProposal2.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal2.callData[0], unregisterSchemeData);
    assert.equal(organizationProposal2.to[0], org.controller.address);
    assert.equal(organizationProposal2.value[0], 0);
    
    const organizationProposal3 = await registrarWalletScheme.getOrganizationProposal(proposalId5);
    assert.equal(organizationProposal3.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal3.callData[0], updateSchemeParamsData);
    assert.equal(organizationProposal3.to[0], org.controller.address);
    assert.equal(organizationProposal3.value[0], 0);
    
    assert.equal(
      await org.controller.isSchemeRegistered(newWalletScheme.address, org.avatar.address),
      true
    );
    assert.equal(
      await org.controller.getSchemeParameters(newWalletScheme.address, org.avatar.address),
      votingMachine.params
    );
    assert.equal(
      await org.controller.getSchemePermissions(newWalletScheme.address, org.avatar.address),
      helpers.encodePermission({
        canGenericCall: false,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
      })
    );
    assert.equal(
      await org.controller.isSchemeRegistered(quickWalletScheme.address, org.avatar.address),
      false
    );
    assert.equal(
      await org.controller.getSchemeParameters(quickWalletScheme.address, org.avatar.address),
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    assert.equal(
      await org.controller.getSchemePermissions(quickWalletScheme.address, org.avatar.address),
      "0x00000000"
    );
    assert.equal(
      await org.controller.getSchemePermissions(masterWalletScheme.address, org.avatar.address),
      helpers.encodePermission({
        canGenericCall: true,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
      })
    );
    assert.equal(
      await org.controller.isSchemeRegistered(masterWalletScheme.address, org.avatar.address),
      true
    );
    assert.equal(
      await org.controller.getSchemeParameters(masterWalletScheme.address, org.avatar.address),
      newVotingParamsHash
    );
  });
  
  it("MasterWalletScheme - setMaxSecondsForExecution is callable only form the avatar", async function() {
    expectRevert(
      masterWalletScheme.setMaxSecondsForExecution(executionTimeout+666),
      "setMaxSecondsForExecution is callable only form the avatar"
    );
    assert.equal(await masterWalletScheme.maxSecondsForExecution(), executionTimeout);
  });
  
  it("MasterWalletScheme - proposal to change max proposal time - positive decision - proposal executed", async function() {
    const setMaxSecondsForExecutionData = web3.eth.abi.encodeFunctionCall({
      name: 'setMaxSecondsForExecution',
      type: 'function',
      inputs: [{
        type: 'uint256',
        name: '_maxSecondsForExecution'
      }]
    }, [executionTimeout+666]);
    
    expectRevert(masterWalletScheme.proposeCalls(
      [masterWalletScheme.address], [setMaxSecondsForExecutionData], [1], constants.TEST_TITLE, constants.SOME_HASH
    ), "invalid proposal caller");
    
    const tx = await masterWalletScheme.proposeCalls(
      [masterWalletScheme.address], [setMaxSecondsForExecutionData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], setMaxSecondsForExecutionData);
    assert.equal(organizationProposal.to[0], masterWalletScheme.address);
    assert.equal(organizationProposal.value[0], 0);
    assert.equal(await masterWalletScheme.maxSecondsForExecution(), executionTimeout+666);
  });
  
  it("MasterWalletScheme - proposal to change max proposal time fails- positive decision - proposal fails", async function() {
    const setMaxSecondsForExecutionData = web3.eth.abi.encodeFunctionCall({
      name: 'setMaxSecondsForExecution',
      type: 'function',
      inputs: [{
        type: 'uint256',
        name: '_maxSecondsForExecution'
      }]
    }, [86400-1]);
    
    expectRevert(masterWalletScheme.proposeCalls(
      [masterWalletScheme.address], [setMaxSecondsForExecutionData], [1], constants.TEST_TITLE, constants.SOME_HASH
    ), "invalid proposal caller");
    
    const tx = await masterWalletScheme.proposeCalls(
      [masterWalletScheme.address], [setMaxSecondsForExecutionData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    ), "call execution failed");
    
    await time.increase(executionTimeout);
    
    await votingMachine.contract.vote(
      proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionTimeout);
    assert.equal(organizationProposal.callData[0], setMaxSecondsForExecutionData);
    assert.equal(organizationProposal.to[0], masterWalletScheme.address);
    assert.equal(organizationProposal.value[0], 0);
    assert.equal(await masterWalletScheme.maxSecondsForExecution(), executionTimeout);
  });
  
  it("MasterWalletScheme - proposal with data or value to wallet scheme address fail", async function() {
    const setMaxSecondsForExecutionData = web3.eth.abi.encodeFunctionCall({
      name: 'setMaxSecondsForExecution',
      type: 'function',
      inputs: [{
        type: 'uint256',
        name: '_maxSecondsForExecution'
      }]
    }, [executionTimeout+666])
    
    expectRevert(masterWalletScheme.proposeCalls(
      [masterWalletScheme.address], ["0x00000000"], [1], constants.TEST_TITLE, constants.SOME_HASH
    ), "invalid proposal caller");
    expectRevert(masterWalletScheme.proposeCalls(
      [masterWalletScheme.address], ["0x00000000"], [1], constants.TEST_TITLE, constants.SOME_HASH
    ), "invalid proposal caller");

    assert.equal(await masterWalletScheme.getOrganizationProposalsLength(), 0);
  });
  
  it("MasterWalletScheme - proposing proposal with 0xaaaaaaaa siganture fail", async function() {
      
    expectRevert(masterWalletScheme.proposeCalls(
      [actionMock.address], ["0xaaaaaaaa"], [0], constants.TEST_TITLE, constants.SOME_HASH
    ), "cant propose calls with 0xaaaaaaaa signature");
    expectRevert(masterWalletScheme.proposeCalls(
      [actionMock.address], ["0xaaaaaaaa"], [1], constants.TEST_TITLE, constants.SOME_HASH
    ), "cant propose calls with 0xaaaaaaaa signature");

    assert.equal(await masterWalletScheme.getOrganizationProposalsLength(), 0);
    assert.equal((await masterWalletScheme.getOrganizationProposals()).length, 0);
  });
  
  it("MasterWalletScheme - proposing proposal to 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa address fail", async function() {
    expectRevert(masterWalletScheme.proposeCalls(
      ["0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"], ["0x00000001"], [0], constants.TEST_TITLE, constants.SOME_HASH
    ), "cant propose calls to 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa address");
    expectRevert(masterWalletScheme.proposeCalls(
      ["0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"], ["0x00000001"], [1], constants.TEST_TITLE, constants.SOME_HASH
    ), "cant propose calls to 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa address");
    expectRevert(masterWalletScheme.proposeCalls(
      ["0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"], ["0x00"], [1], constants.TEST_TITLE, constants.SOME_HASH
    ), "cant propose calls to 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa address");

    assert.equal(await masterWalletScheme.getOrganizationProposalsLength(), 0);
    assert.equal((await masterWalletScheme.getOrganizationProposals()).length, 0);
  });
  
  it("MasterWalletScheme - proposing proposal with different length of to and value fail", async function() {
    const callData = helpers.testCallFrom(org.avatar.address);

    expectRevert(masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0, 0], constants.TEST_TITLE, constants.SOME_HASH
    ), "invalid _value length");
    expectRevert(masterWalletScheme.proposeCalls(
      [actionMock.address], [callData, callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    ), "invalid _callData length");
    
    assert.equal(await masterWalletScheme.getOrganizationProposalsLength(), 0);
    assert.equal((await masterWalletScheme.getOrganizationProposals()).length, 0);
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
    const stateChangeEvent = helpers.getWalletSchemeEvent(tx, 'ProposalStateChange');
    assert.equal(stateChangeEvent.values._state, 2);
    
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
  
  it("MasterWalletScheme - proposal with data - positive decision - proposal executed", async function() {
    const callData = helpers.testCallFrom(org.avatar.address);
    
    const proposalId1 = helpers.getValueFromLogs(await masterWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    ), "_proposalId");
    
    // Use signed votes to try to exeucte a proposal inside a proposal execution
    const voteHash = await votingMachine.contract.hashVote(
      votingMachine.address, proposalId1, accounts[2], 1, 0
    );
    const voteSignature = fixSignature(await web3.eth.sign(voteHash, accounts[2]));
    
    const executeSignedVoteData = await votingMachine.contract.contract.methods.executeSignedVote(
      votingMachine.address,
      proposalId1,
      accounts[2],
      1,
      0,
      voteSignature
    ).encodeABI();
    
    const actionMockExecuteCallWithRequiredData = await actionMock.contract.methods.executeCallWithRequiredSuccess(
      masterWalletScheme.address, executeSignedVoteData, 0
    ).encodeABI();
      
    const actionMockExecuteCallData = await actionMock.contract.methods.executeCall(
      masterWalletScheme.address, executeSignedVoteData, 0
    ).encodeABI();

    // It wont allow submitting a proposal to call the wallet scheme itself, the scheme itself is only callable to call
    // setMaxSecondsForExecution function.
    await expectRevert(masterWalletScheme.proposeCalls(
      [masterWalletScheme.address],
      [executeSignedVoteData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    ), "invalid proposal caller");
    
    // If we execute the proposal adn we check that it succed it will fail because it does not allow the re execution
    // of a proposal when another is on the way, the revert will happen in the voting action when the proposal is
    // executed
    const proposalId2 = await helpers.getValueFromLogs(await masterWalletScheme.proposeCalls(
      [actionMock.address],
      [actionMockExecuteCallWithRequiredData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    ), "_proposalId");
    
    await expectRevert(votingMachine.contract.vote(
      proposalId2, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    ), "call execution failed");
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId1)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId2)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    // If we execute a proposal but we dont check the returned value it will still wont execute.
    // The proposal trying to execute propoposalId1 will success but proposal1 wont be exeucted sucessfuly, it will 
    // still be submitted state.
    const proposalId3 = await helpers.getValueFromLogs(await masterWalletScheme.proposeCalls(
      [actionMock.address],
      [actionMockExecuteCallData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    ), "_proposalId");
    await votingMachine.contract.vote(
      proposalId3, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId1)).state,
      constants.WalletSchemeProposalState.submitted
    );
    
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId3)).state,
      constants.WalletSchemeProposalState.executionSuccedd
    );

  });
  
  it("Not allowed by permission registry", async function() {
    
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
  
  it("Global ETH transfer value not allowed value by permission registry", async function() {

    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256,
      false
    );
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      actionMock.address, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      masterWalletScheme.address, 
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
      "total value transfered of asset in proposal not allowed"
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
      52, 
      true
    );
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      masterWalletScheme.address, 
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
      "total value transfered of asset in proposal not allowed"
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
      Number(await time.latest()) + 30
    );
    
    await time.increase(30);
    
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
      setPermissionTime + 30
    );
    assert.equal(
      (await permissionRegistry.permissions(
        constants.NULL_ADDRESS, org.avatar.address, constants.ANY_ADDRESS, constants.ANY_FUNC_SIGNATURE
      )).fromTime.toString(),
      0
    );
    
    await time.increase(30);

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
  
  it("MasterWalletScheme - positive decision - proposal executed - allowed any func signature by permission registry from scheme", async function() {
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
        constants.NULL_ADDRESS, constants.ANY_ADDRESS, callData.substring(0,10), 666, true
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
      Number(await time.latest()) + 30
    );
    
    await time.increase(30);
    // Proposal to allow calling any actionMock function
    const tx = await masterWalletScheme.proposeCalls(
      [permissionRegistry.address], [setPermissionData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    const voteTx = await votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]});
    const setPermissionTime = Number(await time.latest());

    assert.equal(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, org.avatar.address, constants.ANY_ADDRESS, callData.substring(0,10)
      )).fromTime.toString(),
      setPermissionTime + 30
    );
    
    assert.equal(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, org.avatar.address, constants.ANY_ADDRESS, callData.substring(0,10)
      )).valueAllowed.toString(),
      666
    );
    assert.equal(
      (await permissionRegistry.permissions(
        constants.NULL_ADDRESS, org.avatar.address, constants.ANY_ADDRESS, constants.ANY_FUNC_SIGNATURE
      )).fromTime.toString(),
      0
    );
    
    await time.increase(30);

    const actionMock2 = await ActionMock.new();
    await web3.eth.sendTransaction({ from: accounts[0], to: org.avatar.address, value: 1000 });
    
    const tx2 = await masterWalletScheme.proposeCalls(
      [actionMock.address, actionMock2.address],
      [callData, callData],
      [0, 666], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
    await votingMachine.contract.vote(
      proposalId2, 1, 0, constants.NULL_ADDRESS, {from: accounts[2], gas: 9000000}
    );
        
    const organizationProposal = await masterWalletScheme.getOrganizationProposal(proposalId2);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.callData[1], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.to[1], actionMock2.address);
    assert.equal(organizationProposal.value[0], 0);
    assert.equal(organizationProposal.value[1], 666);
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
    const executionEvent = helpers.getWalletSchemeEvent(tx, 'ExecutionResults')
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
    
    const mintRepProposal = await masterWalletScheme.getOrganizationProposalByIndex(0);
    assert.equal(mintRepProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(mintRepProposal.callData[0], callDataMintRep);
    assert.equal(mintRepProposal.to[0], org.controller.address);
    assert.equal(mintRepProposal.value[0], 0);
    
    const burnRepProposal = await masterWalletScheme.getOrganizationProposalByIndex(1);
    assert.equal(burnRepProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(burnRepProposal.callData[0], callDataBurnRep);
    assert.equal(burnRepProposal.to[0], org.controller.address);
    assert.equal(burnRepProposal.value[0], 0);
  });
  
  it("MasterWalletScheme - proposal to mint more REP than the % allowed reverts", async function() {
    const totalSupplyWhenExecuting = await org.reputation.totalSupply();
    const maxRepAmountToChange = ((totalSupplyWhenExecuting * 105) / 100) - totalSupplyWhenExecuting;

    const data0 = await org.controller.contract.methods.mintReputation(
      maxRepAmountToChange + 1,
      accounts[4],
      org.avatar.address
    ).encodeABI();
    
    const data1 = await org.controller.contract.methods.mintReputation(
        maxRepAmountToChange,
        accounts[4],
        org.avatar.address
      ).encodeABI();
    var tx = await masterWalletScheme.proposeCalls(
      [org.controller.address], [ data0 ], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdMintRepToFail = await helpers.getValueFromLogs(tx, "_proposalId");
    
    var tx = await masterWalletScheme.proposeCalls(
      [org.controller.address], [data1], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "_proposalId");
    
    await expectRevert(
      votingMachine.contract.vote(proposalIdMintRepToFail, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}),
      "WalletScheme: maxRepPercentageChange passed"
    );

    await votingMachine.contract.vote(proposalIdMintRep, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]})

    assert.equal(await org.reputation.balanceOf(accounts[4]), maxRepAmountToChange);

    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalIdMintRepToFail)).state,
      constants.WalletSchemeProposalState.submitted
    );
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalIdMintRep)).state,
      constants.WalletSchemeProposalState.executionSuccedd
    );
    
  });
  
  it("MasterWalletScheme - proposal to burn more REP than the % allowed reverts", async function() {
    const voterRep = await org.reputation.balanceOf(accounts[2]);
    const totalSupplyWhenExecuting = await org.reputation.totalSupply();
    const maxRepAmountToChange = -(((totalSupplyWhenExecuting * 95) / 100) - totalSupplyWhenExecuting);
    
    const data0 = await org.controller.contract.methods.burnReputation(
      maxRepAmountToChange + 1,
      accounts[2],
      org.avatar.address
    ).encodeABI();
    
    const data1 = await org.controller.contract.methods.burnReputation(
        maxRepAmountToChange,
        accounts[2],
        org.avatar.address
      ).encodeABI();
    var tx = await masterWalletScheme.proposeCalls(
      [org.controller.address], [ data0 ], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdMintRepToFail = await helpers.getValueFromLogs(tx, "_proposalId");
    
    var tx = await masterWalletScheme.proposeCalls(
      [org.controller.address], [data1], [0], constants.TEST_TITLE, constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "_proposalId");
    
    await expectRevert(
      votingMachine.contract.vote(proposalIdMintRepToFail, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}),
      "maxRepPercentageChange passed"
    );
    await votingMachine.contract.vote(proposalIdMintRep, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]})

    // Here we use approximately because we loose a bit of precition on calculating to a lower percentage of 100%
    assert.approximately(
      (await org.reputation.balanceOf(accounts[2])).toNumber(),
      voterRep - maxRepAmountToChange, 
      2
    );

    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalIdMintRepToFail)).state,
      constants.WalletSchemeProposalState.submitted
    );
    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalIdMintRep)).state,
      constants.WalletSchemeProposalState.executionSuccedd
    );
    
  });
  
  it("MasterWalletScheme - proposals adding/removing schemes - execute registerScheme & removeScheme fails", async function() {
    const callDataRegisterScheme = await org.controller.contract.methods.registerScheme(
      constants.SOME_ADDRESS,
      constants.SOME_HASH,
      "0x0000000F",
      org.avatar.address
    ).encodeABI();
    const callDataRemoveScheme = await org.controller.contract.methods.unregisterScheme(
      quickWalletScheme.address,
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
    await expectRevert( votingMachine.contract.vote(
        proposalIdAddScheme, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
      ),
      "call execution failed"
    );
    
    const addedScheme = await org.controller.schemes(constants.SOME_ADDRESS);
    assert.equal(addedScheme.paramsHash, "0x0000000000000000000000000000000000000000000000000000000000000000");
    assert.equal(addedScheme.permissions, "0x00000000");
    
    // Remove Scheme
    await expectRevert( votingMachine.contract.vote(
      proposalIdRemoveScheme, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    ),
    "call execution failed"
  );
    
    const removedScheme = await org.controller.schemes(quickWalletScheme.address);
    assert.equal(removedScheme.paramsHash, votingMachine.params);
    assert.equal(removedScheme.permissions, "0x00000001");
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
  
  it("MasterWalletScheme - cant initialize with wrong values", async function() {
    const unitializedWalletScheme = await WalletScheme.new();

    await expectRevert(unitializedWalletScheme.initialize(
        org.avatar.address,
        accounts[0],
        accounts[0],
        constants.NULL_ADDRESS,
        permissionRegistry.address,
        "Master Wallet",
        86400-1,
        5
      ),"_maxSecondsForExecution cant be less than 86400 seconds"
    );
    await expectRevert(unitializedWalletScheme.initialize(
        constants.NULL_ADDRESS,
        accounts[0],
        accounts[0],
        constants.NULL_ADDRESS,
        permissionRegistry.address,
        "Master Wallet",
        executionTimeout,
        5
      ),"avatar cannot be zero"
    );
  });
  
  it("MasterWalletScheme - cannot initialize twice", async function() {
    await expectRevert(masterWalletScheme.initialize(
        org.avatar.address,
        accounts[0],
        accounts[0],
        constants.NULL_ADDRESS,
        permissionRegistry.address,
        "Master Wallet",
        executionTimeout,
        5
      ), "cannot init twice"
    );
  });
  
  it("MasterWalletScheme cant receive value in contract", async function() {
    await expectRevert(
      web3.eth.sendTransaction({
        from: accounts[0], to: masterWalletScheme.address, value: constants.TEST_VALUE
      }), "Cant receive if it will make generic calls to avatar"
    )
  });
  
  it("QuickWalletScheme can receive value in contract", async function() {
    await web3.eth.sendTransaction({
      from: accounts[0], to: quickWalletScheme.address, value: constants.TEST_VALUE
    });
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
    const stateChangeEvent = helpers.getWalletSchemeEvent(tx, 'ProposalStateChange');
    assert.equal(stateChangeEvent.values._state, 2);
    
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
    const executionEvent = helpers.getWalletSchemeEvent(tx, 'ExecutionResults')

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
    assert.equal(removedScheme.permissions, "0x00000011");
    
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
      Number(await time.latest()) + 30
    );
    
    await time.increase(30);
        
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
      setPermissionTime + 30
    );
    assert.equal(
      (await permissionRegistry.permissions(
        constants.NULL_ADDRESS, quickWalletScheme.address, constants.ANY_ADDRESS, constants.ANY_FUNC_SIGNATURE
      )).fromTime.toString(),
      setPermissionTime + 30
    );
    
    await time.increase(30);

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
    const executionEvent = helpers.getWalletSchemeEvent(tx, 'ExecutionResults')
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
        Number(await time.latest()) + 30
      );
      
      await time.increase(30);
      
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
      assert.approximately(erc20TransferPermission.fromTime.toNumber(), setPermissionTime + 30, 1);
      assert.equal(erc20TransferPermission.valueAllowed.toString(), 100);
      
      await time.increase(30);
      
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
        51, 
        true
      );
      
      await permissionRegistry.setAdminPermission(
        testToken.address, 
        org.avatar.address, 
        masterWalletScheme.address, 
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
        "total value transfered of asset in proposal not allowed"
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
        Number(await time.latest()) + 30
      );
      
      await time.increase(30);
      
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
        setPermissionTime + 30
      );
      
      await time.increase(30);
      
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
    
  });
  
});
