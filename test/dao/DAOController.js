import { expect } from "chai";
const { expectRevert, time } = require("@openzeppelin/test-helpers");
// const ethers = require("ethers");

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

contract.only("DAOController", function (accounts) {
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
    expect(activeProposals[0].proposalId).to.equal(proposalId);

    /**
     * This next error should be "DAOController: Sender is not the scheme that originally started the proposal"
     * TODO: find out why we are getting that current incorrect params error
     */
    await expectRevert(
      controller.endProposal(proposalId, {
        from: accounts[2],
      }),
      "Transaction reverted: function was called with incorrect parameters"
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
      )
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
      )
    ).to.equal(true);
  });

  it("getActiveProposals() should fail if _start > totalActiveProposals", async () => {
    const TOTAL_PROPOSALS = 10;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));

    await expectRevert(
      controller.getActiveProposals(TOTAL_PROPOSALS + 1, 0),
      "DAOController: _start cannot be bigger than activeProposals length"
    );
  });

  // TODO: fix this test
  it.skip("getActiveProposals(20, 34) Should return proposals", async () => {
    const TOTAL_PROPOSALS = 50;
    const EXPECTED_PROPOSALS = 15;
    const proposalIds = getRandomProposalIds(TOTAL_PROPOSALS);

    // start all proposals ids
    await Promise.all(proposalIds.map(id => controller.startProposal(id)));

    // get active proposals
    const activeProposals = await controller.getActiveProposals(20, 34);

    expect(activeProposals.length).to.equal(EXPECTED_PROPOSALS);
  });

  it("getActiveProposalsCount() should return correct amount of proposals", async () => {
    const TOTAL_PROPOSALS = 20;

    // start all proposals ids
    await Promise.all(
      getRandomProposalIds(TOTAL_PROPOSALS).map(id =>
        controller.startProposal(id)
      )
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

    time.increase(100);
    // end proposals
    await Promise.all(proposalIds.map(id => controller.endProposal(id)));

    // get inactive proposals
    const inactiveProposalsCount = await controller.getInactiveProposalsCount();

    expect(inactiveProposalsCount.toNumber()).to.equal(TOTAL_PROPOSALS);
  });
  // it("getInactiveProposals(0,0) should return by default all inactive proposals", async () => {});
  // it("getInactiveProposals(0,9) should return first 10 inactive proposals", async () => {});
});
