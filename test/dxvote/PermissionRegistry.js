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

contract("PermissionRegistry", function(accounts) {
  
  let standardTokenMock,
  permissionRegistry,
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
      accounts, standardTokenMock.address, 'dxd',
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
      0
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
    
    await time.increase(30);
    
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
  
  it("PermissionRegistry - fail in deploying wring wrong args", async function() {
    await expectRevert(
      PermissionRegistry.new(constants.NULL_ADDRESS, 10),
      "PermissionRegistry: Invalid owner address"
    );
    
    await expectRevert(
      PermissionRegistry.new(org.avatar.address, 0),
      "PermissionRegistry: Invalid time delay"
    );
  })
  
  it("PermissionRegistry - transfer ownerhip and set time delay", async function() {
    
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
      quickWalletScheme.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      false
    );
    
    await expectRevert(
      permissionRegistry.setPermission(
        constants.NULL_ADDRESS, 
        permissionRegistry.address, 
        constants.ANY_FUNC_SIGNATURE,
        constants.MAX_UINT_256, 
        true
      ),
      "PermissionRegistry: Cant set permissions to PermissionRegistry"
    );
    
    await permissionRegistry.transferOwnership(org.avatar.address);
    
    await expectRevert(
      permissionRegistry.setAdminPermission(
        constants.NULL_ADDRESS, 
        quickWalletScheme.address, 
        constants.ANY_ADDRESS, 
        constants.ANY_FUNC_SIGNATURE,
        constants.MAX_UINT_256, 
        true
      ),
      "PermissionRegistry: Only callable by owner"
    );
    
    await expectRevert(
      permissionRegistry.setTimeDelay(60),
      "PermissionRegistry: Only callable by owner"
    );
    
    await expectRevert(
      permissionRegistry.transferOwnership(accounts[0]),
      "PermissionRegistry: Only callable by owner"
    );
    
    const setTimeDelayData = new web3.eth.Contract(PermissionRegistry.abi).methods
      .setTimeDelay(60).encodeABI();
    
    const callData = helpers.testCallFrom(quickWalletScheme.address);
      
    const setAdminPermissionData = new web3.eth.Contract(PermissionRegistry.abi).methods
      .setAdminPermission(
        constants.NULL_ADDRESS, quickWalletScheme.address, actionMock.address, callData.substring(0,10), 666, true
      ).encodeABI();
    
    const tx = await masterWalletScheme.proposeCalls(
      [permissionRegistry.address, permissionRegistry.address], [setTimeDelayData, setAdminPermissionData], [0, 0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    
    assert.equal(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, quickWalletScheme.address, actionMock.address, callData.substring(0,10)
      )).fromTime.toString(),
      0
    );
    
    const tx1 = await votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]});
    const testCallAllowedFromTime = (await permissionRegistry.getPermission(
      constants.NULL_ADDRESS, quickWalletScheme.address, actionMock.address, callData.substring(0,10)
    )).fromTime;

    assert.equal(testCallAllowedFromTime.toNumber(),  (await time.latest()).toNumber() + 60);
    
    assert.equal(await permissionRegistry.timeDelay(), 60);

    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.executionSuccedd
    );
    
    const tx2 = await quickWalletScheme.proposeCalls(
      [actionMock.address], [callData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");

    // The call to execute is not allowed YET, because we change the delay time to 30 seconds
    await expectRevert(
      votingMachine.contract.vote(proposalId2, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}),
      "call not allowed"
    );
    
    // After increasing the time it will allow the proposal execution
    await time.increaseTo(testCallAllowedFromTime);
    await votingMachine.contract.vote(
      proposalId2, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]}
    );
    
    const organizationProposal = await quickWalletScheme.getOrganizationProposal(proposalId2);
    assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("PermissionRegistry - transfer ownerhip and set permission from quickwallet", async function() {
    
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
      quickWalletScheme.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      false
    );
    
    const callData = helpers.testCallFrom(quickWalletScheme.address);
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      quickWalletScheme.address, 
      actionMock.address, 
      callData.substring(0,10),
      666, 
      true
    );
      
    const setPermissionData = new web3.eth.Contract(PermissionRegistry.abi).methods
      .setPermission(
        constants.NULL_ADDRESS, actionMock.address, callData.substring(0,10), 666, false
      ).encodeABI();
    
    // Allow quickWalletScheme set its own permissions
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      quickWalletScheme.address, 
      permissionRegistry.address, 
      setPermissionData.substring(0, 10),
      0, 
      true
    );
    
    await permissionRegistry.transferOwnership(org.avatar.address);
    
    const tx = await quickWalletScheme.proposeCalls(
      [permissionRegistry.address], [setPermissionData], [0], constants.TEST_TITLE, constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    
    const setPermissionCallAllowedFromTime = (await permissionRegistry.getPermission(
      constants.NULL_ADDRESS, quickWalletScheme.address, permissionRegistry.address, setPermissionData.substring(0,10)
    )).fromTime;
    
    await time.increaseTo(setPermissionCallAllowedFromTime);
    
    assert.notEqual(
      (await permissionRegistry.getPermission(
        constants.NULL_ADDRESS, quickWalletScheme.address, actionMock.address, callData.substring(0,10)
      )).fromTime.toString(),
      0
    );
    
    const tx1 = await votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]});
    
    assert.equal(
      (await quickWalletScheme.getOrganizationProposal(proposalId)).state,
      constants.WalletSchemeProposalState.executionSuccedd
    );

    assert.equal((await permissionRegistry.getPermission(
      constants.NULL_ADDRESS, quickWalletScheme.address, actionMock.address, callData.substring(0,10)
    )).fromTime,  0);
    
    assert.equal((await permissionRegistry.getPermission(
      constants.NULL_ADDRESS, quickWalletScheme.address, actionMock.address, callData.substring(0,10)
    )).valueAllowed,  0);
  
  });
  
});
