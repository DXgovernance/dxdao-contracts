const { expectRevert } = require("@openzeppelin/test-helpers");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const VotingPowerToken = artifacts.require("./VotingPowerToken.sol");
const DAOReputation = artifacts.require("DAOReputation.sol");
// const DXDStakeMock = artifacts.require("DXDStakeMock.sol");
const DXDStake = artifacts.require("DXDStake.sol");
const DXDInfluence = artifacts.require("DXDInfluence.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const BigNumber = require("bignumber.js");

BigNumber.config({ decimalPlaces: 18 });

const bn = n => new BigNumber(n);

contract("VotingPowerToken", function (accounts) {
  let repToken;
  let dxdStake;
  let vpToken;
  let owner = accounts[0];
  let precision;
  let dxd;
  let dxdInfluence;
  let decimals;
  const timeCommitment = 100;
  const repTokenWeight = 50;
  const stakeTokenWeight = 50;
  const minStakingTokensLocked = 100;
  const maxTimeCommitment = 1000;
  const lf = 0.025;
  const linearFactor = web3.utils.toWei(lf.toString(), "ether");
  const ef = 0;
  const exponentialFactor = web3.utils.toWei(ef.toString(), "ether");
  const exp = 1;
  const exponent = web3.utils.toWei(exp.toString(), "ether");

  const repHolders = [
    { account: accounts[1], amount: bn(40) },
    { account: accounts[2], amount: bn(30) },
    { account: accounts[3], amount: bn(30) },
  ];
  const stakeHolders = [
    { account: accounts[1], amount: bn(30) },
    { account: accounts[2], amount: bn(40) },
    { account: accounts[3], amount: bn(30) },
  ];

  const restore = () => {
    repToken = null;
    dxdStake = null;
    dxd = null;
    vpToken = null;
    precision = null;
  };

  const deployVpToken = async (config = {}) => {
    restore();
    repToken = await DAOReputation.new();

    dxdStake = await DXDStake.new();
    dxdInfluence = await DXDInfluence.new();

    dxd = await ERC20Mock.new(
      "DXD Token",
      "DXD",
      web3.utils.toWei("10000", "ether"),
      owner
    );

    vpToken = await VotingPowerToken.new({ from: owner });

    await repToken.initialize("Reputation", "REP", vpToken.address);

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
      vpToken.address,
      linearFactor,
      exponentialFactor,
      exponent,
      {
        from: owner,
      }
    );

    await vpToken.initialize(
      config.repTokenAddress || repToken.address,
      config.dxdInfluence || dxdInfluence.address,
      config.repWeight || repTokenWeight,
      config.stakingWeight || stakeTokenWeight,
      config.minStakingTokensLocked || minStakingTokensLocked
    );

    precision = bn(await vpToken.precision());
    decimals = bn(await vpToken.decimals());
  };

  const mintAll = async () => {
    await Promise.all(
      stakeHolders.map(({ account, amount }) => dxd.mint(account, amount))
    );
    await Promise.all(
      stakeHolders.map(({ account, amount }) =>
        dxd.approve(dxdStake.address, amount, { from: account })
      )
    );
    await Promise.all(
      stakeHolders.map(({ account, amount }) =>
        dxdStake.stake(amount, timeCommitment, {
          from: account,
        })
      )
    );
    await repToken.mintMultiple(
      repHolders.map(v => v.account),
      repHolders.map(v => v.amount)
    );
  };

  const mintApproveStake = async (account, amount) => {
    await dxd.mint(account, amount);
    await dxd.approve(dxdStake.address, amount, { from: account });
    await dxdStake.stake(amount, 100, {
      from: account,
    });
  };

  describe("initialize", () => {
    it("Should not initialize 2 times", async () => {
      await deployVpToken();
      await expectRevert(
        vpToken.initialize(repToken.address, dxdStake.address, 50, 50, 100),
        "Initializable: contract is already initialized"
      );
    });

    it("Should do _snapshot()", async () => {
      await deployVpToken();
      expect((await vpToken.getCurrentSnapshotId()).toNumber()).equal(1);
    });

    it("Should fail if repToken and dxdStake addresses are the same", async () => {
      vpToken = await VotingPowerToken.new();
      repToken = await DAOReputation.new();
      dxdInfluence = await DXDInfluence.new();

      await expectRevert(
        vpToken.initialize(
          dxdInfluence.address,
          dxdInfluence.address,
          repTokenWeight,
          stakeTokenWeight,
          minStakingTokensLocked
        ),
        "VotingPowerToken_ReputationTokenAndInfluenceTokenCannotBeEqual()"
      );
    });

    it("Should update token weights", async () => {
      await deployVpToken();
      expect(
        (await vpToken.getConfigTokenWeight(dxdInfluence.address)).toNumber()
      ).equal(stakeTokenWeight);
      expect(
        (await vpToken.getConfigTokenWeight(repToken.address)).toNumber()
      ).equal(repTokenWeight);
    });

    it("Should fail if weights are invalid", async () => {
      await expectRevert(
        deployVpToken({ repWeight: 101 }),
        "VotingPowerToken_InvalidTokenWeights()"
      );
      await expectRevert(
        deployVpToken({ repWeight: 50, stakingWeight: 51 }),
        "VotingPowerToken_InvalidTokenWeights()"
      );
    });
  });

  describe("Composition", () => {
    beforeEach(async () => await deployVpToken());
    it("Should use 50% 50% if staking token supply > _minStakingTokensLocked", async () => {
      // update config to be 50% 50%
      await mintAll();
      await vpToken.setComposition(50, 50);
      const repWeight = await vpToken.getTokenWeight(repToken.address);
      expect(repWeight.toNumber()).equal(50);
    });

    it("Should use 100% weight of rep if staking token supply < _minStakingTokensLocked", async () => {
      expect((await dxdStake.totalSupply()).toNumber()).equal(0);

      // update config to be 50% 50%
      await vpToken.setComposition(50, 50);

      const repWeight = await vpToken.getTokenWeight(repToken.address);
      expect(repWeight.toNumber()).equal(100);

      const stakingWeight = await vpToken.getTokenWeight(dxdInfluence.address);
      expect(stakingWeight.toNumber()).equal(0);
    });

    it("Should fail if the sum of both weigths is not 100", async () => {
      await expectRevert(
        vpToken.setComposition(50, 51),
        "VotingPowerToken_InvalidTokenWeights()"
      );
      await expectRevert(
        vpToken.setComposition(51, 50),
        "VotingPowerToken_InvalidTokenWeights()"
      );
      await expectRevert(
        vpToken.setComposition(80, 30),
        "VotingPowerToken_InvalidTokenWeights()"
      );
    });

    it("Should be called only by the owner", async () => {
      await expectRevert(
        vpToken.setComposition(50, 50, { from: accounts[3] }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("getPercent", () => {
    beforeEach(async () => await deployVpToken());
    it("Should return 10%", async () => {
      const balance = 20;
      const supply = 200;
      const percent = 10;
      const expectedPercent = bn(percent).mul(precision);
      const votingPower = bn(await vpToken.getPercent(balance, supply));
      expect(votingPower.eq(expectedPercent)).to.be.true;
    });

    it("Should return 100%", async () => {
      const balance = 100;
      const supply = 100;
      const percent = 100;
      const expectedPercent = bn(percent).mul(precision);
      const votingPower = bn(await vpToken.getPercent(balance, supply));
      expect(votingPower.eq(expectedPercent)).to.be.true;
    });

    it("Should return 1%", async () => {
      const balance = 10;
      const supply = 1000;
      const percent = 1;
      const expectedPercent = bn(percent).mul(precision);
      const votingPower = bn(await vpToken.getPercent(balance, supply));
      expect(votingPower.eq(expectedPercent)).to.be.true;
    });

    it("Should return 0.03%", async () => {
      const supply = 100000;
      const balance = 30;
      const percent = 0.03;
      const expectedPercent = bn(percent).mul(precision);
      const votingPower = bn(await vpToken.getPercent(balance, supply));
      expect(votingPower.eq(expectedPercent)).to.be.true;
    });

    it("Should return 0%", async () => {
      const supply = 1000;
      const balance = 0; //
      const percent = 0;
      const expectedPercent = bn(`${percent}`);
      const votingPower = bn(await vpToken.getPercent(balance, supply));
      expect(votingPower.eq(expectedPercent)).to.be.true;
      expect(votingPower.toNumber()).equal(0);
    });

    it("Should return 0.0000000000000001%", async () => {
      const supply = precision;
      const balance = 1;
      const percent = (balance * 100) / supply; //1e-16
      const expectedPercent = bn(percent).mul(precision);
      const votingPower = bn(await vpToken.getPercent(balance, supply));
      expect(votingPower.eq(expectedPercent)).to.be.true;
    });

    it("Should return 0 if denominator=0 and not revert with panic code 0x12", async () => {
      const supply = 0;
      const balance = 0;
      const votingPower = bn(await vpToken.getPercent(balance, supply));
      expect(votingPower.toNumber()).equal(0);
    });
  });

  describe("getWeightedVotingPowerPercentage", () => {
    beforeEach(async () => await deployVpToken());
    it("Should return 0%", async () => {
      const weightedPercentage = await vpToken.getWeightedVotingPowerPercentage(
        0,
        100
      );
      expect(weightedPercentage.toNumber()).equal(0);
    });

    it("Should return 100%", async () => {
      const votingPowerPercent = bn(100);
      const weight = 100;
      const expectedBalance = bn(100).mul(precision);

      const weightedPercentage = await vpToken.getWeightedVotingPowerPercentage(
        weight,
        votingPowerPercent.mul(precision)
      );
      expect(weightedPercentage.toString()).equal(expectedBalance.toString());
    });
    it("Should return 50%", async () => {
      const votingPowerPercent = bn(100); // 100% voting power
      const weight = 50; // 50% weight
      const expectedBalance = bn(50).mul(precision);

      const weightedPercentage = await vpToken.getWeightedVotingPowerPercentage(
        weight,
        votingPowerPercent.mul(precision)
      );
      expect(weightedPercentage.toString()).equal(expectedBalance.toString());
    });
    it("Should return 25%", async () => {
      const votingPowerPercent = bn(50); // 50% voting power
      const weight = 50; // 50% weight
      const expectedBalance = bn(25).mul(precision);

      const weightedPercentage = await vpToken.getWeightedVotingPowerPercentage(
        weight,
        votingPowerPercent.mul(precision)
      );
      expect(weightedPercentage.toString()).equal(expectedBalance.toString());
    });
    it("Should return 9%", async () => {
      const votingPowerPercent = bn(90); // 1% voting power
      const weight = 10; // 30% weight
      const expectedBalance = bn(9).mul(precision);

      const weightedPercentage = await vpToken.getWeightedVotingPowerPercentage(
        weight,
        votingPowerPercent.mul(precision)
      );
      expect(weightedPercentage.toString()).equal(expectedBalance.toString());
    });

    it("Should return 1.5% ", async () => {
      const votingPowerPercent = bn(3); // 1% voting power
      const weight = 50; // 30% weight
      const expectedBalance = bn(1.5).mul(precision);

      const weightedPercentage = await vpToken.getWeightedVotingPowerPercentage(
        weight,
        votingPowerPercent.mul(precision)
      );
      expect(weightedPercentage.toString()).equal(expectedBalance.toString());
    });
    it("Should return 0.3%", async () => {
      const votingPowerPercent = bn(1); // 1% voting power
      const weight = 30; // 30% weight
      const expectedBalance = bn(0.3).mul(precision);

      const weightedPercentage = await vpToken.getWeightedVotingPowerPercentage(
        weight,
        votingPowerPercent.mul(precision)
      );
      expect(weightedPercentage.toString()).equal(expectedBalance.toString());
    });
    it("Should return 0.01% ", async () => {
      const votingPowerPercent = bn(0.1); // 0.1% voting power
      const weight = 10; // 10% weight
      const expectedBalance = bn(0.01).mul(precision);

      const weightedPercentage = await vpToken.getWeightedVotingPowerPercentage(
        weight,
        votingPowerPercent.mul(precision)
      );
      expect(weightedPercentage.toString()).equal(expectedBalance.toString());
    });
  });

  describe("Voting power", () => {
    beforeEach(async () => {
      await deployVpToken();
    });
    it("Should return correct voting power", async () => {
      await mintAll();
      const holder = accounts[1];

      const repSnapshotId = await repToken.getCurrentSnapshotId();
      const vpTokenSnapshotId = await vpToken.getCurrentSnapshotId();

      const repSnapshotIdFromVptoken =
        await vpToken.getTokenSnapshotIdFromVPSnapshot(
          repToken.address,
          vpTokenSnapshotId
        );

      // Internal snapshots mapping shoud be updated
      expect(repSnapshotIdFromVptoken.toNumber()).equal(
        repSnapshotId.toNumber()
      );

      const repBalance = await repToken.balanceOf(holder);
      const repSupply = await repToken.totalSupply();

      const repVotingPowerPercent = bn(
        await vpToken.getPercent(repBalance, repSupply)
      );

      const repTokenWeight = bn(await vpToken.getTokenWeight(repToken.address));

      const repVotingPowerPercentWeighted = bn(
        await vpToken.getWeightedVotingPowerPercentage(
          repTokenWeight,
          repVotingPowerPercent
        )
      );

      const dxdInfluenceBalance = await dxdInfluence.balanceOf(holder);
      const dxdInfluenceSupply = await dxdInfluence.totalSupply();
      const dxdInfluenceVotingPowerPercent = bn(
        await vpToken.getPercent(dxdInfluenceBalance, dxdInfluenceSupply)
      );
      const dxdInfluenceTokenWeight = bn(
        await vpToken.getTokenWeight(dxdInfluence.address)
      );

      const dxdInfluenceVotingPowerPercentWeighted = bn(
        await vpToken.getWeightedVotingPowerPercentage(
          dxdInfluenceTokenWeight,
          dxdInfluenceVotingPowerPercent
        )
      );

      const expectedTotalVotingPowerPercentPowered =
        repVotingPowerPercentWeighted
          .add(dxdInfluenceVotingPowerPercentWeighted)
          .toString();
      const votingPower = await vpToken.balanceOfAt(holder, vpTokenSnapshotId);

      expect(votingPower.toString()).equal(
        expectedTotalVotingPowerPercentPowered
      );
    });

    it("Should return 100% voting power when has 100% rep supply & staking has 0 supply", async () => {
      const holder = repHolders[1].account;
      const balance = repHolders[1].amount;
      const expectedVotingPowerPercent = 100;

      await repToken.mint(holder, balance);
      expect(bn(await repToken.balanceOf(holder)).eq(bn(balance))).to.be.true;

      const repTokenWeight = bn(await vpToken.getTokenWeight(repToken.address));

      expect(repTokenWeight.toString()).equal("100");

      const votingPower = bn(await vpToken.balanceOf(holder));

      expect(votingPower.div(precision).toNumber()).equal(
        expectedVotingPowerPercent
      );
    });

    it("Should return 50% voting power", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = 250;
      const balance2 = 250;
      const expectedVotingPowerPercent = 50; // 50%

      await repToken.mint(holder1, balance1);
      await repToken.mint(holder2, balance2);

      expect(bn(await repToken.balanceOf(holder1)).toNumber()).equal(balance1);
      expect(bn(await repToken.totalSupply()).toNumber()).equal(
        balance1 + balance2
      );

      const repTokenWeight = bn(
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();

      // No staking tokens locked - 100% weight to rep token
      expect(repTokenWeight).equal(100);

      const votingPower = bn(await vpToken.balanceOf(holder1));

      expect(votingPower.div(precision).toNumber()).equal(
        expectedVotingPowerPercent
      );
    });

    it("Should return 1.8% voting power with 2%rep, 1.6% stake & 50% 50% weigths", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const repDistribution = [8, 392]; // 2% | 98%
      const stakeDistribution = [16, 984]; // 1.6% | 98.4%
      const expectedHolder1VP = 1800000000000000000; // 1.8%;
      const expectedHolder2VP = precision.mul(98.2).toNumber();

      await repToken.mintMultiple([holder1, holder2], repDistribution);

      await mintApproveStake(holder1, bn(stakeDistribution[0]));
      await mintApproveStake(holder2, bn(stakeDistribution[1]));

      const votingPower1 = bn(await vpToken.balanceOf(holder1));
      const votingPower2 = bn(await vpToken.balanceOf(holder2));
      expect(votingPower1.toNumber()).equal(expectedHolder1VP);
      expect(votingPower2.toNumber()).equal(expectedHolder2VP);
    });

    it("Should return 1% voting power", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = 1; // 0 %
      const balance2 = 99; // 99 %
      const expectedVotingPowerPercent = bn(1);

      await repToken.mint(holder1, balance1);
      await repToken.mint(holder2, balance2);

      // Staking tokens locked < minimum so 100% weight to rep token
      expect((await vpToken.getTokenWeight(repToken.address)).toNumber()).equal(
        100
      );

      const votingPower = bn(await vpToken.balanceOf(holder1));

      expect(votingPower.toString()).equal(
        bn(expectedVotingPowerPercent.mul(precision)).toString()
      );
    });

    it("Should return 0.5% voting power if repVotingPower=1%, stakingVotingpower=0% and staking supply > minStakingTokensLocked", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = 1;
      const balance2 = 99;
      const expectedVotingPowerPercent = 0.5; // 0.5%

      await repToken.mint(holder1, balance1); // 1% rep
      await repToken.mint(holder2, balance2); // 99% rep

      // holder2 stake 100% of stakingToken supply
      await mintApproveStake(holder2, 300);

      expect(
        bn(await vpToken.getTokenWeight(repToken.address)).toNumber()
      ).equal(50);

      const votingPower = bn(await vpToken.balanceOf(holder1));

      expect(votingPower.div(precision).toNumber()).equal(
        expectedVotingPowerPercent
      );
    });

    it("Should return 0.001% voting power", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = 200; // 0.001 %
      const balance2 = 19999800; // 99,999 %
      const expectedVotingPowerPercent = bn(0.001); // 0.001%

      await repToken.mint(holder1, balance1);
      await repToken.mint(holder2, balance2);

      // Staking tokens locked < minimum so 100% weight to rep token
      expect((await vpToken.getTokenWeight(repToken.address)).toNumber()).equal(
        100
      );

      const votingPower = bn(await vpToken.balanceOf(holder1));

      expect(votingPower.toString()).equal(
        bn(expectedVotingPowerPercent.mul(precision)).toString()
      );
    });

    it("Should return 100 : 0.0000000000000001% voting power", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = bn(1);
      const balance2 = precision.sub(balance1);
      const percent1 = 0.0000000000000001;
      const expectedVotingPowerPercent = bn(percent1).mul(precision);

      await repToken.mint(holder1, balance1);
      await repToken.mint(holder2, balance2);

      const repTokenWeight = (
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();

      // Staking tokens locked < minimum so 100% weight to rep token
      expect(repTokenWeight).equal(100);

      const votingPower = bn(await vpToken.balanceOf(holder1));

      expect(votingPower.toNumber()).equal(
        expectedVotingPowerPercent.toNumber()
      );
    });

    it("Should return min unit 1 VP : 0.000000000000000001% voting power", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = bn(1);
      const balance2 = precision.mul(100).sub(balance1);
      const percent1 = 0.000000000000000001;
      const expectedVotingPowerPercent = bn(percent1).mul(precision);

      await repToken.mint(holder1, balance1);
      await repToken.mint(holder2, balance2);

      const repTokenWeight = (
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();

      // Staking tokens locked < minimum so 100% weight to rep token
      expect(repTokenWeight).equal(100);

      const votingPower = bn(await vpToken.balanceOf(holder1));

      expect(votingPower.toNumber()).equal(
        expectedVotingPowerPercent.toNumber()
      );
    });

    it("Should return 0% if snapshot=0", async () => {
      const snapshotId = (await vpToken.getCurrentSnapshotId()).toNumber();
      expect(snapshotId).equal(1);
      await mintAll();
      expect((await vpToken.getCurrentSnapshotId()).toNumber()).equal(
        snapshotId + stakeHolders.length + 1 // Stake fn snapshot per each stake() call. Rep mintmultiple 1 single snapshot
      );

      const votingPower = await vpToken.balanceOfAt(
        repHolders[0].account,
        snapshotId
      );
      expect(votingPower.toNumber()).equal(0);
    });

    it("Should return 0% voting power if user has no rep balance nor staking token balance", async () => {
      const user = accounts[9]; // has no balance
      await mintAll();
      expect((await vpToken.getCurrentSnapshotId()).toNumber()).gt(0);

      const votingPower = await vpToken.balanceOf(user);
      expect(votingPower.toNumber()).equal(0);
    });

    it("Should return 0 if votingPower < minUnit (1e-18). 0.000000000000000001% voting power", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = bn(1);
      const balance2 = precision.mul(1000).sub(balance1);
      const percent1 = 0.0000000000000000001;

      await repToken.mint(holder1, balance1);
      await repToken.mint(holder2, balance2);

      const repTokenWeight = (
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();

      // Staking tokens locked < minimum so 100% weight to rep token
      expect(repTokenWeight).equal(100);

      const votingPower = bn(await vpToken.balanceOf(holder1));

      expect(bn(percent1).mul(precision).toNumber()).equal(0.1);
      expect(votingPower.toNumber()).equal(0);
    });
  });

  describe("getTokenWeight", () => {
    it("Should receive only rep or staking token", async () => {
      await deployVpToken();
      const anyAddress = accounts[9];
      await expectRevert(
        vpToken.getTokenWeight(anyAddress),
        "VotingPowerToken_InvalidTokenAddress"
      );
    });
    it("Should return 0 for stakingToken if staking token totalSupply is less than minStakingTokensLocked", async () => {
      await deployVpToken();
      expect(
        (await vpToken.getTokenWeight(dxdInfluence.address)).toNumber()
      ).equal(0);
    });
    it("Should return 100 for reptoken if staking token totalSupply is less than minStakingTokensLocked", async () => {
      await deployVpToken();
      expect((await vpToken.getTokenWeight(repToken.address)).toNumber()).equal(
        100
      );
    });
    it("Should return config value if staking token totalSupply is >= than minStakingTokensLocked", async () => {
      await deployVpToken();
      await mintApproveStake(accounts[1], minStakingTokensLocked);
      expect((await dxdStake.totalSupply()).toNumber()).equal(
        minStakingTokensLocked
      );
      expect((await vpToken.getTokenWeight(repToken.address)).toNumber()).equal(
        repTokenWeight
      );
      expect(
        (await vpToken.getTokenWeight(dxdInfluence.address)).toNumber()
      ).equal(stakeTokenWeight);
    });
  });

  describe("setMinStakingTokensLocked", () => {
    beforeEach(async () => await deployVpToken());
    it("Should set new minStakingTokensLocked", async () => {
      const minTokensLocked = await vpToken.minStakingTokensLocked();
      expect(minTokensLocked.toNumber()).equal(minStakingTokensLocked); // default minTokens during initialization
      await vpToken.setMinStakingTokensLocked(400);
      const minTokensLocked2 = await vpToken.minStakingTokensLocked();
      expect(minTokensLocked2.toNumber()).equal(400);
    });
    it("Should fail if caller is not the owner", async () => {
      await expectRevert(
        vpToken.setMinStakingTokensLocked(400, { from: accounts[2] }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Snapshot", () => {
    beforeEach(async () => await deployVpToken());
    it("Callback function should increment snapshot", async () => {
      const calls = Array.from(Array(100))
        .fill()
        .map((_, i) => i + 1);
      for (let call of calls) {
        expect((await vpToken.getCurrentSnapshotId()).toNumber()).equal(call);
        await repToken.mint(accounts[1], 100);
      }
    });
  });

  describe("Total Supply", () => {
    it("Should return 100%", async () => {
      await deployVpToken();
      const totalSupply = bn(await vpToken.totalSupply());
      expect(totalSupply.div(precision).toNumber()).equal(100);
    });
  });

  it("Should revert transfer function", async () => {
    await deployVpToken();
    await expectRevert(
      vpToken.transfer(accounts[1], 200),
      "VotingPowerToken: Cannot call transfer function"
    );
  });

  it("Should revert allowance function", async () => {
    await deployVpToken();
    await expectRevert(
      vpToken.allowance(accounts[1], accounts[2]),
      "VotingPowerToken: Cannot call allowance function"
    );
  });

  it("Should revert approve function", async () => {
    await deployVpToken();
    await expectRevert(
      vpToken.approve(accounts[1], 200),
      "VotingPowerToken: Cannot call approve function"
    );
  });

  it("Should revert transferFrom function", async () => {
    await deployVpToken();
    await expectRevert(
      vpToken.transferFrom(accounts[1], accounts[2], 200),
      "VotingPowerToken: Cannot call transferFrom function"
    );
  });
});
