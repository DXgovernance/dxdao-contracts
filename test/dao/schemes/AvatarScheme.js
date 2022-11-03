import { artifacts } from "hardhat";
import * as helpers from "../../helpers";
import { assert } from "chai";
const { time } = require("@openzeppelin/test-helpers");

const AvatarScheme = artifacts.require("./AvatarScheme.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");

contract("AvatarScheme", function (accounts) {
  let standardTokenMock,
    permissionRegistry,
    registrarScheme,
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
      true
    );
  });
  it("should execute proposal", async function () {
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
  });
});
