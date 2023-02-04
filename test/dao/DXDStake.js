import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert, expect } from "chai";
import * as helpers from "../helpers";

const {
  expectEvent,
  expectRevert,
  BN,
  time,
} = require("@openzeppelin/test-helpers");

const DXDStake = artifacts.require("DXDStake.sol");
const DXDInfluence = artifacts.require("DXDInfluence.sol");
const ERC20Mock = artifacts.require("ERC20Mock.sol");
const VotingPowerMock = artifacts.require("VotingPowerMock.sol");

const maxTimeCommitment = 1000;
const linearFactor = web3.utils.toWei("-0.025", "ether");
const exponentialFactor = web3.utils.toWei("0.5", "ether");
const exponent = web3.utils.toWei("0.5", "ether");

contract("DXDStake", async accounts => {
  let dxdStake, dxdInfluence, addresses, amounts, owner, notTheOwner, dxd;
  const constants = helpers.constants;
  beforeEach(async () => {
    owner = accounts[0];
    notTheOwner = accounts[1];

    addresses = [accounts[0], accounts[1], accounts[2]];
    amounts = [100, 200, 300];

    dxd = await ERC20Mock.new("DXD Token", "DXD", 1000, owner);
    const votingPowerContract = await VotingPowerMock.new();

    dxdStake = await DXDStake.new();
    dxdInfluence = await DXDInfluence.new();

    await dxdStake.initialize(
      dxd.address,
      dxdInfluence.address,
      owner,
      maxTimeCommitment,
      "DXDStake",
      "stDXD",
      {
        from: owner,
      }
    );

    await dxdInfluence.initialize(
      dxdStake.address,
      votingPowerContract.address,
      linearFactor,
      exponentialFactor,
      exponent,
      {
        from: owner,
      }
    );
    dxdInfluence;
  });

  it("Should fail if is already initialized", async () => {
    await expectRevert(
      dxdStake.initialize(dxd.address, dxdInfluence.address, owner, 0, "", ""),
      "Initializable: contract is already initialized"
    );
    await expectRevert(
      dxdInfluence.initialize(dxd.address, dxdInfluence.address, 0, 0, 0),
      "Initializable: contract is already initialized"
    );
  });

  it("should not be able to transfer tokens", async () => {
    await expectRevert(
      dxdStake.transfer(accounts[1], 100),
      "DXDStake__NoTransfer()"
    );

    await dxdStake.approve(accounts[1], 100, { from: accounts[0] });
    await expectRevert(
      dxdStake.transferFrom(accounts[0], accounts[2], 1, {
        from: accounts[1],
      }),
      "DXDStake__NoTransfer()"
    );
  });

  it("should stake DXD and update stake values correctly", async () => {
    const dxdHolder = accounts[0];
    const amount = 100;
    const timeCommitment = 50;

    await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
    const stake = await dxdStake.stake(amount, timeCommitment);

    const stDXDBalance = await dxdStake.balanceOf(dxdHolder);
    expect(stake, true);
    await expectEvent(stake.receipt, "Transfer", {
      from: dxdHolder,
      to: dxdStake.address,
      value: amount.toString(),
    });
    await expectEvent(stake.receipt, "Transfer", {
      from: constants.ZERO_ADDRESS,
      to: dxdHolder,
      value: amount.toString(),
    });
    assert.equal(stDXDBalance.toString(), new BN(amount).toString());

    const userActiveStakes = await dxdStake.userActiveStakes(dxdHolder);
    assert.equal(userActiveStakes.toString(), new BN(1).toString());
    const userTotalStakes = await dxdStake.getAccountTotalStakes(dxdHolder);
    assert.equal(userTotalStakes.toString(), new BN(1).toString());
    const totalActiveStakes = await dxdStake.totalActiveStakes();
    assert.equal(totalActiveStakes.toString(), new BN(1).toString());
    const totalStakes = await dxdStake.getTotalStakes();
    assert.equal(totalStakes.toString(), new BN(1).toString());

    const blockdata = await web3.eth.getBlock(stake.receipt.blockNumber);
    const stakeData = await dxdStake.getStakeCommitment(dxdHolder, 0);
    assert.deepEqual(stakeData, [
      new BN(blockdata.timestamp + timeCommitment).toString(),
      new BN(timeCommitment).toString(),
      new BN(amount).toString(),
    ]);
    const snapshotId = await dxdStake.getCurrentSnapshotId();
    assert.equal(snapshotId.toString(), new BN(1).toString());
  });

  it("should withdraw only after the commitment has finalized", async () => {
    const dxdHolder = accounts[0];
    const amount = 100;
    const timeCommitment = 50;

    const stDXDBalance0 = await dxdStake.balanceOf(dxdHolder);
    const DXDBalance0 = await dxd.balanceOf(dxdHolder);
    assert.equal(stDXDBalance0.toString(), new BN(0).toString());

    await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
    await dxdStake.stake(amount, timeCommitment, { from: dxdHolder });

    await dxd.approve(dxdStake.address, amount * 2, { from: dxdHolder });
    await dxdStake.stake(amount * 2, timeCommitment * 2, { from: dxdHolder });

    const stDXDBalance1 = await dxdStake.balanceOf(dxdHolder);
    assert.equal(stDXDBalance1.toString(), new BN(amount * 3).toString());

    await expectRevert(
      dxdStake.withdraw(dxdHolder, 1, { from: notTheOwner }),
      "DXDStake: withdrawal not allowed"
    );

    await time.increase(time.duration.seconds(timeCommitment));
    await dxdStake.withdraw(dxdHolder, 0, { from: notTheOwner });

    await time.increase(time.duration.seconds(timeCommitment));
    await dxdStake.withdraw(dxdHolder, 1, { from: dxdHolder });

    const stDXDBalance2 = await dxdStake.balanceOf(dxdHolder);
    const DXDBalance2 = await dxd.balanceOf(dxdHolder);
    assert.equal(DXDBalance2.toString(), DXDBalance0.toString());
    assert.equal(stDXDBalance2.toString(), new BN(0).toString());
  });

  it("should withdraw only once", async () => {
    const dxdHolder = accounts[0];
    const amount = 100;
    const timeCommitment = 50;

    const stDXDBalance0 = await dxdStake.balanceOf(dxdHolder);
    const DXDBalance0 = await dxd.balanceOf(dxdHolder);
    assert.equal(stDXDBalance0.toString(), new BN(0).toString());

    await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
    await dxdStake.stake(amount, timeCommitment, { from: dxdHolder });

    await dxd.approve(dxdStake.address, amount * 2, { from: dxdHolder });
    await dxdStake.stake(amount * 2, timeCommitment * 2, { from: dxdHolder });

    const stDXDBalance1 = await dxdStake.balanceOf(dxdHolder);
    assert.equal(stDXDBalance1.toString(), new BN(amount * 3).toString());

    await expectRevert(
      dxdStake.withdraw(dxdHolder, 1, { from: notTheOwner }),
      "DXDStake: withdrawal not allowed"
    );

    await time.increase(time.duration.seconds(timeCommitment));
    await dxdStake.withdraw(dxdHolder, 0, { from: notTheOwner });
    
    await expectRevert(
      dxdStake.withdraw(dxdHolder, 0, { from: notTheOwner }),
      "DXDStake: commitment id does not exist"
    );
  });

  it("should increase commitment if valid time is provided", async () => {
    const dxdHolder = accounts[0];
    const amount = 100;
    const timeCommitment = 50;

    await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
    await dxdStake.stake(amount, timeCommitment, { from: dxdHolder });
    const influenceBalance0 = await dxdInfluence.balanceOf(dxdHolder);

    await expectRevert(
      dxdStake.increaseCommitment(0, 1, { from: dxdHolder }),
      "DXDStake: timeCommitment too small"
    );

    await time.increase(time.duration.seconds(20));
    await dxdStake.increaseCommitment(0, 30, { from: dxdHolder });
    const influenceBalance1 = await dxdInfluence.balanceOf(dxdHolder);
    await dxdStake.increaseCommitment(0, timeCommitment * 2, {
      from: dxdHolder,
    });
    const influenceBalance2 = await dxdInfluence.balanceOf(dxdHolder);

    expect(Number(influenceBalance0)).to.be.gt(Number(influenceBalance1));
    expect(Number(influenceBalance2)).to.be.gt(Number(influenceBalance0));
  });

  it("should not allow time commitments over maximum", async () => {
    await expectRevert(
      dxdStake.stake(1, maxTimeCommitment + 1, { from: notTheOwner }),
      "DXDStake: timeCommitment too big"
    );
    await expectRevert(
      dxdStake.increaseCommitment(0, maxTimeCommitment + 1, {
        from: notTheOwner,
      }),
      "DXDStake: timeCommitment too big"
    );
  });

  it("should handle early withdrawals when enabled", async () => {
    const dxdHolder = accounts[0];
    const amount = 100;
    const timeCommitment = 50;

    const stDXDBalance0 = await dxdStake.balanceOf(dxdHolder);
    const DXDBalance0 = await dxd.balanceOf(dxdHolder);
    assert.equal(stDXDBalance0.toString(), new BN(0).toString());

    await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
    await dxdStake.stake(amount, timeCommitment, { from: dxdHolder });

    await dxd.approve(dxdStake.address, amount * 2, { from: dxdHolder });
    await dxdStake.stake(amount * 2, timeCommitment * 2, { from: dxdHolder });

    const stDXDBalance1 = await dxdStake.balanceOf(dxdHolder);
    assert.equal(stDXDBalance1.toString(), new BN(amount * 3).toString());

    await expectRevert(
      dxdStake.withdraw(dxdHolder, 1, { from: notTheOwner }),
      "DXDStake: withdrawal not allowed"
    );
    await expectRevert(
      dxdStake.earlyWithdraw(1, { from: dxdHolder }),
      "DXDStake: early withdrawals not allowed"
    );

    // Enable early withdrawals
    const penalty = 2500; // 25%
    const penaltyRecipient = notTheOwner;
    await dxdStake.enableEarlyWithdrawal(penalty, penaltyRecipient, {
      from: owner,
    });
    const earlyWithdrawal = await dxdStake.earlyWithdraw(1, {
      from: dxdHolder,
    });

    await expectEvent(earlyWithdrawal.receipt, "Transfer", {
      from: dxdStake.address,
      to: penaltyRecipient,
      value: (amount / 2).toString(),
    });
    await expectEvent(earlyWithdrawal.receipt, "Transfer", {
      from: dxdStake.address,
      to: dxdHolder,
      value: ((3 * amount) / 2).toString(),
    });

    await dxdStake.disableEarlyWithdrawal({ from: owner });
    await expectRevert(
      dxdStake.earlyWithdraw(0, { from: dxdHolder }),
      "DXDStake: early withdrawals not allowed"
    );
  });
});
