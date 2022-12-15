import { artifacts } from "hardhat";
import * as helpers from "../../helpers";
import { assert } from "chai";
import { NULL_HASH, SOME_HASH } from "../../helpers/constants";
const {
  time,
  expectRevert,
  expectEvent,
} = require("@openzeppelin/test-helpers");

const AvatarScheme = artifacts.require("./AvatarScheme.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");

contract("AvatarScheme", function (accounts) {
  let standardTokenMock,
    permissionRegistry,
    avatarScheme,
    walletScheme,
    org,
    actionMock;

  const constants = helpers.constants;

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
      5
    );

    walletScheme = await WalletScheme.new();
    await walletScheme.initialize(
      org.avatar.address,
      org.votingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "Quick Wallet",
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
    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
    const organizationProposal = await avatarScheme.getProposal(proposalId);
    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
  });

  it("can burn rep", async function () {
    const initialReputation = await org.reputation.balanceOf(accounts[1]);
    let currentReputation;

    const repChange = 10;

    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(repChange, accounts[1])
      .encodeABI();

    const mintRepTx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [callDataMintRep],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(
      mintRepTx,
      "proposalId"
    );
    await org.votingMachine.vote(proposalIdMintRep, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    currentReputation = await org.reputation.balanceOf(accounts[1]);

    assert.equal(
      currentReputation.toNumber(),
      initialReputation.toNumber() + repChange
    );

    const callDataBurnRep = await org.controller.contract.methods
      .burnReputation(repChange, accounts[1])
      .encodeABI();

    const burnRepTx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [callDataBurnRep],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalIdBurnRep = await helpers.getValueFromLogs(
      burnRepTx,
      "proposalId"
    );
    await org.votingMachine.vote(proposalIdBurnRep, constants.YES_OPTION, 0, {
      from: accounts[2],
    });

    currentReputation = await org.reputation.balanceOf(accounts[1]);

    assert.equal(currentReputation.toNumber(), initialReputation.toNumber());
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
    const createProposals = async numberOfProposals => {
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

    const randomNumber = helpers.getRandomNumber(1, 10);

    const numberOfProposalsCreated = await createProposals(randomNumber);
    const organizationProposals = await avatarScheme.getOrganizationProposals();
    assert.equal(organizationProposals.length, numberOfProposalsCreated);
  });

  it("should change the state of the proposal to ExecutionTimeout", async function () {
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

    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");
    await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: accounts[2],
    });
    const organizationProposal = await avatarScheme.getProposal(proposalId);

    assert.equal(
      organizationProposal.state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );
  });

  it("can get the scheme type", async function () {
    const schemeType = await avatarScheme.getSchemeType();
    assert.equal(schemeType, "AvatarScheme_v1");
  });

  it("cannot execute a proposal if the number of options is not 2", async function () {
    const callData = helpers.testCallFrom(org.avatar.address);

    await expectRevert(
      avatarScheme.proposeCalls(
        [actionMock.address],
        [callData],
        [0],
        3,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "AvatarScheme__TotalOptionsMustBeTwo()"
    );
  });

  it("cannot mint more rep than maxRepPercentageChange", async function () {
    const maxRepPercentageChange = await avatarScheme.maxRepPercentageChange();
    const repSupply = await org.reputation.totalSupply();
    const maxRepChangeAllowed =
      (repSupply.toNumber() * (100 + maxRepPercentageChange.toNumber())) / 100;

    const callDataMintRep = await org.controller.contract.methods
      .mintReputation(maxRepChangeAllowed + 1, accounts[1])
      .encodeABI();

    const mintRepTx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [callDataMintRep],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalIdMintRep = await helpers.getValueFromLogs(
      mintRepTx,
      "proposalId"
    );

    // Check inside the raw logs that the ProposalExecuteResult event logs the signature of the error to be throw
    await assert(
      (
        await org.votingMachine.vote(
          proposalIdMintRep,
          constants.YES_OPTION,
          0,
          {
            from: accounts[2],
          }
        )
      ).receipt.rawLogs[2].data.includes(
        web3.eth.abi
          .encodeFunctionSignature(
            "AvatarScheme__MaxRepPercentageChangePassed()"
          )
          .substring(2)
      )
    );
    assert.equal(
      (await avatarScheme.getProposal(proposalIdMintRep)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );

    assert.equal(
      (await org.votingMachine.proposals(proposalIdMintRep)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
    );
  });

  it("cannot burn more rep than maxRepPercentageChange", async function () {
    const maxRepPercentageChange = await avatarScheme.maxRepPercentageChange();
    const repSupply = await org.reputation.totalSupply();
    const maxRepChangeAllowed = -(
      (repSupply.toNumber() * (100 - maxRepPercentageChange.toNumber())) / 100 -
      repSupply.toNumber()
    );

    const callDataBurnRep = await org.controller.contract.methods
      .burnReputation(maxRepChangeAllowed + 1, accounts[2])
      .encodeABI();

    await permissionRegistry.setETHPermission(
      avatarScheme.address,
      org.controller.address,
      callDataBurnRep.substring(0, 10),
      0,
      true
    );

    const burnRepTx = await avatarScheme.proposeCalls(
      [org.controller.address],
      [callDataBurnRep],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalIdBurnRep = await helpers.getValueFromLogs(
      burnRepTx,
      "proposalId"
    );

    // Check inside the raw logs that the ProposalExecuteResult event logs the signature of the error to be throw
    await assert(
      (
        await org.votingMachine.vote(
          proposalIdBurnRep,
          constants.YES_OPTION,
          0,
          {
            from: accounts[2],
          }
        )
      ).receipt.rawLogs[2].data.includes(
        web3.eth.abi
          .encodeFunctionSignature(
            "AvatarScheme__MaxRepPercentageChangePassed()"
          )
          .substring(2)
      )
    );
    assert.equal(
      (await avatarScheme.getProposal(proposalIdBurnRep)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.passed
    );

    assert.equal(
      (await org.votingMachine.proposals(proposalIdBurnRep)).executionState,
      constants.VOTING_MACHINE_EXECUTION_STATES.Failed
    );
  });
});
