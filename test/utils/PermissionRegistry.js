import * as helpers from "../helpers";

const { time, expectRevert } = require("@openzeppelin/test-helpers");

const WalletScheme = artifacts.require("./WalletScheme.sol");
const AvatarScheme = artifacts.require("./AvatarScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");

contract("PermissionRegistry", function (accounts) {
  let permissionRegistry,
    masterAvatarScheme,
    quickWalletScheme,
    dao,
    actionMock;

  const constants = helpers.constants;
  const executionTimeout = 172800 + 86400; // _queuedVotePeriodLimit + _boostedVotePeriodLimit

  beforeEach(async function () {
    actionMock = await ActionMock.new();
    const votingMachineToken = await ERC20Mock.new("", "", 1000, accounts[1]);

    dao = await helpers.deployDao({
      owner: accounts[0],
      votingMachineToken: votingMachineToken.address,
      repHolders: [
        { address: accounts[0], amount: 20000 },
        { address: accounts[1], amount: 10000 },
        { address: accounts[2], amount: 70000 },
      ],
    });

    const defaultParamsHash = await helpers.setDefaultParameters(
      dao.votingMachine
    );

    permissionRegistry = await PermissionRegistry.new(accounts[0], 30);
    await permissionRegistry.initialize();

    masterAvatarScheme = await AvatarScheme.new();
    await masterAvatarScheme.initialize(
      dao.avatar.address,
      dao.votingMachine.address,
      dao.controller.address,
      permissionRegistry.address,
      "Master Wallet",
      executionTimeout,
      5
    );

    quickWalletScheme = await WalletScheme.new();
    await quickWalletScheme.initialize(
      dao.avatar.address,
      dao.votingMachine.address,
      dao.controller.address,
      permissionRegistry.address,
      "Quick Wallet",
      executionTimeout,
      0
    );

    await time.increase(30);

    await dao.controller.registerScheme(
      masterAvatarScheme.address,
      defaultParamsHash,
      false,
      true
    );
    await dao.controller.registerScheme(
      quickWalletScheme.address,
      defaultParamsHash,
      false,
      false
    );
  });

  it("Cannot tranfer ownership to address zero", async function () {
    await expectRevert(
      permissionRegistry.transferOwnership(constants.NULL_ADDRESS),
      "Ownable: new owner is the zero address"
    );
  });

  it("transfer ownerhip and set time delay", async function () {
    const callData = helpers.testCallFrom(quickWalletScheme.address);

    await permissionRegistry.setETHPermission(
      dao.avatar.address,
      actionMock.address,
      callData.substring(0, 10),
      constants.MAX_UINT_256,
      false
    );

    await permissionRegistry.transferOwnership(dao.avatar.address);

    await expectRevert(
      permissionRegistry.transferOwnership(accounts[0]),
      "Ownable: caller is not the owner"
    );

    const setETHPermissionDelayData = new web3.eth.Contract(
      PermissionRegistry.abi
    ).methods
      .setETHPermissionDelay(quickWalletScheme.address, 45)
      .encodeABI();

    const setETHPermissionData = new web3.eth.Contract(
      PermissionRegistry.abi
    ).methods
      .setETHPermission(
        quickWalletScheme.address,
        actionMock.address,
        callData.substring(0, 10),
        666,
        true
      )
      .encodeABI();

    const tx = await masterAvatarScheme.proposeCalls(
      [permissionRegistry.address, permissionRegistry.address],
      [setETHPermissionDelayData, setETHPermissionData],
      [0, 0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId1 = await helpers.getValueFromLogs(tx, "_proposalId");

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

    await dao.votingMachine.vote(proposalId1, 1, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          quickWalletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      (await time.latest()).toNumber() + 45
    );

    assert.equal(
      await permissionRegistry.getETHPermissionDelay(quickWalletScheme.address),
      45
    );

    assert.equal(
      (await masterAvatarScheme.getProposal(proposalId1)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );

    const tx2 = await quickWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");

    // The call to execute is not allowed YET, because we change the delay time to 45 seconds
    await expectRevert(
      dao.votingMachine.vote(proposalId2, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "PermissionRegistry: Call not allowed yet"
    );

    // After increasing the time it will allow the proposal execution
    await time.increase(45);
    await dao.votingMachine.vote(proposalId2, 1, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });

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

  it("remove permission from quickwallet", async function () {
    const callData = helpers.testCallFrom(quickWalletScheme.address);

    await permissionRegistry.setETHPermission(
      quickWalletScheme.address,
      actionMock.address,
      callData.substring(0, 10),
      666,
      true
    );

    const setETHPermissionDelayData = new web3.eth.Contract(
      PermissionRegistry.abi
    ).methods
      .setETHPermissionDelay(quickWalletScheme.address, 60)
      .encodeABI();

    const setETHPermissionData = new web3.eth.Contract(
      PermissionRegistry.abi
    ).methods
      .setETHPermission(
        quickWalletScheme.address,
        actionMock.address,
        callData.substring(0, 10),
        666,
        false
      )
      .encodeABI();

    await permissionRegistry.transferOwnership(dao.avatar.address);

    const tx = await quickWalletScheme.proposeCalls(
      [permissionRegistry.address, permissionRegistry.address],
      [setETHPermissionDelayData, setETHPermissionData],
      [0, 0],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

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

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          quickWalletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).valueAllowed.toString(),
      "666"
    );

    await dao.votingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });

    assert.equal(
      (await quickWalletScheme.getProposal(proposalId)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );

    await time.increase(60);

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

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          quickWalletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).valueAllowed.toString(),
      0
    );
  });
});
