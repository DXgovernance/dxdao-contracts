import { ZERO_ADDRESS } from "@openzeppelin/test-helpers/src/constants";
import { assert } from "chai";
import * as helpers from "../../helpers";
const { fixSignature } = require("../../helpers/sign");
const { time, expectRevert } = require("@openzeppelin/test-helpers");

const AvatarScheme = artifacts.require("./AvatarScheme.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");

contract("WalletScheme", function (accounts) {
  let standardTokenMock,
    permissionRegistry,
    registrarScheme,
    avatarScheme,
    walletScheme,
    org,
    actionMock,
    votingMachine,
    defaultParamsHash,
    testToken;

  const constants = helpers.constants;
  const executionTimeout = 172800 + 86400; // _queuedVotePeriodLimit + _boostedVotePeriodLimit

  beforeEach(async function () {
    actionMock = await ActionMock.new();
    testToken = await ERC20Mock.new("", "", 1000, accounts[1]);
    standardTokenMock = await ERC20Mock.new("", "", 1000, accounts[1]);

    org = await helpers.deployDao({
      owner: accounts[0],
      votingMachineToken: standardTokenMock.address,
      repHolders: [
        { address: accounts[0], amount: 20000 },
        { address: accounts[1], amount: 10000 },
        { address: accounts[2], amount: 70000 },
      ],
    });

    // Parameters
    const voteOnBehalf = constants.NULL_ADDRESS;
    const _queuedVoteRequiredPercentage = 50;
    const _queuedVotePeriodLimit = 172800;
    const _boostedVotePeriodLimit = 86400;
    const _preBoostedVotePeriodLimit = 3600;
    const _thresholdConst = 2000;
    const _quietEndingPeriod = 0;
    const _proposingRepReward = 0;
    const _votersReputationLossRatio = 10;
    const _minimumDaoBounty = 15;
    const _daoBountyConst = 10;
    const _activationTime = 0;

    await org.votingMachine.setParameters(
      [
        _queuedVoteRequiredPercentage,
        _queuedVotePeriodLimit,
        _boostedVotePeriodLimit,
        _preBoostedVotePeriodLimit,
        _thresholdConst,
        _quietEndingPeriod,
        _proposingRepReward,
        _votersReputationLossRatio,
        _minimumDaoBounty,
        _daoBountyConst,
        _activationTime,
      ],
      voteOnBehalf
    );

    defaultParamsHash = await org.votingMachine.getParametersHash(
      [
        _queuedVoteRequiredPercentage,
        _queuedVotePeriodLimit,
        _boostedVotePeriodLimit,
        _preBoostedVotePeriodLimit,
        _thresholdConst,
        _quietEndingPeriod,
        _proposingRepReward,
        _votersReputationLossRatio,
        _minimumDaoBounty,
        _daoBountyConst,
        _activationTime,
      ],
      voteOnBehalf
    );

    permissionRegistry = await PermissionRegistry.new(accounts[0], 30);
    await permissionRegistry.initialize();

    registrarScheme = await WalletScheme.new();
    await registrarScheme.initialize(
      org.avatar.address,
      org.votingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "Wallet Scheme Registrar",
      executionTimeout,
      0
    );

    avatarScheme = await AvatarScheme.new();
    await avatarScheme.initialize(
      org.avatar.address,
      org.votingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "Master Wallet",
      executionTimeout,
      5
    );

    walletScheme = await WalletScheme.new();
    await walletScheme.initialize(
      org.avatar.address,
      org.votingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "Quick Wallet",
      executionTimeout,
      1
    );

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      constants.NULL_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await permissionRegistry.setETHPermission(
      registrarScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature(
        "registerScheme(address,bytes32,bool,bool)"
      ),
      0,
      true
    );

    await permissionRegistry.setETHPermission(
      registrarScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature("unregisterScheme(address)"),
      0,
      true
    );

    await permissionRegistry.setETHPermission(
      walletScheme.address,
      constants.NULL_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      registrarScheme.address,
      web3.eth.abi.encodeFunctionSignature(
        "setMaxSecondsForExecution(uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      avatarScheme.address,
      web3.eth.abi.encodeFunctionSignature(
        "setMaxSecondsForExecution(uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      walletScheme.address,
      web3.eth.abi.encodeFunctionSignature(
        "setMaxSecondsForExecution(uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature("test(address,uint256)"),
      0,
      true
    );

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature(
        "executeCall(address,bytes,uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature(
        "executeCallWithRequiredSuccess(address,bytes,uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature(
        "testWithoutReturnValue(address,uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      walletScheme.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature(
        "testWithoutReturnValue(address,uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      walletScheme.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature("test(address,uint256)"),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      walletScheme.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature(
        "executeCall(address,bytes,uint256)"
      ),
      0,
      true
    );

    await time.increase(30);

    await org.controller.registerScheme(
      registrarScheme.address,
      defaultParamsHash,
      true,
      false
    );
    await org.controller.registerScheme(
      avatarScheme.address,
      defaultParamsHash,
      false,
      true
    );
    await org.controller.registerScheme(
      walletScheme.address,
      defaultParamsHash,
      false,
      false
    );
  });

  it("Registrar Scheme", async function () {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: org.avatar.address,
      value: 1000,
    });

    const newWalletScheme = await WalletScheme.new();
    await newWalletScheme.initialize(
      org.avatar.address,
      org.votingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "New Wallet Scheme",
      executionTimeout,
      0
    );

    await org.votingMachine.setParameters(
      [60, 86400, 3600, 1800, 1050, 0, 60, 10, 15, 10, 0],
      constants.NULL_ADDRESS
    );
    const newParamsHash = await org.votingMachine.getParametersHash(
      [60, 86400, 3600, 1800, 1050, 0, 60, 10, 15, 10, 0],
      constants.NULL_ADDRESS
    );

    const registerSchemeData = web3.eth.abi.encodeFunctionCall(
      org.controller.abi.find(x => x.name === "registerScheme"),
      [newWalletScheme.address, defaultParamsHash, false, false]
    );

    const updateSchemeParamsData = web3.eth.abi.encodeFunctionCall(
      org.controller.abi.find(x => x.name === "registerScheme"),
      [avatarScheme.address, newParamsHash, false, true]
    );

    const unregisterSchemeData = web3.eth.abi.encodeFunctionCall(
      org.controller.abi.find(x => x.name === "unregisterScheme"),
      [walletScheme.address]
    );

    const proposalId1 = await helpers.getValueFromLogs(
      await registrarScheme.proposeCalls(
        [
          org.controller.address,
          org.controller.address,
          org.controller.address,
        ],
        [registerSchemeData, updateSchemeParamsData, unregisterSchemeData],
        [0, 0, 0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "_proposalId"
    );
    await org.votingMachine.vote(proposalId1, 1, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });

    const organizationProposal1 = await registrarScheme.getOrganizationProposal(
      proposalId1
    );
    assert.equal(
      organizationProposal1.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.deepEqual(organizationProposal1.to, [
      org.controller.address,
      org.controller.address,
      org.controller.address,
    ]);
    assert.deepEqual(organizationProposal1.callData, [
      registerSchemeData,
      updateSchemeParamsData,
      unregisterSchemeData,
    ]);
    // assert.deepEqual(organizationProposal1.value, ["0", "0", "0"]);

    assert.equal(
      await org.controller.isSchemeRegistered(newWalletScheme.address),
      true
    );
    assert.equal(
      await org.controller.getSchemeParameters(newWalletScheme.address),
      defaultParamsHash
    );
    assert.equal(
      await org.controller.getSchemeCanManageSchemes(newWalletScheme.address),
      false
    );
    assert.equal(
      await org.controller.getSchemeCanMakeAvatarCalls(newWalletScheme.address),
      false
    );

    assert.equal(
      await org.controller.isSchemeRegistered(walletScheme.address),
      false
    );
    assert.equal(
      await org.controller.getSchemeParameters(walletScheme.address),
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    assert.equal(
      await org.controller.getSchemeCanManageSchemes(walletScheme.address),
      false
    );
    assert.equal(
      await org.controller.getSchemeCanMakeAvatarCalls(walletScheme.address),
      false
    );

    assert.equal(
      await org.controller.isSchemeRegistered(avatarScheme.address),
      true
    );
    assert.equal(
      await org.controller.getSchemeParameters(avatarScheme.address),
      newParamsHash
    );
    assert.equal(
      await org.controller.getSchemeCanManageSchemes(avatarScheme.address),
      false
    );
    assert.equal(
      await org.controller.getSchemeCanMakeAvatarCalls(avatarScheme.address),
      true
    );
  });

  it("MasterWalletScheme - setMaxSecondsForExecution is callable only form the avatar", async function () {
    expectRevert(
      avatarScheme.setMaxSecondsForExecution(executionTimeout + 666),
      "setMaxSecondsForExecution is callable only form the avatar"
    );
    assert.equal(await avatarScheme.maxSecondsForExecution(), executionTimeout);
  });

  it("MasterWalletScheme - proposal to change max proposal time - positive decision - proposal executed", async () => {
    const callData = helpers.encodeMaxSecondsForExecution(
      executionTimeout + 666
    );

    expectRevert(
      avatarScheme.proposeCalls(
        [avatarScheme.address, ZERO_ADDRESS],
        [callData, "0x0"],
        [1, 0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );

    const tx = await avatarScheme.proposeCalls(
      [avatarScheme.address, ZERO_ADDRESS],
      [callData, "0x0"],
      [0, 0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await org.votingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });

    const organizationProposal = await avatarScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], avatarScheme.address);
    assert.equal(organizationProposal.value[0], 0);
    assert.equal(
      await avatarScheme.maxSecondsForExecution(),
      executionTimeout + 666
    );
  });

  // eslint-disable-next-line max-len
  it("MasterWalletScheme - proposal to change max proposal time fails- positive decision - proposal fails", async () => {
    const callData = helpers.encodeMaxSecondsForExecution(86400 - 1);

    expectRevert(
      avatarScheme.proposeCalls(
        [avatarScheme.address, ZERO_ADDRESS],
        [callData, "0x0"],
        [1, 0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );

    const tx = await avatarScheme.proposeCalls(
      [avatarScheme.address, ZERO_ADDRESS],
      [callData, "0x0"],
      [0, 0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(
      org.votingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "Proposal call failed"
    );

    await time.increase(executionTimeout);

    await org.votingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });

    const organizationProposal = await avatarScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
    assert.equal(
      organizationProposal.callData[0],
      setMaxSecondsForExecutionData
    );
    assert.equal(organizationProposal.to[0], avatarScheme.address);
    assert.equal(organizationProposal.value[0], 0);
    assert.equal(await avatarScheme.maxSecondsForExecution(), executionTimeout);
  });

  it("MasterWalletScheme - proposal with data or value to wallet scheme address fail", async function () {
    expectRevert(
      avatarScheme.proposeCalls(
        [avatarScheme.address],
        ["0x00000000"],
        [1],
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );
    expectRevert(
      avatarScheme.proposeCalls(
        [avatarScheme.address],
        ["0x00000000"],
        [1],
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );

    assert.equal(await avatarScheme.getOrganizationProposalsLength(), 0);
  });

  it("MasterWalletScheme - proposing proposal with different length of to and value fail", async function () {
    const callData = helpers.testCallFrom(org.avatar.address);

    expectRevert(
      avatarScheme.proposeCalls(
        [actionMock.address],
        [callData],
        [0, 0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid _value length"
    );
    expectRevert(
      avatarScheme.proposeCalls(
        [actionMock.address],
        [callData, callData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid _callData length"
    );

    assert.equal(await avatarScheme.getOrganizationProposalsLength(), 0);
    assert.equal((await avatarScheme.getOrganizationProposals()).length, 0);
  });

  it("MasterWalletScheme - proposal with data - negative decision - proposal rejected", async function () {
    const callData = helpers.testCallFrom(org.avatar.address);

    let tx = await avatarScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await votingMachine.contract.vote(
      proposalId,
      2,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    const stateChangeEvent = helpers.getEventFromTx(tx, "ProposalStateChange");
    assert.equal(stateChangeEvent.args._state, 2);

    const organizationProposal = await avatarScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
    );
    assert.equal(organizationProposal.descriptionHash, constants.SOME_HASH);
    assert.equal(organizationProposal.title, constants.TEST_TITLE);
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("MasterWalletScheme - proposal with data - positive decision - proposal executed", async function () {
    const callData = helpers.encodeMaxSecondsForExecution(
      executionTimeout + 666
    );

    const tx = await avatarScheme.proposeCalls(
      [avatarScheme.address, ZERO_ADDRESS],
      [callData, "0x0"],
      [0, 0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await org.votingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });

    const organizationProposal = await avatarScheme.getOrganizationProposal(
      proposalId
    );

    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    // assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], avatarScheme.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("MasterWalletScheme - proposal with data - positive decision - proposal executed", async function () {
    const callData = helpers.encodeMaxSecondsForExecution(executionTimeout);

    const proposalId1 = helpers.getValueFromLogs(
      await avatarScheme.proposeCalls(
        [actionMock.address, ZERO_ADDRESS],
        [callData, "0x0"],
        [0, 0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "_proposalId"
    );

    // Use signed votes to try to execute a proposal inside a proposal execution
    const voteHash = await org.votingMachine.hashVote(
      org.votingMachine.address,
      proposalId1,
      accounts[2],
      1,
      0
    );
    const voteSignature = fixSignature(
      await web3.eth.sign(voteHash, accounts[2])
    );

    const executeSignedVoteData = await org.votingMachine.contract.methods
      .executeSignedVote(
        org.votingMachine.address,
        proposalId1,
        accounts[2],
        1,
        0,
        voteSignature
      )
      .encodeABI();

    const actionMockExecuteCallWithRequiredData =
      await actionMock.contract.methods
        .executeCallWithRequiredSuccess(
          avatarScheme.address,
          executeSignedVoteData,
          0
        )
        .encodeABI();

    const actionMockExecuteCallData = await actionMock.contract.methods
      .executeCall(avatarScheme.address, executeSignedVoteData, 0)
      .encodeABI();

    // It wont allow submitting a proposal to call the wallet scheme itself, the scheme itself is only callable to call
    // setMaxSecondsForExecution function.
    await expectRevert(
      avatarScheme.proposeCalls(
        [avatarScheme.address, ZERO_ADDRESS],
        [executeSignedVoteData, "0x0"],
        [0, 0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );

    // If we execute the proposal adn we check that it succed it will fail because it does not allow the re execution
    // of a proposal when another is on the way, the revert will happen in the voting action when the proposal is
    // executed
    const proposalId2 = await helpers.getValueFromLogs(
      await avatarScheme.proposeCalls(
        [actionMock.address, ZERO_ADDRESS],
        [actionMockExecuteCallWithRequiredData, "0x0"],
        [0, 0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "_proposalId"
    );

    await expectRevert(
      org.votingMachine.vote(proposalId2, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "call execution failed"
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId1)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId2)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    // If we execute a proposal but we dont check the returned value it will still wont execute.
    // The proposal trying to execute propoposalId1 will success but proposal1 wont be exeucted sucessfuly, it will
    // still be submitted state.
    const proposalId3 = await helpers.getValueFromLogs(
      await avatarScheme.proposeCalls(
        [actionMock.address],
        [actionMockExecuteCallData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "_proposalId"
    );
    await votingMachine.contract.vote(
      proposalId3,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId1)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId3)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
  });

  it("Not allowed by permission registry", async function () {
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      constants.NULL_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      false
    );

    const callData = helpers.testCallFrom(org.avatar.address);

    const tx = await avatarScheme.proposeCalls(
      [accounts[1]],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(
      votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "PermissionRegistry: Call not allowed"
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout);

    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  it("Global ETH transfer value not allowed value by permission registry", async function () {
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      constants.NULL_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      false
    );

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      actionMock.address,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      avatarScheme.address,
      constants.NULL_SIGNATURE,
      100,
      true
    );

    const callData = helpers.testCallFrom(org.avatar.address);

    const tx = await avatarScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [101],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(
      votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "PermissionRegistry: Value limit reached"
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout + 1);

    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  // eslint-disable-next-line max-len
  it("MasterWalletScheme - positive decision - proposal executed - not allowed value by permission registry in multiple calls", async function () {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: org.avatar.address,
      value: constants.TEST_VALUE,
    });

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      constants.NULL_ADDRESS,
      constants.NULL_SIGNATURE,
      52,
      true
    );

    const callData = helpers.testCallFrom(org.avatar.address);

    const tx = await avatarScheme.proposeCalls(
      [actionMock.address, actionMock.address],
      [callData, callData],
      [50, 3],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(
      votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "PermissionRegistry: Value limit reached"
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout + 1);

    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  // eslint-disable-next-line max-len
  it("MasterWalletScheme - positive decision - proposal executed - allowed by permission registry from scheme", async () => {
    const callData = helpers.testCallFrom(org.avatar.address);

    assert.notEqual(
      (
        await permissionRegistry.getETHPermission(
          org.avatar.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      0
    );

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      constants.NULL_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      false
    );

    const setPermissionData = new web3.eth.Contract(
      PermissionRegistry.abi
    ).methods
      .setETHPermission(
        org.avatar.address,
        actionMock.address,
        callData.substring(0, 10),
        666,
        true
      )
      .encodeABI();

    await time.increase(1);

    // Proposal to allow calling actionMock
    const tx = await avatarScheme.proposeCalls(
      [permissionRegistry.address],
      [setPermissionData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    const setPermissionTime = Number(await time.latest());

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          org.avatar.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      setPermissionTime
    );

    await time.increase(1);

    const tx2 = await avatarScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
    await votingMachine.contract.vote(
      proposalId2,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    const organizationProposal = await avatarScheme.getOrganizationProposal(
      proposalId2
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("MasterWalletScheme - positive decision - proposal executed with multiple calls and value", async function () {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: org.avatar.address,
      value: constants.TEST_VALUE,
    });
    await wallet.transferOwnership(org.avatar.address);

    const payCallData = await new web3.eth.Contract(wallet.abi).methods
      .pay(accounts[1])
      .encodeABI();

    permissionRegistry.setETHPermission(
      org.avatar.address,
      wallet.address,
      constants.NULL_SIGNATURE,
      constants.TEST_VALUE,
      true
    );

    permissionRegistry.setETHPermission(
      org.avatar.address,
      wallet.address,
      payCallData.substring(0, 10),
      constants.TEST_VALUE,
      true
    );

    await time.increase(30);

    const tx = await avatarScheme.proposeCalls(
      [wallet.address, wallet.address],
      ["0x0", payCallData],
      [constants.TEST_VALUE, 0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(
      await web3.eth.getBalance(org.avatar.address),
      constants.TEST_VALUE
    );
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);

    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2], gas: 9000000 }
    );
    assert.equal(await web3.eth.getBalance(org.avatar.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );

    const organizationProposal = await avatarScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], wallet.address);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.callData[1], payCallData);
    assert.equal(organizationProposal.to[1], wallet.address);
    assert.equal(organizationProposal.value[1], 0);
  });

  it("MasterWalletScheme - positive decision - proposal execute and show revert in return", async function () {
    const callData = helpers.testCallFrom(constants.NULL_ADDRESS);

    let tx = await avatarScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await expectRevert(
      votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "call execution failed"
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout);

    tx = await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  it("MasterWalletScheme - positive decision - proposal executed without return value", async function () {
    const callData = helpers.testCallWithoutReturnValueFrom(org.avatar.address);

    let tx = await avatarScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    const executionEvent = helpers.getEventFromTx(tx, "ExecutionResults");
    const returnValue = web3.eth.abi.decodeParameters(
      ["bool", "bytes"],
      executionEvent.args._callsDataResult[0]
    );
    assert.equal(returnValue["0"], true);
    assert.equal(returnValue["1"], null);

    const organizationProposal = await avatarScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("MasterWalletScheme - proposal with REP - execute mintReputation & burnReputation", async function () {
    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4], org.avatar.address)
      .encodeABI();
    const callDataBurnRep = await org.controller.contract.methods
      .burnReputation(constants.TEST_VALUE, accounts[4], org.avatar.address)
      .encodeABI();

    var tx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [callDataMintRep],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [callDataBurnRep],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdBurnRep = await helpers.getValueFromLogs(tx, "_proposalId");

    // Mint Rep
    tx = await votingMachine.contract.vote(
      proposalIdMintRep,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      constants.TEST_VALUE
    );

    // Burn Rep
    tx = await votingMachine.contract.vote(
      proposalIdBurnRep,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const mintRepProposal = await avatarScheme.getOrganizationProposalByIndex(
      0
    );
    assert.equal(
      mintRepProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(mintRepProposal.callData[0], callDataMintRep);
    assert.equal(mintRepProposal.to[0], org.controller.address);
    assert.equal(mintRepProposal.value[0], 0);

    const burnRepProposal = await avatarScheme.getOrganizationProposalByIndex(
      1
    );
    assert.equal(
      burnRepProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(burnRepProposal.callData[0], callDataBurnRep);
    assert.equal(burnRepProposal.to[0], org.controller.address);
    assert.equal(burnRepProposal.value[0], 0);
  });

  it("MasterWalletScheme - proposal to mint more REP than the % allowed reverts", async function () {
    const totalSupplyWhenExecuting = await org.reputation.totalSupply();
    const maxRepAmountToChange =
      (totalSupplyWhenExecuting * 105) / 100 - totalSupplyWhenExecuting;

    const data0 = await org.controller.contract.methods
      .mintReputation(maxRepAmountToChange + 1, accounts[4], org.avatar.address)
      .encodeABI();

    const data1 = await org.controller.contract.methods
      .mintReputation(maxRepAmountToChange, accounts[4], org.avatar.address)
      .encodeABI();
    var tx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [data0],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRepToFail = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );

    tx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [data1],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "_proposalId");

    await expectRevert(
      votingMachine.contract.vote(
        proposalIdMintRepToFail,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      ),
      "WalletScheme: maxRepPercentageChange passed"
    );

    await votingMachine.contract.vote(
      proposalIdMintRep,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      maxRepAmountToChange
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalIdMintRepToFail))
        .state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );
    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalIdMintRep)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
  });

  it("MasterWalletScheme - proposal to burn more REP than the % allowed reverts", async function () {
    const voterRep = await org.reputation.balanceOf(accounts[2]);
    const totalSupplyWhenExecuting = await org.reputation.totalSupply();
    const maxRepAmountToChange = -(
      (totalSupplyWhenExecuting * 95) / 100 -
      totalSupplyWhenExecuting
    );

    const data0 = await org.controller.contract.methods
      .burnReputation(maxRepAmountToChange + 1, accounts[2], org.avatar.address)
      .encodeABI();

    const data1 = await org.controller.contract.methods
      .burnReputation(maxRepAmountToChange, accounts[2], org.avatar.address)
      .encodeABI();
    var tx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [data0],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRepToFail = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );

    tx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [data1],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "_proposalId");

    await expectRevert(
      votingMachine.contract.vote(
        proposalIdMintRepToFail,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      ),
      "maxRepPercentageChange passed"
    );
    await votingMachine.contract.vote(
      proposalIdMintRep,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    // Here we use approximately because we loose a bit of precition on calculating to a lower percentage of 100%
    assert.approximately(
      (await org.reputation.balanceOf(accounts[2])).toNumber(),
      voterRep - maxRepAmountToChange,
      2
    );

    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalIdMintRepToFail))
        .state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );
    assert.equal(
      (await avatarScheme.getOrganizationProposal(proposalIdMintRep)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
  });

  // eslint-disable-next-line max-len
  it("MasterWalletScheme - proposals adding/removing schemes - execute registerScheme & removeScheme fails", async function () {
    const callDataRegisterScheme = await org.controller.contract.methods
      .registerScheme(
        constants.SOME_ADDRESS,
        constants.SOME_HASH,
        "0x0000000F",
        org.avatar.address
      )
      .encodeABI();
    const callDataRemoveScheme = await org.controller.contract.methods
      .unregisterScheme(walletScheme.address, org.avatar.address)
      .encodeABI();
    var tx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [callDataRegisterScheme],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdAddScheme = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );
    tx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [callDataRemoveScheme],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdRemoveScheme = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );

    // Add Scheme
    await expectRevert(
      votingMachine.contract.vote(
        proposalIdAddScheme,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      ),
      "call execution failed"
    );

    const addedScheme = await org.controller.schemes(constants.SOME_ADDRESS);
    assert.equal(
      addedScheme.paramsHash,
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    assert.equal(addedScheme.permissions, "0x00000000");

    // Remove Scheme
    await expectRevert(
      votingMachine.contract.vote(
        proposalIdRemoveScheme,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      ),
      "call execution failed"
    );

    const removedScheme = await org.controller.schemes(walletScheme.address);
    assert.equal(removedScheme.paramsHash, votingMachine.params);
    assert.equal(removedScheme.permissions, "0x00000001");
  });

  it("MasterWalletScheme - execute should fail if not passed/executed from votingMachine", async function () {
    const callData = helpers.testCallFrom(org.avatar.address);
    var tx = await avatarScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await votingMachine.contract.execute(proposalId);
    const organizationProposal = await avatarScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );
  });

  it("MasterWalletScheme - positive decision - proposal executed with transfer, pay and mint rep", async function () {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: org.avatar.address,
      value: constants.TEST_VALUE,
    });
    await wallet.transferOwnership(org.avatar.address);

    const payCallData = await new web3.eth.Contract(wallet.abi).methods
      .pay(accounts[1])
      .encodeABI();

    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4], org.avatar.address)
      .encodeABI();

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      wallet.address,
      payCallData.substring(0, 10),
      constants.TEST_VALUE,
      true
    );

    await time.increase(100);

    const tx = await avatarScheme.proposeCalls(
      [wallet.address, wallet.address, org.controller.address],
      ["0x0", payCallData, callDataMintRep],
      [constants.TEST_VALUE, 0, 0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(
      await web3.eth.getBalance(org.avatar.address),
      constants.TEST_VALUE
    );
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(await web3.eth.getBalance(org.avatar.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );
    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      constants.TEST_VALUE
    );

    const organizationProposal = await avatarScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
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

  it("MasterWalletScheme - cant initialize with wrong values", async function () {
    const unitializedWalletScheme = await WalletScheme.new();

    await expectRevert(
      unitializedWalletScheme.initialize(
        org.avatar.address,
        accounts[0],
        org.controller.address,
        permissionRegistry.address,
        "Master Wallet",
        86400 - 1,
        5
      ),
      "_maxSecondsForExecution cant be less than 86400 seconds"
    );
    await expectRevert(
      unitializedWalletScheme.initialize(
        constants.NULL_ADDRESS,
        accounts[0],
        org.controller.address,
        permissionRegistry.address,
        "Master Wallet",
        executionTimeout,
        5
      ),
      "avatar cannot be zero"
    );
  });

  it("MasterWalletScheme - cannot initialize twice", async function () {
    await expectRevert(
      avatarScheme.initialize(
        org.avatar.address,
        accounts[0],
        org.controller.address,
        permissionRegistry.address,
        "Master Wallet",
        executionTimeout,
        5
      ),
      "cannot init twice"
    );
  });

  it("MasterWalletScheme cant receive value in contract", async function () {
    await expectRevert(
      web3.eth.sendTransaction({
        from: accounts[0],
        to: avatarScheme.address,
        value: constants.TEST_VALUE,
      }),
      "Cant receive if it will make generic calls to avatar"
    );
  });

  it("QuickWalletScheme can receive value in contract", async function () {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: walletScheme.address,
      value: constants.TEST_VALUE,
    });
  });

  it("QuickWalletScheme - proposal with data - negative decision - proposal rejected", async function () {
    const callData = helpers.testCallFrom(walletScheme.address);

    let tx = await walletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await votingMachine.contract.vote(
      proposalId,
      2,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    const stateChangeEvent = helpers.getEventFromTx(tx, "ProposalStateChange");
    assert.equal(stateChangeEvent.args._state, 2);

    const organizationProposal = await walletScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("QuickWalletScheme - proposal with data - positive decision - proposal executed", async function () {
    const callData = helpers.testCallFrom(walletScheme.address);

    const tx = await walletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    const organizationProposal = await walletScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  // eslint-disable-next-line max-len
  it("QuickWalletScheme - proposal with data - positive decision - proposal executed with multiple calls and value", async function () {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: walletScheme.address,
      value: constants.TEST_VALUE,
    });
    await wallet.transferOwnership(walletScheme.address);

    const payCallData = await new web3.eth.Contract(wallet.abi).methods
      .pay(accounts[1])
      .encodeABI();

    await permissionRegistry.setETHPermission(
      walletScheme.address,
      wallet.address,
      payCallData.substring(0, 10),
      constants.TEST_VALUE,
      true
    );
    await time.increase(100);

    const tx = await walletScheme.proposeCalls(
      [wallet.address, wallet.address],
      ["0x0", payCallData],
      [constants.TEST_VALUE, 0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    true;
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(
      await web3.eth.getBalance(walletScheme.address),
      constants.TEST_VALUE
    );
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(await web3.eth.getBalance(walletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );

    const organizationProposal = await walletScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], wallet.address);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.callData[1], payCallData);
    assert.equal(organizationProposal.to[1], wallet.address);
    assert.equal(organizationProposal.value[1], 0);
  });

  it("QuickWalletScheme - proposal with data - positive decision - proposal execution fail and timeout", async () => {
    const callData = helpers.testCallFrom(constants.NULL_ADDRESS);

    let tx = await walletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await expectRevert(
      votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "call execution failed"
    );

    assert.equal(
      (await walletScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout);

    tx = await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (await walletScheme.getOrganizationProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  // eslint-disable-next-line max-len
  it("QuickWalletScheme - proposal with data - positive decision - proposal executed without return value", async function () {
    const callData = helpers.testCallWithoutReturnValueFrom(
      walletScheme.address
    );

    let tx = await walletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    const executionEvent = helpers.getEventFromTx(tx, "ExecutionResults");

    const returnValues = executionEvent.args._callsDataResult[0];
    assert.equal(returnValues, "0x");

    const organizationProposal = await walletScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("QuickWalletScheme - proposal with REP - execute mintReputation & burnReputation", async function () {
    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4], org.avatar.address)
      .encodeABI();
    const callDataBurnRep = await org.controller.contract.methods
      .burnReputation(constants.TEST_VALUE, accounts[4], org.avatar.address)
      .encodeABI();

    var tx = await walletScheme.proposeCalls(
      [org.controller.address],
      [callDataMintRep],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await walletScheme.proposeCalls(
      [org.controller.address],
      [callDataBurnRep],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdBurnRep = await helpers.getValueFromLogs(tx, "_proposalId");

    // Mint Rep
    await votingMachine.contract.vote(
      proposalIdMintRep,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      constants.TEST_VALUE
    );

    // Burn Rep
    await votingMachine.contract.vote(
      proposalIdBurnRep,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);
  });

  // eslint-disable-next-line max-len
  it("QuickWalletScheme - proposals adding/removing schemes - should fail on registerScheme & removeScheme", async function () {
    await permissionRegistry.setETHPermission(
      walletScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature(
        "registerScheme(address,bytes32,bytes4,address)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      walletScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature("unregisterScheme(address,address)"),
      0,
      true
    );

    const callDataRegisterScheme = await org.controller.contract.methods
      .registerScheme(
        constants.SOME_ADDRESS,
        constants.SOME_HASH,
        "0x0000000F",
        org.avatar.address
      )
      .encodeABI();
    const callDataRemoveScheme = await org.controller.contract.methods
      .unregisterScheme(avatarScheme.address, org.avatar.address)
      .encodeABI();

    var tx = await walletScheme.proposeCalls(
      [org.controller.address],
      [callDataRegisterScheme],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdAddScheme = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );
    tx = await walletScheme.proposeCalls(
      [org.controller.address],
      [callDataRemoveScheme],
      [0],
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdRemoveScheme = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );

    // Add Scheme
    await expectRevert(
      votingMachine.contract.vote(
        proposalIdAddScheme,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      ),
      "call execution failed"
    );
    assert.equal(
      (await walletScheme.getOrganizationProposal(proposalIdAddScheme)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    const addedScheme = await org.controller.schemes(constants.SOME_ADDRESS);
    assert.equal(
      addedScheme.paramsHash,
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    assert.equal(addedScheme.permissions, "0x00000000");

    // Remove Scheme
    await expectRevert(
      votingMachine.contract.vote(
        proposalIdRemoveScheme,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      ),
      "call execution failed"
    );
    assert.equal(
      (await walletScheme.getOrganizationProposal(proposalIdRemoveScheme))
        .state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    const removedScheme = await org.controller.schemes(avatarScheme.address);
    assert.equal(removedScheme.paramsHash, votingMachine.params);
    assert.equal(removedScheme.permissions, "0x00000011");

    await time.increase(executionTimeout);
    await votingMachine.contract.vote(
      proposalIdAddScheme,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(
      (await walletScheme.getOrganizationProposal(proposalIdAddScheme)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );

    await votingMachine.contract.vote(
      proposalIdRemoveScheme,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(
      (await walletScheme.getOrganizationProposal(proposalIdRemoveScheme))
        .state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  // eslint-disable-next-line max-len
  it("QuickWalletScheme - positive decision - proposal executed - allowed by permission registry from scheme", async function () {
    const callData = helpers.testCallFrom(walletScheme.address);

    assert.notEqual(
      (
        await permissionRegistry.getETHPermission(
          walletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      0
    );

    await permissionRegistry.setETHPermission(
      walletScheme.address,
      actionMock.address,
      callData.substring(0, 10),
      0,
      false
    );

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          walletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      0
    );

    const setPermissionData = new web3.eth.Contract(
      PermissionRegistry.abi
    ).methods
      .setETHPermission(
        walletScheme.address,
        actionMock.address,
        callData.substring(0, 10),
        constants.MAX_UINT_256,
        true
      )
      .encodeABI();

    await time.increase(1);

    // Proposal to allow calling actionMock
    const tx = await walletScheme.proposeCalls(
      [permissionRegistry.address],
      [setPermissionData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    const setPermissionTime = Number(await time.latest());

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          walletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      setPermissionTime
    );

    await time.increase(1);

    const tx2 = await walletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
    await votingMachine.contract.vote(
      proposalId2,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    const organizationProposal = await walletScheme.getOrganizationProposal(
      proposalId2
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("QuickWalletScheme - positive decision - proposal executed with transfer, pay and mint rep", async function () {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: walletScheme.address,
      value: 100000000,
    });
    await wallet.transferOwnership(walletScheme.address);

    const payCallData = await new web3.eth.Contract(wallet.abi).methods
      .pay(accounts[1])
      .encodeABI();
    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4], org.avatar.address)
      .encodeABI();

    await permissionRegistry.setETHPermission(
      walletScheme.address,
      wallet.address,
      payCallData.substring(0, 10),
      constants.TEST_VALUE,
      true
    );

    let tx = await walletScheme.proposeCalls(
      [wallet.address, wallet.address, org.controller.address],
      ["0x0", payCallData, callDataMintRep],
      [constants.TEST_VALUE, 0, 0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(await web3.eth.getBalance(walletScheme.address), 100000000);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    tx = await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
    const executionEvent = helpers.getEventFromTx(tx, "ExecutionResults");
    assert.equal(executionEvent.args._callsSucessResult[0], true);
    assert.equal(executionEvent.args._callsSucessResult[1], true);
    assert.equal(executionEvent.args._callsSucessResult[2], true);
    assert.equal(executionEvent.args._callsDataResult[0], "0x");
    assert.equal(executionEvent.args._callsDataResult[1], "0x");
    assert.equal(
      executionEvent.args._callsDataResult[2],
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );

    assert.equal(await web3.eth.getBalance(org.avatar.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );
    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      constants.TEST_VALUE
    );

    const organizationProposal = await walletScheme.getOrganizationProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
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

  describe("ERC20 Transfers", async function () {
    // eslint-disable-next-line max-len
    it("MasterWalletScheme - positive decision - proposal executed - ERC20 transfer allowed by permission registry from scheme", async function () {
      await testToken.transfer(org.avatar.address, 200, { from: accounts[1] });

      await permissionRegistry.setETHPermission(
        org.avatar.address,
        testToken.address,
        web3.eth.abi.encodeFunctionSignature("transfer(address,uint256)"),
        0,
        true
      );

      await permissionRegistry.transferOwnership(org.avatar.address);

      const addERC20LimitData = new web3.eth.Contract(
        PermissionRegistry.abi
      ).methods
        .addERC20Limit(avatarScheme.address, testToken.address, 100, 0)
        .encodeABI();

      await time.increase(1);

      // Proposal to allow calling actionMock
      const tx = await avatarScheme.proposeCalls(
        [permissionRegistry.address],
        [addERC20LimitData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      await votingMachine.contract.vote(
        proposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      );

      const erc20TransferPermission = await permissionRegistry.getERC20Limit(
        avatarScheme.address,
        testToken.address
      );

      assert.equal(erc20TransferPermission.toString(), "100");

      await time.increase(1);

      const transferData = await new web3.eth.Contract(testToken.abi).methods
        .transfer(actionMock.address, "50")
        .encodeABI();
      assert.equal(await testToken.balanceOf(org.avatar.address), "200");

      const tx2 = await avatarScheme.proposeCalls(
        [testToken.address],
        [transferData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
      await votingMachine.contract.vote(
        proposalId2,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2], gas: constants.GAS_LIMIT }
      );
      assert.equal(await testToken.balanceOf(org.avatar.address), "150");

      const organizationProposal = await avatarScheme.getOrganizationProposal(
        proposalId2
      );
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
      assert.equal(organizationProposal.callData[0], transferData);
      assert.equal(organizationProposal.to[0], testToken.address);
      assert.equal(organizationProposal.value[0], 0);
    });

    // eslint-disable-next-line max-len
    it("MasterWalletScheme - positive decision - proposal executed - not allowed ERC20 value by permission registry in multiple calls", async function () {
      await testToken.transfer(org.avatar.address, 200, { from: accounts[1] });

      await permissionRegistry.setETHPermission(
        org.avatar.address,
        testToken.address,
        web3.eth.abi.encodeFunctionSignature("transfer(address,uint256)"),
        0,
        true
      );
      await permissionRegistry.addERC20Limit(
        org.avatar.address,
        testToken.address,
        100,
        0
      );

      assert.equal(
        await permissionRegistry.getERC20Limit(
          org.avatar.address,
          testToken.address
        ),
        100
      );

      const transferData = await new web3.eth.Contract(testToken.abi).methods
        .transfer(actionMock.address, "101")
        .encodeABI();

      const tx = await avatarScheme.proposeCalls(
        [testToken.address],
        [transferData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      await expectRevert(
        votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
          from: accounts[2],
        }),
        "PermissionRegistry: Value limit reached"
      );

      assert.equal(
        (await avatarScheme.getOrganizationProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
      );

      await time.increase(executionTimeout);
      await votingMachine.contract.vote(
        proposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      );

      assert.equal(
        (await avatarScheme.getOrganizationProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
      );
    });

    // eslint-disable-next-line max-len
    it("QuickWalletScheme - positive decision - proposal executed - not allowed ERC20 value by permission registry in multiple calls", async function () {
      await testToken.transfer(walletScheme.address, 200, {
        from: accounts[1],
      });

      await permissionRegistry.setETHPermission(
        walletScheme.address,
        testToken.address,
        web3.eth.abi.encodeFunctionSignature("transfer(address,uint256)"),
        0,
        true
      );
      await permissionRegistry.addERC20Limit(
        walletScheme.address,
        testToken.address,
        100,
        0
      );

      assert.equal(
        await permissionRegistry.getERC20Limit(
          walletScheme.address,
          testToken.address
        ),
        100
      );

      const transferData = await new web3.eth.Contract(testToken.abi).methods
        .transfer(actionMock.address, "101")
        .encodeABI();

      const tx = await walletScheme.proposeCalls(
        [testToken.address],
        [transferData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      await expectRevert(
        votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
          from: accounts[2],
        }),
        "PermissionRegistry: Value limit reached"
      );

      assert.equal(
        (await walletScheme.getOrganizationProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
      );

      await time.increase(executionTimeout);

      await votingMachine.contract.vote(
        proposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      );

      assert.equal(
        (await walletScheme.getOrganizationProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
      );
    });

    // eslint-disable-next-line max-len
    it("MasterWalletScheme - positive decision - proposal executed - not allowed ERC20 transfer with value", async () => {
      await permissionRegistry.addERC20Limit(
        org.avatar.address,
        testToken.address,
        101,
        0
      );

      const transferData = await new web3.eth.Contract(testToken.abi).methods
        .transfer(actionMock.address, "100")
        .encodeABI();

      await expectRevert(
        avatarScheme.proposeCalls(
          [testToken.address],
          [transferData],
          [1],
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "cant propose ERC20 transfers with value"
      );
    });

    // eslint-disable-next-line max-len
    it("QuickWalletScheme - positive decision - proposal executed - ERC20 transfer allowed by permission registry from scheme", async function () {
      await testToken.transfer(walletScheme.address, 200, {
        from: accounts[1],
      });

      await permissionRegistry.setETHPermission(
        walletScheme.address,
        testToken.address,
        web3.eth.abi.encodeFunctionSignature("transfer(address,uint256)"),
        0,
        true
      );

      const addERC20LimitData = new web3.eth.Contract(
        PermissionRegistry.abi
      ).methods
        .addERC20Limit(walletScheme.address, testToken.address, 100, 0)
        .encodeABI();

      // Proposal to allow calling actionMock
      const tx = await walletScheme.proposeCalls(
        [permissionRegistry.address],
        [addERC20LimitData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      await votingMachine.contract.vote(
        proposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      );

      assert.equal(
        await permissionRegistry.getERC20Limit(
          walletScheme.address,
          testToken.address
        ),
        100
      );
      await time.increase(1);

      const transferData = await new web3.eth.Contract(testToken.abi).methods
        .transfer(actionMock.address, "50")
        .encodeABI();
      assert.equal(await testToken.balanceOf(walletScheme.address), "200");

      const tx2 = await walletScheme.proposeCalls(
        [testToken.address],
        [transferData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");

      await votingMachine.contract.vote(
        proposalId2,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      );
      assert.equal(await testToken.balanceOf(walletScheme.address), "150");

      const organizationProposal = await walletScheme.getOrganizationProposal(
        proposalId2
      );
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
      assert.equal(organizationProposal.callData[0], transferData);
      assert.equal(organizationProposal.to[0], testToken.address);
      assert.equal(organizationProposal.value[0], 0);
    });
  });
});
