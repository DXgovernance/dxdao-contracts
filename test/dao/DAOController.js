const { expectRevert, expectEvent, BN } = require("@openzeppelin/test-helpers");
const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
import * as helpers from "../helpers";

contract("DAOController", function (accounts) {
  let reputation, controller, avatar, defaultParamsHash, repHolders, actionMock;

  const schemeAddress = accounts[0];

  beforeEach(async function () {
    actionMock = await ActionMock.new();
    repHolders = [
      { address: accounts[0], amount: { dxd: 20000, rep: 20000 } },
      { address: accounts[1], amount: { dxd: 10000, rep: 10000 } },
      { address: accounts[2], amount: { dxd: 70000, rep: 70000 } },
    ];

    const org = await helpers.deployDaoV2({
      owner: accounts[0],
      repHolders,
    });
    controller = org.controller;
    avatar = org.avatar;
    defaultParamsHash = org.defaultParamsHash;
    reputation = org.reputation;
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
      await controller.getSchemesWithManageSchemesPermissionsCount();
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
      "DAOController__CannotDisableLastSchemeWithManageSchemesPermission"
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
      await controller.getSchemesWithManageSchemesPermissionsCount();
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
      await controller.getSchemesWithManageSchemesPermissionsCount();
    expect(schemesWithManageSchemesPermissionAfterChange.toNumber()).to.equal(
      currentSchemesWithManagePermission - 1
    );
  });

  it('registerScheme() should reject with: "DAOController__SenderNotRegistered"', async function () {
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
      "DAOController__SenderNotRegistered"
    );
  });

  it('registerScheme() should reject with: "DAOController__SenderCannotManageSchemes"', async function () {
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
      "DAOController__SenderCannotManageSchemes"
    );
  });

  it('avatarCall() should reject with: "DAOController__SenderCannotPerformAvatarCalls"', async function () {
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
      "DAOController__SenderCannotPerformAvatarCalls"
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
      "DAOController__SenderNotRegistered"
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
      "DAOController__SenderCannotManageSchemes"
    );
  });

  it("unregisterScheme() should fail if try to unregister last scheme with manage schemes permission", async () => {
    await expectRevert(
      controller.unregisterScheme(schemeAddress, { from: schemeAddress }),
      "DAOController__CannotUnregisterLastSchemeWithManageSchemesPermission"
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
        await controller.getSchemesWithManageSchemesPermissionsCount()
      ).toNumber()
    ).to.equal(2);

    const tx = await controller.unregisterScheme(schemeToUnregister, {
      from: schemeAddress,
    });

    // A scheme can unregister another scheme
    await expectEvent(tx.receipt, "UnregisterScheme", {
      sender: schemeAddress,
      scheme: schemeToUnregister,
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
      "DAOController__SenderNotRegistered"
    );
  });

  it("avatarCall() should fail from onlyAvatarCallScheme modifyer", async () => {
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
      "DAOController__SenderCannotPerformAvatarCalls"
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
    expect(avatarCallEvent.args.to).to.equal(actionMock.address);
    expect(avatarCallEvent.args.data).to.equal(dataCall);
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
      "DAOController__SenderCannotChangeReputation"
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
      "DAOController__SenderCannotChangeReputation"
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
      "DAOController__SenderCannotManageSchemes"
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
      "DAOController__SenderCannotPerformAvatarCalls"
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
      "DAOController__SenderCannotChangeReputation"
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
      await controller.getSchemesWithManageSchemesPermissionsCount();
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
      await controller.getSchemesWithManageSchemesPermissionsCount();
    expect(schemesWithManageSchemesPermission.toNumber()).to.equal(2);
  });
});
