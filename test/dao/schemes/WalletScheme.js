import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert } from "chai";
import * as helpers from "../../helpers";
const {
  time,
  expectRevert,
  expectEvent,
} = require("@openzeppelin/test-helpers");

const Create2Deployer = artifacts.require("./Create2Deployer.sol");
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

    const create2Deployer = await Create2Deployer.new();

    registrarScheme = await helpers.deployContractWithCreate2(
      create2Deployer,
      WalletScheme,
      web3.utils.keccak256("registrarScheme1"),
      [
        org.avatar.address,
        org.votingMachine.address,
        org.controller.address,
        permissionRegistry.address,
        "Wallet Scheme Registrar",
        0,
      ]
    );

    masterWalletScheme = await helpers.deployContractWithCreate2(
      create2Deployer,
      WalletScheme,
      web3.utils.keccak256("masterWalletScheme1"),
      [
        org.avatar.address,
        org.votingMachine.address,
        org.controller.address,
        permissionRegistry.address,
        "Master Wallet",
        5,
      ]
    );

    quickWalletScheme = await helpers.deployContractWithCreate2(
      create2Deployer,
      WalletScheme,
      web3.utils.keccak256("quickWalletScheme1"),
      [
        org.avatar.address,
        org.votingMachine.address,
        org.controller.address,
        permissionRegistry.address,
        "Quick Wallet",
        1,
      ]
    );

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      constants.ZERO_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      constants.ZERO_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.TEST_VALUE,
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
      masterWalletScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature("mintReputation(uint256,address)"),
      0,
      true
    );

    await permissionRegistry.setETHPermission(
      masterWalletScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature("burnReputation(uint256,address)"),
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
      false
    );
  });

  it("Registrar Scheme", async function () {
    await web3.eth.sendTransaction({
      to: masterWalletScheme.address,
      value: web3.utils.toWei("1"),
      from: accounts[0],
    });

    await permissionRegistry.transferOwnership(org.avatar.address);

    const newWalletScheme = await WalletScheme.new();
    await newWalletScheme.initialize(
      org.avatar.address,
      org.votingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "New Wallet Scheme",
      0
    );

    await org.votingMachine.setParameters([
      6000, 86400, 3600, 1800, 1050, 60, 10, 100,
    ]);
    const newParamsHash = await org.votingMachine.getParametersHash([
      6000, 86400, 3600, 1800, 1050, 60, 10, 100,
    ]);

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
      "proposalId"
    );
    await org.votingMachine.vote(proposalId1, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    const organizationProposal1 = await registrarScheme.getProposal(
      proposalId1
    );
    assert.equal(
      organizationProposal1.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    tx = await org.votingMachine.vote(proposalId, constants.NO_OPTION, 0, {
      from: accounts[2],
    });
    const stateChangeEvent = helpers.getEventFromTx(tx, "ProposalStateChange");

    assert.equal(stateChangeEvent.args.state, 2);

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
    const callData = helpers.testCallFrom(masterWalletScheme.address);

    const tx = await masterWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    const organizationProposal = await masterWalletScheme.getProposal(
      proposalId
    );

    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("WalletScheme - check that it cannot make avatar calls", async function () {
    const newWallet = await WalletScheme.new();
    await newWallet.initialize(
      org.avatar.address,
      org.votingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "New Wallet",
      5
    );

    await org.controller.registerScheme(
      newWallet.address,
      defaultParamsHash,
      false,
      true,
      true
    );

    const callData = helpers.testCallFrom(newWallet.address);

    const tx = await newWallet.proposeCalls(
      [newWallet.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    // Check inside the raw logs that the ProposalExecuteResult event logs the signature of the error to be throw
    await assert(
      (
        await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
          from: accounts[2],
        })
      ).receipt.rawLogs[2].data.includes(
        web3.eth.abi
          .encodeFunctionSignature("WalletScheme__CannotMakeAvatarCalls()")
          .substring(2)
      )
    );
  });

  it("MasterWalletScheme - try execute proposal within other proposal and fail", async function () {
    const callData = helpers.testCallFrom(masterWalletScheme.address);

    const proposalId1 = helpers.getValueFromLogs(
      await masterWalletScheme.proposeCalls(
        [actionMock.address],
        [callData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "proposalId"
    );

    // Use signed votes to try to execute a proposal inside a proposal execution
    const signerNonce = await org.votingMachine.signerNonce(accounts[3]);
    const voteHash = await org.votingMachine.hashAction(
      proposalId1,
      accounts[2],
      constants.YES_OPTION,
      0,
      signerNonce,
      1
    );
    const voteSignature = await web3.eth.sign(voteHash, accounts[2]);

    const executeSignedVoteData = await org.votingMachine.contract.methods
      .executeSignedVote(
        proposalId1,
        accounts[2],
        constants.YES_OPTION,
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
      "proposalId"
    );

    await org.votingMachine.vote(proposalId2, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId1)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId1)).state,
      constants.VOTING_MACHINE_PROPOSAL_STATES.Queued
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId1)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.None
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId2)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId2)).state,
      constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInQueue
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId2)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
    );

    // If we execute a proposal but we dont check the returned value it will still wont execute.
    // The proposal trying to execute propoposalId1 will success but proposal1 wont be exeucted sucessfuly, it will
    // still be submitted state.
    const proposalId3 = await helpers.getValueFromLogs(
      await masterWalletScheme.proposeCalls(
        [actionMock.address],
        [actionMockExecuteCallData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "proposalId"
    );
    await org.votingMachine.vote(proposalId3, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId1)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId1)).state,
      constants.VOTING_MACHINE_PROPOSAL_STATES.Queued
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId1)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.None
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId3)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId3)).state,
      constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInQueue
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId3)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.QueueBarCrossed
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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    await expectEvent(
      await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
      }),
      "ProposalExecuteResult",
      { 0: "PermissionRegistry: Call not allowed" }
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );

    assert.equal(
      (await org.votingMachine.proposals(proposalId)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    await expectEvent(
      await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
      }),
      "ProposalExecuteResult",
      { 0: "PermissionRegistry: Value limit reached" }
    );

    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
    );
  });

  it("Global ETH transfer call not allowed value by permission registry - zero address, no value", async function () {
    const callData = helpers.testCallFrom(masterWalletScheme.address);

    const tx = await masterWalletScheme.proposeCalls(
      [constants.ZERO_ADDRESS],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    await assert(
      (
        await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
          from: accounts[2],
        })
      ).receipt.rawLogs[2].data.includes(
        web3.eth.abi
          .encodeParameter("string", "PermissionRegistry: Call not allowed")
          .substring(2)
      )
    );
  });

  // eslint-disable-next-line max-len
  it("MasterWalletScheme - positive decision - proposal executed - not allowed value by permission registry in multiple calls", async function () {
    await web3.eth.sendTransaction({
      to: masterWalletScheme.address,
      value: constants.TEST_VALUE,
      from: accounts[0],
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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    await expectEvent(
      await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
      }),
      "ProposalExecuteResult",
      { 0: "PermissionRegistry: Value limit reached" }
    );
    assert.equal(
      (await masterWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

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
    const proposalId2 = await helpers.getValueFromLogs(tx2, "proposalId");
    await org.votingMachine.vote(proposalId2, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    const organizationProposal = await masterWalletScheme.getProposal(
      proposalId2
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("MasterWalletScheme - positive decision - proposal executed with multiple calls and value", async function () {
    const testCallData = await new web3.eth.Contract(ActionMock.abi).methods
      .testWithNoargs()
      .encodeABI();

    const tx = await masterWalletScheme.proposeCalls(
      [accounts[1], actionMock.address],
      ["0x0", testCallData],
      [constants.TEST_VALUE, 0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    assert.equal(await web3.eth.getBalance(actionMock.address), 0);
    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);

    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
      gas: 9000000,
    });
    assert.equal(await web3.eth.getBalance(masterWalletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(actionMock.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );

    const organizationProposal = await masterWalletScheme.getProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], accounts[1]);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.callData[1], testCallData);
    assert.equal(organizationProposal.to[1], actionMock.address);
    assert.equal(organizationProposal.value[1], 0);
  });

  it("MasterWalletScheme - proposal with REP - execute mintReputation & burnReputation", async function () {
    // Mint rep
    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4])
      .encodeABI();

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
      "proposalId"
    );

    await org.votingMachine.vote(proposalIdMintRep, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
    assert.equal(
      await org.reputation.balanceOf(accounts[4]),
      constants.TEST_VALUE
    );

    // Burn rep

    const callDataBurnRep = await org.controller.contract.methods
      .burnReputation(constants.TEST_VALUE, accounts[4])
      .encodeABI();

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
      "proposalId"
    );

    await org.votingMachine.vote(proposalIdBurnRep, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const mintRepProposal = await masterWalletScheme.getProposalByIndex(0);
    assert.equal(
      mintRepProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(mintRepProposal.callData[0], callDataMintRep);
    assert.equal(mintRepProposal.to[0], org.controller.address);
    assert.equal(mintRepProposal.value[0], 0);

    const burnRepProposal = await masterWalletScheme.getProposalByIndex(1);
    assert.equal(
      burnRepProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
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
      "proposalId"
    );

    await assert(
      (
        await org.votingMachine.vote(
          proposalIdMintRepToFail,
          constants.YES_OPTION,
          0,
          {
            from: accounts[2],
          }
        )
      ).receipt.rawLogs[2].data.includes(
        web3.eth.abi
          .encodeFunctionSignature("Scheme__MaxRepPercentageChangePassed()")
          .substring(2)
      )
    );
    assert.equal(
      (await masterWalletScheme.getProposal(proposalIdMintRepToFail)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalIdMintRepToFail))
        .executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
    );

    assert.equal(
      await org.reputation.balanceOf(accounts[4]).toString(),
      initialRep.toString()
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
    const proposalIdBurnRepToFail = await helpers.getValueFromLogs(
      tx,
      "proposalId"
    );

    await assert(
      (
        await org.votingMachine.vote(
          proposalIdBurnRepToFail,
          constants.YES_OPTION,
          0,
          {
            from: accounts[2],
          }
        )
      ).receipt.rawLogs[2].data.includes(
        web3.eth.abi
          .encodeFunctionSignature("Scheme__MaxRepPercentageChangePassed()")
          .substring(2)
      )
    );
    assert.equal(
      (await masterWalletScheme.getProposal(proposalIdBurnRepToFail)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalIdBurnRepToFail))
        .executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
    );

    assert(
      (await org.reputation.balanceOf(accounts[2])).toNumber(),
      initialRep
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
      "proposalId"
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
      "proposalId"
    );

    // Add Scheme
    await expectEvent(
      await org.votingMachine.vote(
        proposalIdAddScheme,
        constants.YES_OPTION,
        0,
        {
          from: accounts[2],
        }
      ),
      "ProposalExecuteResult",
      { 0: "PermissionRegistry: Call not allowed" }
    );

    const addedScheme = await org.controller.schemes(constants.SOME_ADDRESS);

    assert.equal(
      addedScheme.paramsHash,
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );

    // Remove Scheme
    await expectEvent(
      await org.votingMachine.vote(
        proposalIdRemoveScheme,
        constants.YES_OPTION,
        0,
        {
          from: accounts[2],
        }
      ),
      "ProposalExecuteResult",
      { 0: "PermissionRegistry: Call not allowed" }
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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    await org.votingMachine.execute(proposalId);
    const organizationProposal = await masterWalletScheme.getProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
    );
  });

  it("MasterWalletScheme - positive decision - proposal executed with transfer, pay and mint rep", async function () {
    await web3.eth.sendTransaction({
      to: masterWalletScheme.address,
      value: constants.TEST_VALUE,
      from: accounts[0],
    });

    const testCallData = helpers.testCallFrom(masterWalletScheme.address);
    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4])
      .encodeABI();

    const tx = await masterWalletScheme.proposeCalls(
      [accounts[1], actionMock.address, org.controller.address],
      ["0x0", testCallData, callDataMintRep],
      [constants.TEST_VALUE, 0, 0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    assert.equal(await web3.eth.getBalance(actionMock.address), 0);
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
    assert.equal(await web3.eth.getBalance(masterWalletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(actionMock.address), 0);
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
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(organizationProposal.descriptionHash, constants.SOME_HASH);
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], accounts[1]);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.callData[1], testCallData);
    assert.equal(organizationProposal.to[1], actionMock.address);
    assert.equal(organizationProposal.value[1], 0);
    assert.equal(organizationProposal.callData[2], callDataMintRep);
    assert.equal(organizationProposal.to[2], org.controller.address);
    assert.equal(organizationProposal.value[2], 0);
  });

  it("MasterWalletScheme - cant initialize if controller address is zero", async function () {
    const unitializedWalletScheme = await WalletScheme.new();

    await expectRevert(
      unitializedWalletScheme.initialize(
        org.avatar.address,
        accounts[0],
        constants.ZERO_ADDRESS,
        permissionRegistry.address,
        "Master Wallet",
        5
      ),
      "Scheme__ControllerAddressCannotBeZero()"
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
        5
      ),
      "Initializable: contract is already initialized"
    );
  });

  it("MasterWalletScheme can receive value in contract", async function () {
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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    tx = await org.votingMachine.vote(proposalId, constants.NO_OPTION, 0, {
      from: accounts[2],
    });
    const stateChangeEvent = helpers.getEventFromTx(tx, "ProposalStateChange");
    assert.equal(stateChangeEvent.args.state, 2);

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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    const organizationProposal = await quickWalletScheme.getProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  // eslint-disable-next-line max-len
  it("QuickWalletScheme - proposal with data - positive decision - proposal executed with multiple calls and value", async function () {
    await web3.eth.sendTransaction({
      to: quickWalletScheme.address,
      value: constants.TEST_VALUE,
      from: accounts[0],
    });
    const testCallData = helpers.testCallFrom(quickWalletScheme.address);
    const tx = await quickWalletScheme.proposeCalls(
      [accounts[1], actionMock.address],
      ["0x0", testCallData],
      [constants.TEST_VALUE, 0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    assert.equal(await web3.eth.getBalance(actionMock.address), 0);
    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
    assert.equal(await web3.eth.getBalance(quickWalletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(actionMock.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );

    const organizationProposal = await quickWalletScheme.getProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], accounts[1]);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.to[1], actionMock.address);
    assert.equal(organizationProposal.value[1], 0);
    assert.equal(organizationProposal.callData[1], testCallData);
  });

  it("QuickWalletScheme - proposal with data - positive decision - proposal execution fail", async () => {
    const callData = helpers.testCallFrom(constants.ZERO_ADDRESS);

    let tx = await quickWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    assert.equal(
      (await quickWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId)).state,
      constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInQueue
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalId)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
    );
  });

  // eslint-disable-next-line max-len
  it("QuickWalletScheme - proposal with data - positive decision - proposal executed without return value", async function () {
    const callData = helpers.testCallWithoutReturnValueFrom(
      quickWalletScheme.address
    );

    let tx = await quickWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    tx = await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
    const organizationProposal = await quickWalletScheme.getProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("QuickWalletScheme - proposal with REP - execute mintReputation & burnReputation should fail", async function () {
    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(constants.TEST_VALUE, accounts[4])
      .encodeABI();
    const callDataBurnRep = await org.controller.contract.methods
      .burnReputation(constants.TEST_VALUE, accounts[1])
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
    const proposalIdMintRep = await helpers.getValueFromLogs(tx, "proposalId");
    tx = await quickWalletScheme.proposeCalls(
      [org.controller.address],
      [callDataBurnRep],
      [0],
      2,
      constants.TEST_TITLE,
      constants.NULL_HASH
    );
    const proposalIdBurnRep = await helpers.getValueFromLogs(tx, "proposalId");

    // Mint Rep
    await org.votingMachine.vote(proposalIdMintRep, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
    assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

    // Burn Rep
    await org.votingMachine.vote(proposalIdBurnRep, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
    assert.equal(await org.reputation.balanceOf(accounts[1]), 10000);
  });

  // eslint-disable-next-line max-len
  it("QuickWalletScheme - proposals adding/removing schemes - should fail on registerScheme & removeScheme", async function () {
    // very weird but here the expect event didnt worked and I had to go to teh depths fo teh rawLogs and check that the
    // error message in the ProposalExecuteResult event include the encoded error message

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
      "proposalId"
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
      "proposalId"
    );

    const votingTx1 = await org.votingMachine.vote(
      proposalIdAddScheme,
      constants.YES_OPTION,
      0,
      {
        from: accounts[2],
      }
    );

    assert(
      helpers.customErrorMessageExistInRawLogs(
        "DAOController__SenderCannotManageSchemes()",
        votingTx1.receipt
      )
    );

    assert.equal(
      (await quickWalletScheme.getProposal(proposalIdAddScheme)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalIdAddScheme)).state,
      constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInQueue
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalIdAddScheme)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
    );

    const addedScheme = await org.controller.schemes(constants.SOME_ADDRESS);
    assert.equal(
      addedScheme.paramsHash,
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );

    const votingTx2 = await org.votingMachine.vote(
      proposalIdRemoveScheme,
      constants.YES_OPTION,
      0,
      {
        from: accounts[2],
      }
    );

    assert(
      helpers.customErrorMessageExistInRawLogs(
        "DAOController__SenderCannotManageSchemes()",
        votingTx2.receipt
      )
    );

    assert.equal(
      (await quickWalletScheme.getProposal(proposalIdRemoveScheme)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalIdRemoveScheme)).state,
      constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInQueue
    );
    assert.equal(
      (await org.votingMachine.proposals(proposalIdRemoveScheme))
        .executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
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
    const proposalId2 = await helpers.getValueFromLogs(tx2, "proposalId");
    await org.votingMachine.vote(proposalId2, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    const organizationProposal = await quickWalletScheme.getProposal(
      proposalId2
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(organizationProposal.callData[0], callData);
    assert.equal(organizationProposal.to[0], actionMock.address);
    assert.equal(organizationProposal.value[0], 0);
  });

  it("QuickWalletScheme - positive decision - proposal executed with transfer and pay", async function () {
    await web3.eth.sendTransaction({
      to: quickWalletScheme.address,
      value: constants.TEST_VALUE,
      from: accounts[0],
    });

    const testCallData = helpers.testCallFrom(quickWalletScheme.address);

    let tx = await quickWalletScheme.proposeCalls(
      [accounts[1], actionMock.address],
      ["0x0", testCallData],
      [constants.TEST_VALUE, 0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    assert.equal(
      await web3.eth.getBalance(quickWalletScheme.address),
      constants.TEST_VALUE
    );
    assert.equal(await web3.eth.getBalance(actionMock.address), 0);

    const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
    tx = await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    assert.equal(await web3.eth.getBalance(masterWalletScheme.address), 0);
    assert.equal(await web3.eth.getBalance(actionMock.address), 0);
    assert.equal(
      await web3.eth.getBalance(accounts[1]),
      Number(balanceBeforePay) + constants.TEST_VALUE
    );
    const organizationProposal = await quickWalletScheme.getProposal(
      proposalId
    );
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
    assert.equal(organizationProposal.callData[0], "0x00");
    assert.equal(organizationProposal.to[0], accounts[1]);
    assert.equal(organizationProposal.value[0], constants.TEST_VALUE);
    assert.equal(organizationProposal.callData[1], testCallData);
    assert.equal(organizationProposal.to[1], actionMock.address);
    assert.equal(organizationProposal.value[1], 0);
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
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
      });

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
      const proposalId2 = await helpers.getValueFromLogs(tx2, "proposalId");
      await org.votingMachine.vote(proposalId2, constants.YES_OPTION, 0, {
        from: accounts[2],
        gas: constants.GAS_LIMIT,
      });
      assert.equal(
        await testToken.balanceOf(masterWalletScheme.address),
        "150"
      );

      const organizationProposal = await masterWalletScheme.getProposal(
        proposalId2
      );
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.passed
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
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      await expectEvent(
        await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
          from: accounts[2],
        }),
        "ProposalExecuteResult",
        { 0: "PermissionRegistry: Value limit reached" }
      );
      assert.equal(
        (await masterWalletScheme.getProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.passed
      );
      assert.equal(
        (await org.votingMachine.proposals(proposalId)).executionState,
        constants.VOTING_MACHINE_EXECUTION_STATES.Failed
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
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      await expectEvent(
        await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
          from: accounts[2],
        }),
        "ProposalExecuteResult",
        { 0: "PermissionRegistry: Value limit reached" }
      );
      assert.equal(
        (await quickWalletScheme.getProposal(proposalId)).state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.passed
      );
      assert.equal(
        (await org.votingMachine.proposals(proposalId)).executionState,
        constants.VOTING_MACHINE_EXECUTION_STATES.Failed
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
      const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
      });

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
      const proposalId2 = await helpers.getValueFromLogs(tx2, "proposalId");

      await org.votingMachine.vote(proposalId2, constants.YES_OPTION, 0, {
        from: accounts[2],
      });
      assert.equal(await testToken.balanceOf(quickWalletScheme.address), "150");

      const organizationProposal = await quickWalletScheme.getProposal(
        proposalId2
      );
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.passed
      );
      assert.equal(organizationProposal.callData[0], transferData);
      assert.equal(organizationProposal.to[0], testToken.address);
      assert.equal(organizationProposal.value[0], 0);
    });
  });

  it("sould return the reputation", async function () {
    const proposalId = await helpers.getValueFromLogs(
      await quickWalletScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "proposalId"
    );

    const reputation = await quickWalletScheme.reputationOf(
      accounts[1],
      proposalId
    );

    assert.equal(10000, Number(reputation));
  });

  it("sould return the total reputation", async function () {
    const proposalId = await helpers.getValueFromLogs(
      await quickWalletScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "proposalId"
    );

    const reputation = await quickWalletScheme.getTotalReputationSupply(
      proposalId
    );

    assert.equal(100000, Number(reputation));
  });
});
