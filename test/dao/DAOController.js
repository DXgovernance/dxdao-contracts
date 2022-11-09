const { expectRevert, expectEvent, BN } = require("@openzeppelin/test-helpers");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const DAOReputation = artifacts.require("./DAOReputation.sol");
const DAOController = artifacts.require("./DAOController.sol");
const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const DXDVotingMachine = artifacts.require("./DXDVotingMachine.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
import * as helpers from "../helpers";

const createProposalId = () => web3.utils.randomHex(32);
const getRandomProposalIds = (n = 10) =>
  Array.from(Array(n))
    .fill()
    .map(() => createProposalId());

contract("DAOController", function (accounts) {
  let reputation,
    controller,
    avatar,
    defaultParamsHash,
    repHolders,
    standardTokenMock,
    actionMock;

  const schemeAddress = accounts[0];

  beforeEach(async function () {
    actionMock = await ActionMock.new();
    repHolders = [
      { address: accounts[0], amount: 20000 },
      { address: accounts[1], amount: 10000 },
      { address: accounts[2], amount: 70000 },
    ];

    reputation = await DAOReputation.new();
    await reputation.initialize("DXDaoReputation", "DXRep");

    controller = await DAOController.new();

    avatar = await DAOAvatar.new();
    await avatar.initialize(controller.address);

    for (let { address, amount } of repHolders) {
      await reputation.mint(address, amount);
    }

    await reputation.transferOwnership(controller.address);

    standardTokenMock = await ERC20Mock.new("", "", 1000, accounts[1]);

    const votingMachine = await DXDVotingMachine.new(
      standardTokenMock.address,
      avatar.address
    );

    defaultParamsHash = await helpers.setDefaultParameters(votingMachine);

    await controller.initialize(
      schemeAddress,
      reputation.address,
      defaultParamsHash
    );
  });
  it("Should fail with 'Initializable: contract is already initialized'", async () => {
    await expectRevert(
      controller.initialize(
        schemeAddress,
        reputation.address,
        defaultParamsHash
      ),
      "Initializable: contract is already initialized"
    );
  });

  it("Should initialize and set correct default scheme params", async function () {
    const schemesWithManageSchemesPermission =
      await controller.getSchemesCountWithManageSchemesPermissions();
    const defaultSchemeParamsHash = await controller.getSchemeParameters(
      schemeAddress
    );
    const canManageSchemes = await controller.getSchemeCanManageSchemes(
      schemeAddress
    );
    const canMakeAvatarCalls = await controller.getSchemeCanMakeAvatarCalls(
      schemeAddress
    );

    const canChangeReputation = await controller.getSchemeCanChangeReputation(
      schemeAddress
    );

    expect(schemesWithManageSchemesPermission.toNumber()).to.equal(1);
    expect(defaultSchemeParamsHash).to.equal(defaultParamsHash);
    expect(canManageSchemes).to.eq(true);
    expect(canMakeAvatarCalls).to.eq(true);
    expect(canChangeReputation).to.eq(true);
  });

  // eslint-disable-next-line max-len
  it("registerScheme() should not allow subtracting from schemesWithManageSchemesPermission if there is only 1 scheme with manage schemes permissions", async function () {
    // change scheme with _canManageSchemes=false
    const registerCall = controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      false,
      false,
      false
    );

    await expectRevert(
      registerCall,
      "DAOController: Cannot disable canManageSchemes property from the last scheme with manage schemes permissions"
    );
  });

  // eslint-disable-next-line max-len
  it("registerScheme() should subtract from schemesWithManageSchemesPermission counter if _canManageSchemes is set to false in a registered scheme", async function () {
    // register new scheme with  manage schemes permissions
    const newSchemeAddress = accounts[10];
    await controller.registerScheme(
      newSchemeAddress,
      defaultParamsHash,
      true,
      true,
      true
    );
    let currentSchemesWithManagePermission = [schemeAddress, newSchemeAddress]
      .length;
    const schemesWithManageSchemesPermission =
      await controller.getSchemesCountWithManageSchemesPermissions();
    expect(schemesWithManageSchemesPermission.toNumber()).to.equal(
      currentSchemesWithManagePermission
    );

    // change manage schemes permissions to first scheme
    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      false,
      false,
      false
    );

    const schemesWithManageSchemesPermissionAfterChange =
      await controller.getSchemesCountWithManageSchemesPermissions();
    expect(schemesWithManageSchemesPermissionAfterChange.toNumber()).to.equal(
      currentSchemesWithManagePermission - 1
    );
  });

  it('registerScheme() should reject with: "DAOController: Sender is not a registered scheme"', async function () {
    const newSchemeAddress = accounts[10];
    await expectRevert(
      controller.registerScheme(
        newSchemeAddress,
        defaultParamsHash,
        true,
        true,
        true,
        { from: newSchemeAddress }
      ),
      "DAOController: Sender is not a registered scheme"
    );
  });

  it('registerScheme() should reject with: "DAOController: Sender cannot manage schemes"', async function () {
    const schemeThatCanNotManageSchemes = accounts[10];
    await controller.registerScheme(
      schemeThatCanNotManageSchemes,
      defaultParamsHash,
      false, // can't manage schemes
      true,
      true
    );

    await expectRevert(
      controller.registerScheme(
        accounts[8],
        defaultParamsHash,
        true,
        true,
        true,
        {
          from: schemeThatCanNotManageSchemes,
        }
      ),
      "DAOController: Sender cannot manage schemes"
    );
  });

  it('avatarCall() should reject with: "DAOController: Sender cannot perform avatar calls"', async function () {
    const schemeThatCanNotMakeAvatarCalls = accounts[10];
    await controller.registerScheme(
      schemeThatCanNotMakeAvatarCalls,
      defaultParamsHash,
      true, //
      false, // canMakeAvatarCalls,
      true
    );

    await expectRevert(
      controller.avatarCall(
        helpers.constants.SOME_ADDRESS,
        new web3.eth.Contract(DAOAvatar.abi).methods
          .executeCall(helpers.constants.SOME_ADDRESS, "0x0", 0)
          .encodeABI(),
        avatar.address,
        0,
        {
          from: schemeThatCanNotMakeAvatarCalls,
        }
      ),
      "DAOController: Sender cannot perform avatar calls"
    );
  });

  // eslint-disable-next-line max-len
  it("startProposal() shoul not allow a scheme assign itself as the proposer of a certain proposal ID", async () => {
    const newSchemeAddress = accounts[1];
    await controller.registerScheme(
      newSchemeAddress,
      defaultParamsHash,
      true,
      true,
      true
    );

    const proposalId = web3.utils.randomHex(32);

    // start all proposals ids
    await controller.startProposal(proposalId);

    await expectRevert(
      controller.startProposal(proposalId, {
        from: newSchemeAddress,
      }),
      "DAOController: _proposalId used by other scheme"
    );
  });

  it("endProposal() should fail if caller is not the scheme that started the proposal", async () => {
    const newSchemeAddress = accounts[1];
    await controller.registerScheme(
      newSchemeAddress,
      defaultParamsHash,
      true,
      true,
      true
    );

    const proposalId = web3.utils.randomHex(32);

    await controller.startProposal(proposalId, {
      from: newSchemeAddress,
    });

    const activeProposals = await controller.getActiveProposals(0, 0);

    const count = await controller.getActiveProposalsCount();

    expect(activeProposals[0].proposalId).to.equal(proposalId);
    expect(count.toNumber()).to.equal(1);

    await expectRevert(
      controller.endProposal(proposalId, {
        from: accounts[2],
      }),
      "DAOController: Sender is not the scheme that originally started the proposal"
    );
  });

  it("endProposal() shoud fail if proposal is not active", async () => {
    const proposalId = createProposalId();
    await controller.registerScheme(
      accounts[2],
      defaultParamsHash,
      true,
      true,
      true
    );

    await controller.startProposal(proposalId);
    await controller.unregisterScheme(schemeAddress);
    await controller.endProposal(proposalId);

    await expectRevert(
      controller.endProposal(proposalId),
      "DAOController: Sender is not a registered scheme or proposal is not active"
    );
  });

  it("getActiveProposals(0,0) should return all active proposals", async () => {
    const TOTAL_PROPOSALS = 20;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));

    // get active proposals
    const activeProposals = await controller.getActiveProposals(0, 0);

    expect(activeProposals.length).to.equal(TOTAL_PROPOSALS);
    expect(
      proposalIds.every(id =>
        activeProposals.some(({ proposalId }) => proposalId === id)
      ) // eslint-disable-line
    ).to.equal(true);
  });

  it("getActiveProposals(0,9) should return first 10 active proposals", async () => {
    const TOTAL_PROPOSALS = 100;
    const EXPECTED_PROPOSALS = 10;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));

    // get active proposals
    const activeProposals = await controller.getActiveProposals(0, 9);

    expect(activeProposals.length).to.equal(EXPECTED_PROPOSALS);
    expect(
      activeProposals.every(({ proposalId }) =>
        proposalIds.some(id => proposalId === id)
      ) // eslint-disable-line
    ).to.equal(true);
  });

  it("getActiveProposals() should fail", async () => {
    const TOTAL_PROPOSALS = 10;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));

    await expectRevert(
      controller.getActiveProposals(TOTAL_PROPOSALS + 1, 0),
      "DAOController: _start cannot be bigger than proposals list length"
    );
    await expectRevert(
      controller.getActiveProposals(0, TOTAL_PROPOSALS + 1),
      "DAOController: _end cannot be bigger than proposals list length"
    );

    await expectRevert(
      controller.getActiveProposals(8, 7),
      "DAOController: _start cannot be bigger _end"
    );
  });

  it("getActiveProposals(20, 34) Should return proposals", async () => {
    const TOTAL_PROPOSALS = 50;
    const START = 20;
    const END = 34;
    const EXPECTED_PROPOSALS = END - START + 1;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));

    // get active proposals
    const activeProposals = await controller.getActiveProposals(START, END);

    expect(activeProposals.length).to.equal(EXPECTED_PROPOSALS);
    expect(
      activeProposals.every(({ proposalId }) =>
        proposalIds.slice(START, END + 1).some(id => proposalId === id)
      ) // eslint-disable-line
    ).to.equal(true);
  });

  it("getActiveProposals(0,0) should return empty [] if no active proposals", async () => {
    const activeProposals = await controller.getActiveProposals(0, 0);
    expect(activeProposals).deep.equal([]);
  });

  it("getActiveProposals(0, 1) should return first 2 proposals", async () => {
    const proposalIds = getRandomProposalIds(3);
    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));
    // get active proposals
    const activeProposals = await controller.getActiveProposals(0, 1);

    expect(activeProposals.length).to.equal(2);
    [0, 1].forEach(i =>
      expect(activeProposals[i].proposalId).to.equal(proposalIds[i])
    );

    expect(activeProposals[0].scheme).to.equal(schemeAddress);
  });

  it("getInactiveProposals(0,0) should return all inactive proposals", async () => {
    const TOTAL_PROPOSALS = 20;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));

    // end all proposals ids
    await Promise.all(proposalIds.map(id => controller.endProposal(id)));

    // get inactive proposals
    const inactiveProposals = await controller.getInactiveProposals(0, 0);

    expect(inactiveProposals.length).to.equal(TOTAL_PROPOSALS);
    expect(
      proposalIds.every(id =>
        inactiveProposals.some(({ proposalId }) => proposalId === id)
      ) // eslint-disable-line
    ).to.equal(true);
  });

  it("getInactiveProposals(0,9) should return first 10 inactive proposals", async () => {
    const TOTAL_PROPOSALS = 100;
    const EXPECTED_PROPOSALS = 10;
    const START = 0;
    const END = 9;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));

    // end all proposals ids
    await Promise.all(proposalIds.map(id => controller.endProposal(id)));

    // get inactive proposals
    const inactiveProposals = await controller.getInactiveProposals(START, END);

    expect(inactiveProposals.length).to.equal(EXPECTED_PROPOSALS);
    expect(
      inactiveProposals.every(({ proposalId }) =>
        proposalIds.some(id => proposalId === id)
      ) // eslint-disable-line
    ).to.equal(true);
  });

  it("getActiveProposalsCount() should return correct amount of proposals", async () => {
    const TOTAL_PROPOSALS = 20;

    // start all proposals ids
    await Promise.all(
      getRandomProposalIds(TOTAL_PROPOSALS).map(id =>
        controller.startProposal(id)
      ) // eslint-disable-line
    );

    // get active proposals
    const activeProposalsCount = await controller.getActiveProposalsCount();

    expect(activeProposalsCount.toNumber()).to.equal(TOTAL_PROPOSALS);
  });

  it("getInactiveProposalsCount() should return correct amount of proposals", async () => {
    const TOTAL_PROPOSALS = 20;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));
    // end proposals
    await Promise.all(proposalIds.map(id => controller.endProposal(id)));

    // get inactive proposals
    const inactiveProposalsCount = await controller.getInactiveProposalsCount();

    expect(inactiveProposalsCount.toNumber()).to.equal(TOTAL_PROPOSALS);
  });

  it("startProposal() should fail from onlyRegisteredScheme modifyer", async () => {
    await controller.registerScheme(
      accounts[2],
      defaultParamsHash,
      true,
      true,
      true
    );

    await controller.unregisterScheme(schemeAddress);

    await expectRevert(
      controller.startProposal(web3.utils.randomHex(32), {
        from: schemeAddress,
      }),
      "DAOController: Sender is not a registered scheme"
    );
  });

  it("unregisterScheme() should fail from onlyRegisteredScheme modifyer", async () => {
    await controller.registerScheme(
      accounts[2],
      defaultParamsHash,
      true,
      true,
      true
    );
    await controller.unregisterScheme(schemeAddress);
    await expectRevert(
      controller.unregisterScheme(schemeAddress, { from: schemeAddress }),
      "DAOController: Sender is not a registered scheme"
    );
  });

  it("unregisterScheme() should fail from onlyRegisteredScheme modifyer", async () => {
    await controller.registerScheme(
      accounts[1],
      defaultParamsHash,
      true,
      true,
      true
    );

    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      false, // canManageSchemes set to false
      true,
      true
    );

    await expectRevert(
      controller.unregisterScheme(schemeAddress, { from: schemeAddress }),
      "DAOController: Sender cannot manage schemes"
    );
  });

  it("unregisterScheme() should fail if try to unregister last scheme with manage schemes permission", async () => {
    await expectRevert(
      controller.unregisterScheme(schemeAddress, { from: schemeAddress }),
      "DAOController: Cannot unregister last scheme with manage schemes permission"
    );
  });

  it("unregisterScheme() should should emmit UnregisterScheme and delete scheme", async () => {
    await controller.registerScheme(
      accounts[1],
      defaultParamsHash,
      true,
      true,
      true
    );
    const schemeToUnregister = accounts[2];

    await controller.registerScheme(
      schemeToUnregister,
      defaultParamsHash,
      false,
      true,
      true
    );

    expect(
      (
        await controller.getSchemesCountWithManageSchemesPermissions()
      ).toNumber()
    ).to.equal(2);

    const tx = await controller.unregisterScheme(schemeToUnregister, {
      from: schemeAddress,
    });

    // A scheme can unregister another scheme
    await expectEvent(tx.receipt, "UnregisterScheme", {
      _sender: schemeAddress,
      _scheme: schemeToUnregister,
    });
  });

  it("unregisterScheme() should not unregister if caller is registerd but _scheme is not", async () => {
    const newScheme = accounts[1];

    const tx = await controller.unregisterScheme(newScheme, {
      from: schemeAddress,
    });

    expectEvent.notEmitted(tx.receipt, "UnregisterScheme");
  });

  it("avatarCall() should fail from onlyRegisteredScheme modifyer", async () => {
    const newScheme = accounts[2];
    await controller.registerScheme(
      newScheme,
      defaultParamsHash,
      true,
      true,
      true
    );

    // unregister scheme
    await controller.unregisterScheme(schemeAddress);

    await expectRevert(
      controller.avatarCall(
        helpers.constants.SOME_ADDRESS,
        new web3.eth.Contract(DAOAvatar.abi).methods
          .executeCall(helpers.constants.SOME_ADDRESS, "0x0", 0)
          .encodeABI(),
        avatar.address,
        0
      ),
      "DAOController: Sender is not a registered scheme"
    );
  });

  it("avatarCall() should fail from onlyAvatarCallScheme modifyer", async () => {
    // const newScheme = accounts[2];
    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      true,
      false, // canMakeAvatarCalls set to false
      true
    );

    await expectRevert(
      controller.avatarCall(
        helpers.constants.SOME_ADDRESS,
        new web3.eth.Contract(DAOAvatar.abi).methods
          .executeCall(helpers.constants.SOME_ADDRESS, "0x0", 0)
          .encodeABI(),
        avatar.address,
        0
      ),
      "DAOController: Sender cannot perform avatar calls"
    );
  });

  it("avatarCall() should execute call", async () => {
    const dataCall = new web3.eth.Contract(ActionMock.abi).methods
      .test(schemeAddress, 200)
      .encodeABI();
    const tx = await controller.avatarCall(
      actionMock.address,
      dataCall,
      avatar.address,
      0
    );
    const avatarCallEvent = helpers.logDecoder.decodeLogs(
      tx.receipt.rawLogs
    )[0];

    expect(avatarCallEvent.name).to.equal("CallExecuted");
    expect(avatarCallEvent.args._to).to.equal(actionMock.address);
    expect(avatarCallEvent.args._data).to.equal(dataCall);
  });

  it("burnReputation() should fail from onlyChangingReputation modifyer", async () => {
    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      true,
      true,
      false // _canChangeReputation set to false
    );

    await expectRevert(
      controller.burnReputation(100, accounts[2]),
      "DAOController: Sender cannot change reputation"
    );
  });

  it("burnReputation() should call burn function from rep token", async () => {
    const acc = accounts[1];
    const currentBalance = repHolders.find(
      repHolder => repHolder.address === acc
    ).amount;
    const burnedRep = 2000;
    expect(BN(await reputation.balanceOf(acc)).toNumber()).to.equal(
      currentBalance
    );
    await controller.burnReputation(burnedRep, acc);
    const newBalance = new BN(await reputation.balanceOf(acc));
    expect(newBalance.toNumber()).to.equal(currentBalance - burnedRep);
  });
  it("mintReputation() should fail from onlyChangingReputation modifyer", async () => {
    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      true,
      true,
      false // _canChangeReputation set to false
    );

    await expectRevert(
      controller.mintReputation(100, accounts[2]),
      "DAOController: Sender cannot change reputation"
    );
  });
  it("mintReputation() should call mint function from rep token", async () => {
    const acc = accounts[1];
    const currentBalance = repHolders.find(
      repHolder => repHolder.address === acc
    ).amount;
    const mintedRep = 10000;
    expect(BN(await reputation.balanceOf(acc)).toNumber()).to.equal(
      currentBalance
    );
    await controller.mintReputation(mintedRep, acc);
    const newBalance = new BN(await reputation.balanceOf(acc));
    expect(newBalance.toNumber()).to.equal(currentBalance + mintedRep);
  });

  it("transferReputationOwnership() should fail for onlyRegisteringSchemes modifyer", async () => {
    // register new scheme to bypass last-scheme unregister check
    const newSchemeAddress = accounts[1];
    await controller.registerScheme(
      newSchemeAddress,
      defaultParamsHash,
      true,
      true,
      true
    );

    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      false, // canManageSchemes set to false
      true,
      true
    );

    await expectRevert(
      controller.transferReputationOwnership(accounts[6]),
      "DAOController: Sender cannot manage schemes"
    );
  });

  it("transferReputationOwnership() should fail for onlyAvatarCallScheme modifyer", async () => {
    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      true,
      false, // canMakeAvatarCalls set to false
      true
    );

    await expectRevert(
      controller.transferReputationOwnership(accounts[6]),
      "DAOController: Sender cannot perform avatar calls"
    );
  });

  it("transferReputationOwnership() should fail for onlyChangingReputation modifyer", async () => {
    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      true,
      true,
      false // _canChangeReputation set to false
    );

    await expectRevert(
      controller.transferReputationOwnership(accounts[6]),
      "DAOController: Sender cannot change reputation"
    );
  });

  it("transferReputationOwnership() should call transferOwnership function from rep token", async () => {
    const newOwner = accounts[6];
    await controller.transferReputationOwnership(newOwner);
    expect(await reputation.owner()).to.equal(newOwner);
  });

  it("isSchemeRegistered() should return if scheme is registered", async () => {
    const isRegistered1 = await controller.isSchemeRegistered(schemeAddress);
    expect(isRegistered1).to.equal(true);

    // register new scheme to bypass last-scheme unregister check
    const newSchemeAddress = accounts[1];
    await controller.registerScheme(
      newSchemeAddress,
      defaultParamsHash,
      true,
      true,
      true
    );

    await controller.unregisterScheme(schemeAddress);

    const isRegistered2 = await controller.isSchemeRegistered(schemeAddress);
    expect(isRegistered2).to.equal(false);
  });

  it("getDaoReputation() should return reputationToken address", async () => {
    const rep = await controller.getDaoReputation();
    expect(rep).to.equal(reputation.address);
  });
  it("registerScheme() should update schemesWithManageSchemesPermission", async () => {
    await controller.registerScheme(
      accounts[4],
      defaultParamsHash,
      true,
      true,
      true
    );

    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      false,
      true,
      true
    );

    let schemesWithManageSchemesPermission =
      await controller.getSchemesCountWithManageSchemesPermissions();
    expect(schemesWithManageSchemesPermission.toNumber()).to.equal(1);

    await controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
      true,
      true,
      true,
      { from: accounts[4] }
    );

    schemesWithManageSchemesPermission =
      await controller.getSchemesCountWithManageSchemesPermissions();
    expect(schemesWithManageSchemesPermission.toNumber()).to.equal(2);
  });
});
