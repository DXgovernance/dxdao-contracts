import { artifacts } from "hardhat";
import * as helpers from "../../helpers";
import { assert } from "chai";
import {
  MIN_SECONDS_FOR_EXECUTION,
  NULL_HASH,
  SOME_HASH,
  TEST_VALUE,
} from "../../helpers/constants";
const { time, expectRevert } = require("@openzeppelin/test-helpers");

const AvatarScheme = artifacts.require("./AvatarScheme.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");

contract.only("AvatarScheme", function (accounts) {
  let standardTokenMock,
    permissionRegistry,
    avatarScheme,
    walletScheme,
    org,
    actionMock;

  const constants = helpers.constants;
  const executionTimeout = 172800 + 86400; // _queuedVotePeriodLimit + _boostedVotePeriodLimit

  beforeEach(async function () {
    actionMock = await ActionMock.new();
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

    const defaultParamsHash = await helpers.setDefaultParameters(
      org.votingMachine
    );

    permissionRegistry = await PermissionRegistry.new(accounts[0], 30);
    await permissionRegistry.initialize();

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

    await time.increase(30);

    await org.controller.registerScheme(
      avatarScheme.address,
      defaultParamsHash,
      false,
      true,
      true
    );
  });

  it("should execute proposal", async function () {
    const callData = helpers.testCallFrom(org.avatar.address);
    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(10, accounts[1])
      .encodeABI();

    const tx = await avatarScheme.proposeCalls(
      [actionMock.address, org.controller.address],
      [callData, callDataMintRep],
      [0, 0],
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
    const organizationProposal = await avatarScheme.getProposal(proposalId);
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );
  });

  it("should return the function signature when the length is greater than 4 bytes", async function () {
    const functionSignature = await avatarScheme.getFuncSignature(SOME_HASH);
    assert.equal(SOME_HASH.substring(0, 10), functionSignature);
  });

  it("should return zero hash if the length is less than 4 bytes", async function () {
    const smallFunctionHash = SOME_HASH.substring(0, 6);
    const zeroHashFunctionSignature = NULL_HASH.substring(0, 10);
    const functionSignature = await avatarScheme.getFuncSignature(
      smallFunctionHash
    );

    assert.equal(zeroHashFunctionSignature, functionSignature);
    assert.notEqual(smallFunctionHash, functionSignature);
  });

  it("should get zero proposals if there is none", async function () {
    const organizationProposals = await avatarScheme.getOrganizationProposals();
    assert.equal(organizationProposals.length, 0);
  });

  it("should get the number of proposals created", async function () {
    const createRandomAmountOfProposals = async maxNumberOfProposals => {
      const numberOfProposals =
        1 + Math.floor(Math.random() * (maxNumberOfProposals - 1));

      const callData = helpers.testCallFrom(org.avatar.address);

      for (let i = 1; i <= numberOfProposals; i++) {
        await avatarScheme.proposeCalls(
          [actionMock.address],
          [callData],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
      }

      return numberOfProposals;
    };

    const numberOfProposalsCreated = await createRandomAmountOfProposals(6);
    const organizationProposals = await avatarScheme.getOrganizationProposals();
    assert.equal(organizationProposals.length, numberOfProposalsCreated);
  });

  it("can setMaxSecondsForExecution", async function () {
    const secondsToSet = MIN_SECONDS_FOR_EXECUTION + TEST_VALUE;
    const callData = helpers.encodeMaxSecondsForExecution(secondsToSet);

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      avatarScheme.address,
      callData.substring(0, 10),
      0,
      true
    );

    const trx = await avatarScheme.proposeCalls(
      [avatarScheme.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(trx, "_proposalId");

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const maxSecondsForExecution = await avatarScheme.maxSecondsForExecution();
    assert.equal(maxSecondsForExecution.toNumber(), secondsToSet);
  });

  it("can setMaxSecondsForExecution exactly 86400", async function () {
    const callData = helpers.encodeMaxSecondsForExecution(
      MIN_SECONDS_FOR_EXECUTION
    );

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      avatarScheme.address,
      callData.substring(0, 10),
      0,
      true
    );

    const trx = await avatarScheme.proposeCalls(
      [avatarScheme.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(trx, "_proposalId");

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const maxSecondsForExecution = await avatarScheme.maxSecondsForExecution();
    assert.equal(maxSecondsForExecution.toNumber(), MIN_SECONDS_FOR_EXECUTION);
  });

  it("cannot setMaxSecondsForExecution if less than 86400", async function () {
    const callData = helpers.encodeMaxSecondsForExecution(
      MIN_SECONDS_FOR_EXECUTION - 1
    );

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      avatarScheme.address,
      callData.substring(0, 10),
      0,
      true
    );

    const trx = await avatarScheme.proposeCalls(
      [avatarScheme.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(trx, "_proposalId");

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
  });

  it("setMaxSecondsForExecution only callable from the avatar", async function () {
    await expectRevert(
      avatarScheme.setMaxSecondsForExecution(TEST_VALUE),
      "Scheme__SetMaxSecondsForExecutionInvalidCaller()"
    );
  });

  it("should change the state of the proposal to ExecutionTimeout", async function () {
    const defaultMaxSecondsForExecution = 259200;
    const callData = helpers.testCallFrom(org.avatar.address);

    await permissionRegistry.setETHPermission(
      org.avatar.address,
      accounts[1],
      callData.substring(0, 10),
      0,
      true
    );
    const tx = await avatarScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );

    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    // Wait for maxSecondsForExecution
    await time.increase(defaultMaxSecondsForExecution);

    await org.votingMachine.vote(
      proposalId,
      constants.YES_OPTION,
      0,
      constants.ZERO_ADDRESS,
      {
        from: accounts[2],
      }
    );

    const organizationProposal = await avatarScheme.getProposal(proposalId);

    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionTimeout
    );
  });

  it("can get the scheme type", async function () {
    const schemeType = await avatarScheme.getSchemeType();
    assert.equal(schemeType, "AvatarScheme_v1");
  });
});
