import { expect } from "chai";
const { expectRevert } = require("@openzeppelin/test-helpers");
// const ethers = require("ethers");

const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const DAOReputation = artifacts.require("./DAOReputation.sol");
const DAOController = artifacts.require("./DAOController.sol");
const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const DXDVotingMachine = artifacts.require("./DXDVotingMachine.sol");
import * as helpers from "../helpers";

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

  it.skip("endProposal() should fail if caller is not the scheme that started the proposal", async () => {
    await controller.registerScheme(accounts[1], defaultParamsHash, true, true);
    const proposalId = web3.utils.randomHex(32);

    await controller.startProposal(proposalId, {
      from: accounts[1],
    });

    const activeProposals = await controller.getActiveProposals();
    expect(activeProposals[0].proposalId).to.equal(proposalId);

    // TODO: fix this call. getting "Transaction reverted: function was called with incorrect parameters"
    await expectRevert(
      controller.endProposal(proposalId, {
        from: schemeAddress,
        gas: 30000000,
      }),
      "DAOController: Sender is not the scheme that originally started the proposal"
    );
  });
});
