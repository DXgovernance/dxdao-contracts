const { expectRevert } = require("@openzeppelin/test-helpers");

const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const DAOReputation = artifacts.require("./DAOReputation.sol");
const DAOController = artifacts.require("./DAOController.sol");
const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const DXDVotingMachine = artifacts.require("./DXDVotingMachine.sol");
import * as helpers from "../helpers";

const getRandomProposalIds = (n = 10) =>
  Array.from(Array(n))
    .fill()
    .map(() => web3.utils.randomHex(32));

contract("DAOController", function (accounts) {
  let reputation,
    controller,
    avatar,
    defaultParamsHash,
    repHolders,
    standardTokenMock;

  const schemeAddress = accounts[0];

  beforeEach(async function () {
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

  it("Should initialize schemesWithManageSchemesPermission and set correct default scheme params", async function () {
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

    expect(schemesWithManageSchemesPermission.toNumber()).to.equal(1);
    expect(defaultSchemeParamsHash).to.equal(defaultParamsHash);
    expect(canManageSchemes).to.eq(true);
    expect(canMakeAvatarCalls).to.eq(true);
  });

  // eslint-disable-next-line max-len
  it("registerScheme() should not allow subtracting from schemesWithManageSchemesPermission if there is only 1 scheme with manage schemes permissions", async function () {
    // change scheme with _canManageSchemes=false
    const registerCall = controller.registerScheme(
      schemeAddress,
      defaultParamsHash,
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
      false
    );

    const schemesWithManageSchemesPermissionAfterChange =
      await controller.getSchemesCountWithManageSchemesPermissions();
    expect(schemesWithManageSchemesPermissionAfterChange.toNumber()).to.equal(
      currentSchemesWithManagePermission - 1
    );
  });

  // eslint-disable-next-line max-len
  it("startProposal() shoul not allow a scheme assign itself as the proposer of a certain proposal ID", async () => {
    const newSchemeAddress = accounts[1];
    await controller.registerScheme(
      newSchemeAddress,
      defaultParamsHash,
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

  it("getActiveProposals(0,0) should return by default all active proposals", async () => {
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

  it("getActiveProposals() should fail if _start > totalActiveProposals or _end > totalActiveProposals", async () => {
    const TOTAL_PROPOSALS = 10;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));

    await expectRevert(
      controller.getActiveProposals(TOTAL_PROPOSALS + 1, 0),
      "DAOController: _startIndex cannot be bigger than proposals list length"
    );
    await expectRevert(
      controller.getActiveProposals(0, TOTAL_PROPOSALS + 1),
      "DAOController: _endIndex cannot be bigger than proposals list length"
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

  it("getInactiveProposals(0,0) should return by default all inactive proposals", async () => {
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
});
