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
    masterWalletScheme,
    quickWalletScheme,
    org,
    actionMock,
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

    defaultParamsHash = await helpers.setDefaultParameters(org.votingMachine);

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

    masterWalletScheme = await WalletScheme.new();
    await masterWalletScheme.initialize(
      org.avatar.address,
      org.votingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "Master Wallet",
      executionTimeout,
      5
    );

    quickWalletScheme = await WalletScheme.new();
    await quickWalletScheme.initialize(
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
      constants.ZERO_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await permissionRegistry.setETHPermission(
      registrarScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature(
        "registerScheme(address,bytes32,bool,bool,bool)"
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
      quickWalletScheme.address,
      constants.ZERO_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await permissionRegistry.setETHPermission(
      registrarScheme.address,
      registrarScheme.address,
      web3.eth.abi.encodeFunctionSignature(
        "setMaxSecondsForExecution(uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      masterWalletScheme.address,
      web3.eth.abi.encodeFunctionSignature(
        "setMaxSecondsForExecution(uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      quickWalletScheme.address,
      web3.eth.abi.encodeFunctionSignature(
        "setMaxSecondsForExecution(uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature("test(address,uint256)"),
      0,
      true
    );

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature(
        "executeCall(address,bytes,uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature(
        "executeCallWithRequiredSuccess(address,bytes,uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature(
        "testWithoutReturnValue(address,uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature(
        "testWithoutReturnValue(address,uint256)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      actionMock.address,
      web3.eth.abi.encodeFunctionSignature("test(address,uint256)"),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
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
      false,
      false
    );
    await org.controller.registerScheme(
      masterWalletScheme.address,
      defaultParamsHash,
      false,
      false,
      true
    );
    await org.controller.registerScheme(
      quickWalletScheme.address,
      defaultParamsHash,
      false,
      false,
      true
    );
  });

  it("Registrar Scheme", async function () {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: masterWalletScheme.address,
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
      constants.ZERO_ADDRESS
    );
    const newParamsHash = await org.votingMachine.getParametersHash(
      [60, 86400, 3600, 1800, 1050, 0, 60, 10, 15, 10, 0],
      constants.ZERO_ADDRESS
    );

    const registerSchemeData = web3.eth.abi.encodeFunctionCall(
      org.controller.abi.find(x => x.name === "registerScheme"),
      [newWalletScheme.address, defaultParamsHash, false, false, false]
    );

    const updateSchemeParamsData = web3.eth.abi.encodeFunctionCall(
      org.controller.abi.find(x => x.name === "registerScheme"),
      [masterWalletScheme.address, newParamsHash, false, true, false]
    );

    const unregisterSchemeData = web3.eth.abi.encodeFunctionCall(
      org.controller.abi.find(x => x.name === "unregisterScheme"),
      [quickWalletScheme.address]
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
    await org.votingMachine.vote(
      proposalId1,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const organizationProposal1 = await registrarScheme.getProposal(
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
    assert.deepEqual(organizationProposal1.value, ["0", "0", "0"]);

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
      await org.controller.isSchemeRegistered(quickWalletScheme.address),
      false
    );
    assert.equal(
      await org.controller.getSchemeParameters(quickWalletScheme.address),
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    assert.equal(
      await org.controller.getSchemeCanManageSchemes(quickWalletScheme.address),
      false
    );
    assert.equal(
      await org.controller.getSchemeCanMakeAvatarCalls(
        quickWalletScheme.address
      ),
      false
    );

    assert.equal(
      await org.controller.isSchemeRegistered(masterWalletScheme.address),
      true
    );
    assert.equal(
      await org.controller.getSchemeParameters(masterWalletScheme.address),
      newParamsHash
    );
    assert.equal(
      await org.controller.getSchemeCanManageSchemes(
        masterWalletScheme.address
      ),
      false
    );
    assert.equal(
      await org.controller.getSchemeCanMakeAvatarCalls(
        masterWalletScheme.address
      ),
      true
    );
  });

  it("MasterWalletScheme - setMaxSecondsForExecution is callable only form the avatar", async function () {
    await expectRevert(
      masterWalletScheme.setMaxSecondsForExecution(executionTimeout + 666),
      "Scheme__SetMaxSecondsForExecutionInvalidCaller()"
    );
    assert.equal(
      await masterWalletScheme.maxSecondsForExecution(),
      executionTimeout
    );
  });

  it("MasterWalletScheme - proposal to change max proposal time - positive decision - proposal executed", async () => {
    const callData = helpers.encodeMaxSecondsForExecution(86400 + 666);

    await expectRevert(
      masterWalletScheme.proposeCalls(
        [masterWalletScheme.address],
        [callData],
        [1],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );

    const tx = await masterWalletScheme.proposeCalls(
      [masterWalletScheme.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const organizationProposal = await masterWalletScheme.getProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], masterWalletScheme.address);
    assert.equal(organizationProposal.value[0], 0);
    assert.equal(
      await masterWalletScheme.maxSecondsForExecution(),
      86400 + 666
    );
  });

  // eslint-disable-next-line max-len
  it("MasterWalletScheme - proposal to change max proposal time fails - positive decision - proposal fails", async () => {
    const callData = helpers.encodeMaxSecondsForExecution(86400 - 1);

    await expectRevert(
      masterWalletScheme.proposeCalls(
        [masterWalletScheme.address],
        [callData],
        [1],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );

    const tx = await masterWalletScheme.proposeCalls(
      [masterWalletScheme.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert.unspecified(
      org.votingMachine.vote(
        proposalId,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      )
    );

    await time.increase(executionTimeout);

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const organizationProposal = await masterWalletScheme.getProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );

    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], masterWalletScheme.address);
    assert.equal(organizationProposal.value[0], 0);
    assert.equal(
      await masterWalletScheme.maxSecondsForExecution(),
      executionTimeout
    );
  });

  it("MasterWalletScheme - proposal with data or value to wallet scheme address fail", async function () {
    await expectRevert(
      masterWalletScheme.proposeCalls(
        [masterWalletScheme.address],
        ["0x00000000"],
        [1],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );

    await expectRevert(
      masterWalletScheme.proposeCalls(
        [masterWalletScheme.address],
        ["0x00000000"],
        [1],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );

    assert.equal(await masterWalletScheme.getOrganizationProposalsLength(), 0);
  });

  it("MasterWalletScheme - proposing proposal with different length of to and value fail", async function () {
    const callData = helpers.testCallFrom(masterWalletScheme.address);

    await expectRevert(
      masterWalletScheme.proposeCalls(
        [actionMock.address],
        [callData],
        [0, 0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "Scheme_InvalidParameterArrayLength()"
    );
    await expectRevert(
      masterWalletScheme.proposeCalls(
        [actionMock.address],
        [callData, callData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "Scheme_InvalidParameterArrayLength()"
    );

    assert.equal(await masterWalletScheme.getOrganizationProposalsLength(), 0);
  });

  it("MasterWalletScheme - cannot make a proposal with more than 2 options", async function () {
    const callData = helpers.testCallFrom(masterWalletScheme.address);

    await expectRevert(
      masterWalletScheme.proposeCalls(
        [actionMock.address],
        [callData],
        [0],
        3,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "WalletScheme__TotalOptionsMustBeTwo()"
    );
  });

  it("MasterWalletScheme - proposal with data - negative decision - proposal rejected", async function () {
    const callData = helpers.testCallFrom(masterWalletScheme.address);

    let tx = await masterWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await org.votingMachine.vote(
      proposalId,
      constants.NO_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );
    const stateChangeEvent = helpers.getEventFromTx(tx, "ProposalStateChange");

    assert.equal(stateChangeEvent.args._state, 2);

    const organizationProposal = await masterWalletScheme.getProposal(
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

    const tx = await masterWalletScheme.proposeCalls(
      [masterWalletScheme.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const organizationProposal = await masterWalletScheme.getProposal(
      proposalId
    );

    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], masterWalletScheme.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it.skip("MasterWalletScheme - proposal with data - positive decision - proposal executed", async function () {
    const callData = helpers.encodeMaxSecondsForExecution(executionTimeout);

    const proposalId1 = helpers.getValueFromLogs(
      await masterWalletScheme.proposeCalls(
        [actionMock.address],
        [callData],
        [0],
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
          masterWalletScheme.address,
          executeSignedVoteData,
          0
        )
        .encodeABI();

    const actionMockExecuteCallData = await actionMock.contract.methods
      .executeCall(masterWalletScheme.address, executeSignedVoteData, 0)
      .encodeABI();

    // It wont allow submitting a proposal to call the wallet scheme itself, the scheme itself is only callable to call
    // setMaxSecondsForExecution function.
    await expectRevert(
      masterWalletScheme.proposeCalls(
        [masterWalletScheme.address],
        [executeSignedVoteData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "invalid proposal caller"
    );

    // If we execute the proposal and we check that it succeeded it will fail because it does not allow the re execution
    // of a proposal when another is on the way, the revert will happen in the voting action when the proposal is
    // executed
    const proposalId2 = await helpers.getValueFromLogs(
      await masterWalletScheme.proposeCalls(
        [actionMock.address],
        [actionMockExecuteCallWithRequiredData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "_proposalId"
    );

    await expectRevert(
      org.votingMachine.vote(
        proposalId2,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      ),
      "call execution failed"
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId1)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId2)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    // If we execute a proposal but we dont check the returned value it will still wont execute.
    // The proposal trying to execute propoposalId1 will success but proposal1 wont be exeucted sucessfuly, it will
    // still be submitted state.
    const proposalId3 = await helpers.getValueFromLogs(
      await masterWalletScheme.proposeCalls(
        [actionMock.address],
        [actionMockExecuteCallData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "_proposalId"
    );
    await org.votingMachine.vote(
      proposalId3,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId1)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId3)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
  });

  it("setETHPermissionUsed fails if not allowed by permission registry", async function () {
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      constants.ZERO_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      false
    );

    const callData = helpers.testCallFrom(masterWalletScheme.address);

    const tx = await masterWalletScheme.proposeCalls(
      [accounts[1]],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(
      org.votingMachine.vote(
        proposalId,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      ),
      "PermissionRegistry: Call not allowed"
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout);

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  it("Global ETH transfer value not allowed value by permission registry", async function () {
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      constants.ZERO_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      false
    );

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      actionMock.address,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      masterWalletScheme.address,
      constants.NULL_SIGNATURE,
      100,
      true
    );

    const callData = helpers.testCallFrom(masterWalletScheme.address);

    const tx = await masterWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [101],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await expectRevert(
      org.votingMachine.vote(
        proposalId,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      ),
      "PermissionRegistry: Value limit reached"
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout + 1);

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  // eslint-disable-next-line max-len
  it("MasterWalletScheme - positive decision - proposal executed - not allowed value by permission registry in multiple calls", async function () {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: masterWalletScheme.address,
      value: constants.TEST_VALUE,
    });

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      constants.ZERO_ADDRESS,
      constants.NULL_SIGNATURE,
      52,
      true
    );

    const callData = helpers.testCallFrom(masterWalletScheme.address);

    const tx = await masterWalletScheme.proposeCalls(
      [actionMock.address, actionMock.address],
      [callData, callData],
      [50, 3],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await expectRevert(
      org.votingMachine.vote(
        proposalId,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      ),
      "PermissionRegistry: Value limit reached"
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout + 1);

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  // eslint-disable-next-line max-len
  it("MasterWalletScheme - positive decision - proposal executed - allowed by permission registry from scheme", async () => {
    const callData = helpers.testCallFrom(masterWalletScheme.address);

    assert.notEqual(
      (
        await permissionRegistry.getETHPermission(
          masterWalletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      "0"
    );

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      constants.ZERO_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      false
    );

    const setPermissionData = new web3.eth.Contract(
      PermissionRegistry.abi
    ).methods
      .setETHPermission(
        masterWalletScheme.address,
        actionMock.address,
        callData.substring(0, 10),
        666,
        true
      )
      .encodeABI();

    await time.increase(1);

    // Proposal to allow calling actionMock
    const tx = await masterWalletScheme.proposeCalls(
      [permissionRegistry.address],
      [setPermissionData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const setPermissionTime = Number(await time.latest());

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          masterWalletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime,
      setPermissionTime.toString()
    );

    await time.increase(1);

    const tx2 = await masterWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
    await org.votingMachine.vote(
      proposalId2,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const organizationProposal = await masterWalletScheme.getProposal(
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

  it.skip("MasterWalletScheme - positive decision - proposal executed with multiple calls and value", async function () {
    var wallet = await DAOAvatar.new();
    await wallet.initialize(masterWalletScheme.address);

    await web3.eth.sendTransaction({
      from: accounts[0],
      to: masterWalletScheme.address,
      value: constants.TEST_VALUE,
    });

    const payCallData = await new web3.eth.Contract(wallet.abi).methods
      .pay(accounts[1])
      .encodeABI();

    permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      wallet.address,
      constants.NULL_SIGNATURE,
      constants.TEST_VALUE,
      true
    );

    permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      wallet.address,
      payCallData.substring(0, 10),
      constants.TEST_VALUE,
      true
    );

    await time.increase(30);

    const tx = await masterWalletScheme.proposeCalls(
      [wallet.address, wallet.address],
      ["0x0", payCallData],
      [constants.TEST_VALUE, 0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(
      await web3.eth.getBalance(masterWalletScheme.address),
      constants.TEST_VALUE
    );
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
        gas: 9000000,
      }
    );
    assert.equal(await web3.eth.getBalance(masterWalletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );

    const organizationProposal = await masterWalletScheme.getProposal(
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
    const callData = helpers.testCallFrom(masterWalletScheme.address);

    let tx = await masterWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await time.increase(executionTimeout);

    tx = await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  it.skip("MasterWalletScheme - positive decision - proposal executed without return value", async function () {
    const callData = helpers.testCallWithoutReturnValueFrom(
      masterWalletScheme.address
    );

    let tx = await masterWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );

    // ! There is no event called "ExecutionResults"
    const executionEvent = helpers.getEventFromTx(tx, "ExecutionResults");
    const returnValue = web3.eth.abi.decodeParameters(
      ["bool", "bytes"],
      executionEvent.args._callsDataResult[0]
    );
    assert.equal(returnValue["0"], true);
    assert.equal(returnValue["1"], null);

    const organizationProposal = await masterWalletScheme.getProposal(
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
    // Mint rep
    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4])
      .encodeABI();

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      org.controller.address,
      callDataMintRep.substring(0, 10),
      0,
      true
    );

    const txMintRep = await masterWalletScheme.proposeCalls(
      [org.controller.address],
      [callDataMintRep],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(
      txMintRep,
      "_proposalId"
    );

    await org.votingMachine.vote(
      proposalIdMintRep,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      constants.TEST_VALUE
    );

    // Burn rep

    const callDataBurnRep = await org.controller.contract.methods
      .burnReputation(constants.TEST_VALUE, accounts[4])
      .encodeABI();

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      org.controller.address,
      callDataBurnRep.substring(0, 10),
      0,
      true
    );

    const txBurnRep = await masterWalletScheme.proposeCalls(
      [org.controller.address],
      [callDataBurnRep],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdBurnRep = await helpers.getValueFromLogs(
      txBurnRep,
      "_proposalId"
    );

    await org.votingMachine.vote(
      proposalIdBurnRep,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const mintRepProposal = await masterWalletScheme.getProposalByIndex(0);
    assert.equal(
      mintRepProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
    assert.equal(mintRepProposal.callData[0], callDataMintRep);
    assert.equal(mintRepProposal.to[0], org.controller.address);
    assert.equal(mintRepProposal.value[0], 0);

    const burnRepProposal = await masterWalletScheme.getProposalByIndex(1);
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
    const initialRep = await org.reputation.balanceOf(accounts[4]).toString();

    const data0 = await org.controller.contract.methods
      .mintReputation(maxRepAmountToChange + 1, accounts[4])
      .encodeABI();
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      org.controller.address,
      data0.substring(0, 10),
      0,
      true
    );

    const data1 = await org.controller.contract.methods
      .mintReputation(maxRepAmountToChange, accounts[4])
      .encodeABI();
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      org.controller.address,
      data1.substring(0, 10),
      0,
      true
    );

    const failMintTx = await masterWalletScheme.proposeCalls(
      [org.controller.address],
      [data0],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRepToFail = await helpers.getValueFromLogs(
      failMintTx,
      "_proposalId"
    );

    await expectRevert(
      org.votingMachine.vote(
        proposalIdMintRepToFail,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        { from: accounts[2] }
      ),
      "Scheme__MaxRepPercentageChangePassed()"
    );

    assert.equal(
      await org.reputation.balanceOf(accounts[4]).toString(),
      initialRep.toString()
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalIdMintRepToFail)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );
  });

  it("MasterWalletScheme - proposal to burn more REP than the % allowed reverts", async function () {
    const totalSupplyWhenExecuting = await org.reputation.totalSupply();
    const maxRepAmountToChange = -(
      (totalSupplyWhenExecuting * 95) / 100 -
      totalSupplyWhenExecuting
    );
    const initialRep = await org.reputation.balanceOf(accounts[2]);

    const burnRepDataFail = await org.controller.contract.methods
      .burnReputation(maxRepAmountToChange + 1, accounts[2])
      .encodeABI();
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      org.controller.address,
      burnRepDataFail.substring(0, 10),
      0,
      true
    );

    const data1 = await org.controller.contract.methods
      .burnReputation(maxRepAmountToChange, accounts[2])
      .encodeABI();
    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      org.controller.address,
      data1.substring(0, 10),
      0,
      true
    );

    var tx = await masterWalletScheme.proposeCalls(
      [org.controller.address],
      [burnRepDataFail],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRepToFail = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );

    await expectRevert(
      org.votingMachine.vote(
        proposalIdMintRepToFail,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        { from: accounts[2] }
      ),
      "Scheme__MaxRepPercentageChangePassed()"
    );

    assert(
      (await org.reputation.balanceOf(accounts[2])).toNumber(),
      initialRep
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalIdMintRepToFail)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );
  });

  // eslint-disable-next-line max-len
  it("MasterWalletScheme - proposals adding/removing schemes - execute registerScheme & removeScheme fails", async function () {
    const callDataRegisterScheme = await org.controller.contract.methods
      .registerScheme(constants.SOME_ADDRESS, "0x0000000F", false, false, false)
      .encodeABI();
    const callDataRemoveScheme = await org.controller.contract.methods
      .unregisterScheme(quickWalletScheme.address)
      .encodeABI();
    var tx = await masterWalletScheme.proposeCalls(
      [org.controller.address],
      [callDataRegisterScheme],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdAddScheme = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );
    tx = await masterWalletScheme.proposeCalls(
      [org.controller.address],
      [callDataRemoveScheme],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdRemoveScheme = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );

    // Add Scheme
    await expectRevert(
      org.votingMachine.vote(
        proposalIdAddScheme,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        { from: accounts[2] }
      ),
      "PermissionRegistry: Call not allowed"
    );

    const addedScheme = await org.controller.schemes(constants.SOME_ADDRESS);

    assert.equal(
      addedScheme.paramsHash,
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );

    // Remove Scheme
    await expectRevert(
      org.votingMachine.vote(
        proposalIdRemoveScheme,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        { from: accounts[2] }
      ),
      "PermissionRegistry: Call not allowed"
    );
  });

  it("MasterWalletScheme - execute should fail if not passed/executed from votingMachine", async function () {
    const callData = helpers.testCallFrom(masterWalletScheme.address);
    var tx = await masterWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await org.votingMachine.execute(proposalId);
    const organizationProposal = await masterWalletScheme.getProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );
  });

  it.skip("MasterWalletScheme - positive decision - proposal executed with transfer, pay and mint rep", async function () {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: masterWalletScheme.address,
      value: constants.TEST_VALUE,
    });
    await wallet.transferOwnership(masterWalletScheme.address);

    const payCallData = await new web3.eth.Contract(wallet.abi).methods
      .pay(accounts[1])
      .encodeABI();

    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4], org.avatar.address)
      .encodeABI();

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      wallet.address,
      payCallData.substring(0, 10),
      constants.TEST_VALUE,
      true
    );

    await time.increase(100);

    const tx = await masterWalletScheme.proposeCalls(
      [wallet.address, wallet.address, org.controller.address],
      ["0x0", payCallData, callDataMintRep],
      [constants.TEST_VALUE, 0, 0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(
      await web3.eth.getBalance(masterWalletScheme.address),
      constants.TEST_VALUE
    );
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );
    assert.equal(await web3.eth.getBalance(masterWalletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );
    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      constants.TEST_VALUE
    );

    const organizationProposal = await masterWalletScheme.getProposal(
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
      "Scheme__MaxSecondsForExecutionTooLow()"
    );
    await expectRevert(
      unitializedWalletScheme.initialize(
        constants.ZERO_ADDRESS,
        accounts[0],
        org.controller.address,
        permissionRegistry.address,
        "Master Wallet",
        executionTimeout,
        5
      ),
      "Scheme__AvatarAddressCannotBeZero()"
    );
  });

  it("MasterWalletScheme - cannot initialize twice", async function () {
    await expectRevert(
      masterWalletScheme.initialize(
        org.avatar.address,
        accounts[0],
        org.controller.address,
        permissionRegistry.address,
        "Master Wallet",
        executionTimeout,
        5
      ),
      "Scheme__CannotInitTwice()"
    );
  });

  it("MasterWalletScheme can receive value in contractt", async function () {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: masterWalletScheme.address,
      value: constants.TEST_VALUE,
    });
  });

  it("MasterWalletScheme - get scheme type", async function () {
    const schemeType = await masterWalletScheme.getSchemeType();
    assert.equal(schemeType, "WalletScheme_v1");
  });

  it("QuickWalletScheme can receive value in contract", async function () {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: quickWalletScheme.address,
      value: constants.TEST_VALUE,
    });
  });

  it("QuickWalletScheme - proposal with data - negative decision - proposal rejected", async function () {
    const callData = helpers.testCallFrom(quickWalletScheme.address);

    let tx = await quickWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await org.votingMachine.vote(
      proposalId,
      constants.NO_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );
    const stateChangeEvent = helpers.getEventFromTx(tx, "ProposalStateChange");
    assert.equal(stateChangeEvent.args._state, 2);

    const organizationProposal = await quickWalletScheme.getProposal(
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
    const callData = helpers.testCallFrom(quickWalletScheme.address);

    const tx = await quickWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const organizationProposal = await quickWalletScheme.getProposal(
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
  it.skip("QuickWalletScheme - proposal with data - positive decision - proposal executed with multiple calls and value", async function () {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: quickWalletScheme.address,
      value: constants.TEST_VALUE,
    });
    await wallet.transferOwnership(quickWalletScheme.address);

    const payCallData = await new web3.eth.Contract(wallet.abi).methods
      .pay(accounts[1])
      .encodeABI();

    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      wallet.address,
      payCallData.substring(0, 10),
      constants.TEST_VALUE,
      true
    );
    await time.increase(100);

    const tx = await quickWalletScheme.proposeCalls(
      [wallet.address, wallet.address],
      ["0x0", payCallData],
      [constants.TEST_VALUE],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    true;
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(
      await web3.eth.getBalance(quickWalletScheme.address),
      constants.TEST_VALUE
    );
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );
    assert.equal(await web3.eth.getBalance(quickWalletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );

    const organizationProposal = await quickWalletScheme.getProposal(
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
    const callData = helpers.testCallFrom(constants.ZERO_ADDRESS);

    let tx = await quickWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await expectRevert(
      org.votingMachine.vote(
        proposalId,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      ),
      " "
    );

    assert.equal(
      (await quickWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout);

    tx = await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (await quickWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  // eslint-disable-next-line max-len
  it.skip("QuickWalletScheme - proposal with data - positive decision - proposal executed without return value", async function () {
    const callData = helpers.testCallWithoutReturnValueFrom(
      quickWalletScheme.address
    );

    let tx = await quickWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0, 0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );
    const executionEvent = helpers.getEventFromTx(tx, "ExecutionResults");

    const returnValues = executionEvent.args._callsDataResult[0];
    assert.equal(returnValues, "0x");

    const organizationProposal = await quickWalletScheme.getProposal(
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
      .mintReputation(constants.TEST_VALUE, accounts[4])
      .encodeABI();
    const callDataBurnRep = await org.controller.contract.methods
      .burnReputation(constants.TEST_VALUE, accounts[4])
      .encodeABI();

    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      org.controller.address,
      callDataMintRep.substring(0, 10),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      org.controller.address,
      callDataBurnRep.substring(0, 10),
      0,
      true
    );

    var tx = await quickWalletScheme.proposeCalls(
      [org.controller.address],
      [callDataMintRep],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "_proposalId");
    tx = await quickWalletScheme.proposeCalls(
      [org.controller.address],
      [callDataBurnRep],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdBurnRep = await helpers.getValueFromLogs(tx, "_proposalId");

    // Mint Rep
    await org.votingMachine.vote(
      proposalIdMintRep,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      constants.TEST_VALUE
    );

    // Burn Rep
    await org.votingMachine.vote(
      proposalIdBurnRep,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);
  });

  // eslint-disable-next-line max-len
  it("QuickWalletScheme - proposals adding/removing schemes - should fail on registerScheme & removeScheme", async function () {
    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature(
        "registerScheme(address,bytes32,bool,bool,bool)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature("unregisterScheme(address)"),
      0,
      true
    );

    const callDataRegisterScheme = await org.controller.contract.methods
      .registerScheme(constants.SOME_ADDRESS, "0x0000000F", false, false, false)
      .encodeABI();
    const callDataRemoveScheme = await org.controller.contract.methods
      .unregisterScheme(masterWalletScheme.address)
      .encodeABI();

    var tx = await quickWalletScheme.proposeCalls(
      [org.controller.address],
      [callDataRegisterScheme],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdAddScheme = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );
    tx = await quickWalletScheme.proposeCalls(
      [org.controller.address],
      [callDataRemoveScheme],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdRemoveScheme = await helpers.getValueFromLogs(
      tx,
      "_proposalId"
    );

    // Add Scheme
    await expectRevert.unspecified(
      org.votingMachine.vote(
        proposalIdAddScheme,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        { from: accounts[2] }
      )
    );
    assert.equal(
      (await quickWalletScheme.getProposal(proposalIdAddScheme)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    const addedScheme = await org.controller.schemes(constants.SOME_ADDRESS);
    assert.equal(
      addedScheme.paramsHash,
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );

    // Remove Scheme
    await expectRevert.unspecified(
      org.votingMachine.vote(
        proposalIdRemoveScheme,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        { from: accounts[2] }
      )
    );
    assert.equal(
      (await quickWalletScheme.getProposal(proposalIdRemoveScheme)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );

    await time.increase(executionTimeout);
    await org.votingMachine.vote(
      proposalIdAddScheme,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(
      (await quickWalletScheme.getProposal(proposalIdAddScheme)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );

    await org.votingMachine.vote(
      proposalIdRemoveScheme,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      { from: accounts[2] }
    );
    assert.equal(
      (await quickWalletScheme.getProposal(proposalIdRemoveScheme)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  // eslint-disable-next-line max-len
  it("QuickWalletScheme - positive decision - proposal executed - allowed by permission registry from scheme", async function () {
    const callData = helpers.testCallFrom(quickWalletScheme.address);

    assert.notEqual(
      (
        await permissionRegistry.getETHPermission(
          quickWalletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      0
    );

    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      actionMock.address,
      callData.substring(0, 10),
      0,
      false
    );

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          quickWalletScheme.address,
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
        quickWalletScheme.address,
        actionMock.address,
        callData.substring(0, 10),
        constants.MAX_UINT_256,
        true
      )
      .encodeABI();

    await time.increase(1);

    // Proposal to allow calling actionMock
    const tx = await quickWalletScheme.proposeCalls(
      [permissionRegistry.address],
      [setPermissionData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );
    const setPermissionTime = Number(await time.latest());

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          quickWalletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      setPermissionTime
    );

    await time.increase(1);

    const tx2 = await quickWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
    await org.votingMachine.vote(
      proposalId2,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const organizationProposal = await quickWalletScheme.getProposal(
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

  it.skip("QuickWalletScheme - positive decision - proposal executed with transfer, pay and mint rep", async function () {
    var wallet = await WalletScheme.new();
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: quickWalletScheme.address,
      value: 100000000,
    });
    // await wallet.transferOwnership(quickWalletScheme.address);

    const payCallData = await new web3.eth.Contract(wallet.abi).methods
      .pay(accounts[1])
      .encodeABI();
    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4], org.avatar.address)
      .encodeABI();

    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      wallet.address,
      payCallData.substring(0, 10),
      constants.TEST_VALUE,
      true
    );

    let tx = await quickWalletScheme.proposeCalls(
      [wallet.address, wallet.address, org.controller.address],
      ["0x0", payCallData, callDataMintRep],
      [constants.TEST_VALUE, 0, 0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(
      await web3.eth.getBalance(quickWalletScheme.address),
      100000000
    );
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    tx = await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
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

    assert.equal(await web3.eth.getBalance(masterWalletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );
    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      constants.TEST_VALUE
    );

    const organizationProposal = await quickWalletScheme.getProposal(
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
      await testToken.transfer(masterWalletScheme.address, 200, {
        from: accounts[1],
      });

      await permissionRegistry.setETHPermission(
        masterWalletScheme.address,
        testToken.address,
        web3.eth.abi.encodeFunctionSignature("transfer(address,uint256)"),
        0,
        true
      );

      const addERC20LimitData = new web3.eth.Contract(
        PermissionRegistry.abi
      ).methods
        .addERC20Limit(masterWalletScheme.address, testToken.address, 100, 0)
        .encodeABI();

      await time.increase(1);

      // Proposal to allow calling actionMock
      const tx = await masterWalletScheme.proposeCalls(
        [permissionRegistry.address],
        [addERC20LimitData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      await org.votingMachine.vote(
        proposalId,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      );

      const erc20TransferPermission = await permissionRegistry.getERC20Limit(
        masterWalletScheme.address,
        testToken.address
      );

      assert.equal(erc20TransferPermission.toString(), "100");

      await time.increase(1);

      const transferData = await new web3.eth.Contract(testToken.abi).methods
        .transfer(actionMock.address, "50")
        .encodeABI();
      assert.equal(
        await testToken.balanceOf(masterWalletScheme.address),
        "200"
      );

      const tx2 = await masterWalletScheme.proposeCalls(
        [testToken.address],
        [transferData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");
      await org.votingMachine.vote(
        proposalId2,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
          gas: constants.GAS_LIMIT,
        }
      );
      assert.equal(
        await testToken.balanceOf(masterWalletScheme.address),
        "150"
      );

      const organizationProposal = await masterWalletScheme.getProposal(
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
      await testToken.transfer(masterWalletScheme.address, 200, {
        from: accounts[1],
      });

      await permissionRegistry.setETHPermission(
        masterWalletScheme.address,
        testToken.address,
        web3.eth.abi.encodeFunctionSignature("transfer(address,uint256)"),
        0,
        true
      );
      await permissionRegistry.addERC20Limit(
        masterWalletScheme.address,
        testToken.address,
        100,
        0
      );

      assert.equal(
        await permissionRegistry.getERC20Limit(
          masterWalletScheme.address,
          testToken.address
        ),
        100
      );

      const transferData = await new web3.eth.Contract(testToken.abi).methods
        .transfer(actionMock.address, "101")
        .encodeABI();

      const tx = await masterWalletScheme.proposeCalls(
        [testToken.address],
        [transferData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      await expectRevert(
        org.votingMachine.vote(
          proposalId,
          constants.YES_OPTION,
          0,
          constants.ZERO_ADDRESS,
          {
            from: accounts[2],
          }
        ),
        "PermissionRegistry: Value limit reached"
      );

      assert.equal(
        (await masterWalletScheme.getProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
      );

      await time.increase(executionTimeout);
      await org.votingMachine.vote(
        proposalId,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      );

      assert.equal(
        (await masterWalletScheme.getProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
      );
    });

    // eslint-disable-next-line max-len
    it("QuickWalletScheme - positive decision - proposal executed - not allowed ERC20 value by permission registry in multiple calls", async function () {
      await testToken.transfer(quickWalletScheme.address, 200, {
        from: accounts[1],
      });

      await permissionRegistry.setETHPermission(
        quickWalletScheme.address,
        testToken.address,
        web3.eth.abi.encodeFunctionSignature("transfer(address,uint256)"),
        0,
        true
      );
      await permissionRegistry.addERC20Limit(
        quickWalletScheme.address,
        testToken.address,
        100,
        0
      );

      assert.equal(
        await permissionRegistry.getERC20Limit(
          quickWalletScheme.address,
          testToken.address
        ),
        100
      );

      const transferData = await new web3.eth.Contract(testToken.abi).methods
        .transfer(actionMock.address, "101")
        .encodeABI();

      const tx = await quickWalletScheme.proposeCalls(
        [testToken.address],
        [transferData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      await expectRevert(
        org.votingMachine.vote(
          proposalId,
          constants.YES_OPTION,
          0,
          constants.ZERO_ADDRESS,
          {
            from: accounts[2],
          }
        ),
        "PermissionRegistry: Value limit reached"
      );

      assert.equal(
        (await quickWalletScheme.getProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
      );

      await time.increase(executionTimeout);

      await org.votingMachine.vote(
        proposalId,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      );

      assert.equal(
        (await quickWalletScheme.getProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
      );
    });

    // eslint-disable-next-line max-len
    it("QuickWalletScheme - positive decision - proposal executed - ERC20 transfer allowed by permission registry from scheme", async function () {
      await testToken.transfer(quickWalletScheme.address, 200, {
        from: accounts[1],
      });

      await permissionRegistry.setETHPermission(
        quickWalletScheme.address,
        testToken.address,
        web3.eth.abi.encodeFunctionSignature("transfer(address,uint256)"),
        0,
        true
      );

      const addERC20LimitData = new web3.eth.Contract(
        PermissionRegistry.abi
      ).methods
        .addERC20Limit(quickWalletScheme.address, testToken.address, 100, 0)
        .encodeABI();

      // Proposal to allow calling actionMock
      const tx = await quickWalletScheme.proposeCalls(
        [permissionRegistry.address],
        [addERC20LimitData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      await org.votingMachine.vote(
        proposalId,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      );

      assert.equal(
        await permissionRegistry.getERC20Limit(
          quickWalletScheme.address,
          testToken.address
        ),
        100
      );
      await time.increase(1);

      const transferData = await new web3.eth.Contract(testToken.abi).methods
        .transfer(actionMock.address, "50")
        .encodeABI();
      assert.equal(await testToken.balanceOf(quickWalletScheme.address), "200");

      const tx2 = await quickWalletScheme.proposeCalls(
        [testToken.address],
        [transferData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");

      await org.votingMachine.vote(
        proposalId2,
        constants.YES_OPTION,
        0,
        constants.ZERO_ADDRESS,
        {
          from: accounts[2],
        }
      );
      assert.equal(await testToken.balanceOf(quickWalletScheme.address), "150");

      const organizationProposal = await quickWalletScheme.getProposal(
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
