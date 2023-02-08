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
const lf = -0.025;
const linearFactor = web3.utils.toWei(lf.toString(), "ether");
const ef = 0.5;
const exponentialFactor = web3.utils.toWei(ef.toString(), "ether");
const exp = 0.5;
const exponent = web3.utils.toWei(exp.toString(), "ether");

function estimateInfluence(stake, time) {
  const linearElement = lf * stake * time;
  const exponentialElement = ef * stake * Math.pow(time, exp);
  return linearElement + exponentialElement;
};

contract("DXD staking and DXD influence", async accounts => {
  let dxdStake, dxdInfluence, addresses, amounts, owner, notTheOwner, dxd;
  const constants = helpers.constants;
  beforeEach(async () => {
    owner = accounts[0];
    notTheOwner = accounts[1];

    addresses = [accounts[0], accounts[1], accounts[2]];
    amounts = [100, 200, 300];

    dxd = await ERC20Mock.new("DXD Token", "DXD", web3.utils.toWei("10000", "ether"), owner);
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
  });

  describe("DXDStake", async () => {
    it("Should fail if is already initialized", async () => {
      await expectRevert(
        dxdStake.initialize(dxd.address, dxdInfluence.address, owner, 0, "", ""),
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
        dxdStake.increaseCommitmentTime(0, 1, { from: dxdHolder }),
        "DXDStake: timeCommitment too small"
      );

      await time.increase(time.duration.seconds(20));
      await dxdStake.increaseCommitmentTime(0, 30, { from: dxdHolder });
      const influenceBalance1 = await dxdInfluence.balanceOf(dxdHolder);
      await dxdStake.increaseCommitmentTime(0, timeCommitment * 2, {
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
        dxdStake.increaseCommitmentTime(0, maxTimeCommitment + 1, {
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

    it("should change the maximum commitment time correctly", async () => {
      const dxdHolder = accounts[0];
      const amount = 100;
      const timeCommitment = 50;

      await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
      await dxdStake.stake(amount, timeCommitment, { from: dxdHolder });

      await expectRevert(
        dxdStake.increaseCommitmentTime(0, 1, { from: dxdHolder }),
        "DXDStake: timeCommitment too small"
      );

      await time.increase(time.duration.seconds(20));
      await dxdStake.increaseCommitmentTime(0, 30, { from: dxdHolder });
      await dxdStake.increaseCommitmentTime(0, timeCommitment * 2, {
        from: dxdHolder,
      });

      // Change max commitment time
      await expectRevert(
        dxdStake.changeMaxTimeCommitment(0, { from: accounts[1] }),
        "Ownable: caller is not the owner"
      );
      await dxdStake.changeMaxTimeCommitment(49, { from: accounts[0] });
      
      await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
      await expectRevert(
        dxdStake.stake( amount, timeCommitment, { from: dxdHolder }),
        "DXDStake: timeCommitment too big"
      );
      
      await dxdStake.stake(amount, 49, { from: dxdHolder });

      await expectRevert(
        dxdStake.increaseCommitmentTime(0, 50, { from: dxdHolder }),
        "DXDStake: timeCommitment too big"
      );
    });
  });

  describe("DXDInfluence", async () => {
    it("Should fail if is already initialized", async () => {
      await expectRevert(
        dxdInfluence.initialize(dxd.address, dxdInfluence.address, 0, 0, 0),
        "Initializable: contract is already initialized"
      );
    });

    it("should stake DXD and update influence values correctly with at least 1 gwei precision", async () => {
      const dxdHolder = accounts[0];
      const intAmount = "1500";
      let amount = web3.utils.toWei(intAmount, "ether");
      const timeCommitment = 25;
      const delta = web3.utils.toWei("1", "gwei");

      // First stake
      await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
      await dxdStake.stake(amount, timeCommitment, { from: dxdHolder });

      let influence = await dxdInfluence.balanceOf(dxdHolder);
      let influenceAt = await dxdInfluence.balanceOfAt(dxdHolder, 1);
      expect(influence).to.be.bignumber.equal(influenceAt);
      
      let totalInfluence = await dxdInfluence.totalSupply();
      let totalInfluenceAt = await dxdInfluence.totalSupplyAt(1);
      expect(totalInfluence).to.be.bignumber.equal(totalInfluenceAt);

      let estimatedInfluence = estimateInfluence(Number(intAmount), timeCommitment);
      let estimatedInfluenceBN = web3.utils.toWei(estimatedInfluence.toString(), "ether");
      estimatedInfluenceBN = new BN(estimatedInfluenceBN);
      expect(estimatedInfluenceBN).to.be.bignumber.closeTo(totalInfluence, delta);

      // Null stake
      await dxdStake.stake(0, timeCommitment, { from: dxdHolder });
      expect(await dxdInfluence.balanceOf(dxdHolder)).to.be.bignumber.equal(influence);
      expect(await dxdInfluence.balanceOfAt(dxdHolder, 1)).to.be.bignumber.equal(influence);
      expect(await dxdInfluence.balanceOfAt(dxdHolder, 2)).to.be.bignumber.equal(influence);
      
      expect(await dxdInfluence.totalSupply()).to.be.bignumber.equal(totalInfluence);
      expect(await dxdInfluence.totalSupplyAt(1)).to.be.bignumber.equal(totalInfluence);
      expect(await dxdInfluence.totalSupplyAt(2)).to.be.bignumber.equal(totalInfluence);

      // Null time commitment
      await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
      await dxdStake.stake(amount, 0, { from: dxdHolder });
      expect(await dxdInfluence.balanceOf(dxdHolder)).to.be.bignumber.equal(influence);
      expect(await dxdInfluence.balanceOfAt(dxdHolder, 1)).to.be.bignumber.equal(influence);
      expect(await dxdInfluence.balanceOfAt(dxdHolder, 2)).to.be.bignumber.equal(influence);
      expect(await dxdInfluence.balanceOfAt(dxdHolder, 3)).to.be.bignumber.equal(influence);
      
      expect(await dxdInfluence.totalSupply()).to.be.bignumber.equal(totalInfluence);
      expect(await dxdInfluence.totalSupplyAt(1)).to.be.bignumber.equal(totalInfluence);
      expect(await dxdInfluence.totalSupplyAt(2)).to.be.bignumber.equal(totalInfluence);
      expect(await dxdInfluence.totalSupplyAt(3)).to.be.bignumber.equal(totalInfluence);

      // Small stake
      amount = web3.utils.toWei(intAmount, "gwei");
      await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
      await dxdStake.stake(amount, timeCommitment, { from: dxdHolder });

      influence = (await dxdInfluence.balanceOf(dxdHolder));
      influenceAt = (await dxdInfluence.balanceOfAt(dxdHolder, 4));
      expect(influence).to.be.bignumber.equal(influenceAt);
      
      totalInfluence = (await dxdInfluence.totalSupply());
      totalInfluenceAt = (await dxdInfluence.totalSupplyAt(4));
      expect(totalInfluence).to.be.bignumber.equal(totalInfluenceAt);

      estimatedInfluence = estimateInfluence(Number(intAmount), timeCommitment);
      const aux = new BN(web3.utils.toWei(estimatedInfluence.toString(), "gwei"));
      estimatedInfluenceBN = estimatedInfluenceBN.add(aux);
      expect(totalInfluence).to.be.bignumber.closeTo(estimatedInfluenceBN, delta);
    });

    it("should withdraw DXD and update influence values correctly", async () => {
      const dxdHolder = accounts[0];
      const intAmount = "1500";
      let amount = web3.utils.toWei(intAmount, "ether");
      const timeCommitment = 25;

      // First stake
      await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
      await dxdStake.stake(amount, timeCommitment, { from: dxdHolder });

      await time.increase(time.duration.seconds(timeCommitment));
      await dxdStake.withdraw(dxdHolder, 0, { from: notTheOwner });

      const influenceBalance = await dxdInfluence.balanceOf(dxdHolder);
      const totalInfluenceBalance = await dxdInfluence.totalSupply();
      expect(influenceBalance).to.be.bignumber.equal(new BN(0));
      expect(totalInfluenceBalance).to.be.bignumber.equal(new BN(0));
    });

    it("should revert when getters are called using a corrupted influence formula", async () => {
      const dxdHolder = accounts[0];
      const amount = 100;
      const timeCommitment = 50;

      await dxd.approve(dxdStake.address, amount, { from: dxdHolder });
      await dxdStake.stake(amount, timeCommitment, { from: dxdHolder });
      const influenceBalance0 = await dxdInfluence.balanceOf(dxdHolder);

      const newLF = -0.1;
      const newLinearFactor = web3.utils.toWei(newLF.toString(), "ether");
      await dxdStake.changeInfluenceFormula(newLinearFactor, exponentialFactor, { from: accounts[0] });

      await expectRevert(
        dxdInfluence.balanceOf(dxdHolder),
        "DXDInfluence: negative influence, update formula"
      );

      const newEF = 1.5;
      const newExponentialFactor = web3.utils.toWei(newEF.toString(), "ether");
      await dxdStake.changeInfluenceFormula(newLinearFactor, newExponentialFactor, { from: accounts[0] });
      const influenceBalance1 = await dxdInfluence.balanceOf(dxdHolder);
    });
  });
});
