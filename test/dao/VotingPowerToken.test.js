// import * as helpers from "../helpers";

import { inTransaction } from "@openzeppelin/test-helpers/src/expectEvent";
import { expect } from "chai";

const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const VotingPowerToken = artifacts.require("./VotingPowerToken.sol");
const ERC20SnapshotRep = artifacts.require("ERC20SnapshotRep.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const BigNumber = require("bignumber.js");

contract("VotingPowerToken", function (accounts) {
  let repToken;
  let stakingToken;
  let vpToken;
  let owner = accounts[0];
  let actionMock;
  beforeEach(async () => {
    actionMock = await ActionMock.new();

    repToken = await ERC20SnapshotRep.new({
      from: owner,
    });

    stakingToken = await ERC20SnapshotRep.new({
      from: owner,
    });

    await repToken.initialize("Reputation", "REP");
    await stakingToken.initialize("DXdao", "DXD");

    vpToken = await VotingPowerToken.new({ from: owner });

    await vpToken.initialize(
      repToken.address,
      stakingToken.address,
      50,
      50,
      100
    );
  });

  it("Should not initialize 2 times", async () => {
    await expectRevert(
      vpToken.initialize(repToken.address, stakingToken.address, 50, 50, 100),
      "Initializable: contract is already initialized"
    );
  });

  it("Should update info after callback", async () => {
    const holder = accounts[1];
    const balance = 200;
    await repToken.mint(holder, 200, { from: owner });
    expect((await repToken.balanceOf(holder)).toNumber()).equal(balance);

    const repSnapshotId = await repToken.getCurrentSnapshotId();
    const vpTokenSnapshotId = await vpToken.getCurrentSnapshotId();

    // Internal snapshots mapping shoud be updated
    expect(
      await vpToken.getTokenSnapshotIdFromVPSnapshot(
        repToken.address,
        vpTokenSnapshotId
      )
    ).equal(repSnapshotId);
  });
});

