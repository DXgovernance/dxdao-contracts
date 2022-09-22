import * as helpers from "../helpers";

const { time, expectRevert } = require("@openzeppelin/test-helpers");

const WalletScheme = artifacts.require("./WalletScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");

contract("PermissionRegistry", function (accounts) {
  let permissionRegistry,
    masterWalletScheme,
    quickWalletScheme,
    org,
    actionMock,
    votingMachine;

  const constants = helpers.constants;
  const executionTimeout = 172800 + 86400; // _queuedVotePeriodLimit + _boostedVotePeriodLimit

  beforeEach(async function () {
    actionMock = await ActionMock.new();
    const standardTokenMock = await ERC20Mock.new("", "", 1000, accounts[1]);
    org = await helpers.setupOrganization(
      [accounts[0], accounts[1], accounts[2]],
      [1000, 1000, 1000],
      [20000, 10000, 70000]
    );
    votingMachine = await helpers.setUpVotingMachine(
      standardTokenMock.address,
      "dxd",
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
    await permissionRegistry.initialize();

    masterWalletScheme = await WalletScheme.new();
    await masterWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      true,
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
      false,
      org.controller.address,
      permissionRegistry.address,
      "Quick Wallet",
      executionTimeout,
      0
    );

    await time.increase(30);

    await org.daoCreator.setSchemes(
      org.avatar.address,
      [masterWalletScheme.address, quickWalletScheme.address],
      [votingMachine.params, votingMachine.params],
      [
        helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true,
        }),
        helpers.encodePermission({
          canGenericCall: false,
          canUpgrade: false,
          canChangeConstraints: false,
          canRegisterSchemes: false,
        }),
      ],
      "metaData"
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
      org.avatar.address,
      actionMock.address,
      callData.substring(0, 10),
      constants.MAX_UINT_256,
      false
    );

    await permissionRegistry.transferOwnership(org.avatar.address);

    await expectRevert(
      permissionRegistry.transferOwnership(accounts[0]),
      "Ownable: caller is not the owner"
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
        true
      )
      .encodeABI();

    const tx = await masterWalletScheme.proposeCalls(
      [permissionRegistry.address, permissionRegistry.address],
      [setETHPermissionDelayData, setETHPermissionData],
      [0, 0],
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

    await votingMachine.contract.vote(
      proposalId1,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (
        await permissionRegistry.getETHPermission(
          quickWalletScheme.address,
          actionMock.address,
          callData.substring(0, 10)
        )
      ).fromTime.toString(),
      (await time.latest()).toNumber() + 60
    );

    assert.equal(
      await permissionRegistry.getETHPermissionDelay(quickWalletScheme.address),
      60
    );

    assert.equal(
      (await masterWalletScheme.getOrganizationProposal(proposalId1)).state,
      constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
    );

    const tx2 = await quickWalletScheme.proposeCalls(
      [actionMock.address],
      [callData],
      [0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );
    const proposalId2 = await helpers.getValueFromLogs(tx2, "_proposalId");

    // The call to execute is not allowed YET, because we change the delay time to 60 seconds
    await expectRevert(
      votingMachine.contract.vote(proposalId2, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "PermissionRegistry: Call not allowed yet"
    );

    // After increasing the time it will allow the proposal execution
    await time.increase(60);
    await votingMachine.contract.vote(
      proposalId2,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    const organizationProposal =
      await quickWalletScheme.getOrganizationProposal(proposalId2);
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

    await permissionRegistry.transferOwnership(org.avatar.address);

    const tx = await quickWalletScheme.proposeCalls(
      [permissionRegistry.address, permissionRegistry.address],
      [setETHPermissionDelayData, setETHPermissionData],
      [0, 0],
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

    await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );

    assert.equal(
      (await quickWalletScheme.getOrganizationProposal(proposalId)).state,
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
