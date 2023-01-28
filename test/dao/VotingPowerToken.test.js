const { expectRevert } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const VotingPowerToken = artifacts.require("./VotingPowerToken.sol");
const DAOReputation = artifacts.require("DAOReputation.sol");
const DXDStakeMock = artifacts.require("DXDStakeMock.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");

contract("VotingPowerToken", function (accounts) {
  let repToken;
  let stakingToken;
  let vpToken;
  let owner = accounts[0];
  let precision;
  let dxd;
  const repTokenWeight = 50;
  const stakeTokenWeight = 50;
  const minStakingTokensLocked = 100;

  const repHolders = [
    { account: accounts[1], amount: 160 },
    { account: accounts[2], amount: 320 },
  ];
  const stakeHolders = [
    { account: accounts[1], amount: 340 },
    { account: accounts[2], amount: 110 },
  ];

  const restore = () => {
    repToken = null;
    stakingToken = null;
    dxd = null;
    vpToken = null;
    precision = null;
  };

  const deployVpToken = async (config = {}) => {
    restore();
    repToken = await DAOReputation.new({
      from: owner,
    });

    stakingToken = await DXDStakeMock.new({
      from: owner,
    });

    dxd = await ERC20Mock.new("DXDDD", "WDXD", 50000, accounts[0]);

    vpToken = await VotingPowerToken.new({ from: owner });

    await repToken.initialize("Reputation", "REP", vpToken.address);

    await stakingToken.initialize(
      dxd.address,
      accounts[0],
      "DXdao",
      "DXD",
      vpToken.address
    );

    await vpToken.initialize(
      config.repTokenAddress || repToken.address,
      config.stakingTokenAddress || stakingToken.address,
      config.repWeight || repTokenWeight,
      config.stakeWeight || stakeTokenWeight,
      config.minStakingTokensLocked || minStakingTokensLocked
    );

    precision = (await vpToken.precision()).toNumber();
  };
  const mintAll = async () => {
    await Promise.all(
      stakeHolders.map(({ account, amount }) =>
        stakingToken.stake(amount, {
          from: account,
        })
      )
    );

    await Promise.all(
      repHolders.map(({ account, amount }) => repToken.mint(account, amount))
    );
  };
  const burnAll = async () => {
    await Promise.all(
      stakeHolders.map(({ account, amount }) =>
        stakingToken.withdraw(amount, {
          from: account,
        })
      )
    );

    await Promise.all(
      repHolders.map(({ account, amount }) => repToken.burn(account, amount))
    );
  };
  // beforeEach(async () => {
  //   await deployVpToken();
  // });

  describe("initialize", () => {
    it("Should not initialize 2 times", async () => {
      await deployVpToken();
      await expectRevert(
        vpToken.initialize(repToken.address, stakingToken.address, 50, 50, 100),
        "Initializable: contract is already initialized"
      );
    });
    it("Should do _snapshot()", async () => {
      await deployVpToken();
      expect((await vpToken.getCurrentSnapshotId()).toNumber()).equal(1);
    });
    it("Should fail if repToken and StakingToken addresses are the same", async () => {
      vpToken = await VotingPowerToken.new({ from: owner });

      await expectRevert(
        vpToken.initialize(
          accounts[8],
          accounts[8],
          repTokenWeight,
          stakeTokenWeight,
          minStakingTokensLocked
        ),
        "Rep token and staking token cannot be the same."
      );
    });

    it("Should update token weights", async () => {
      await deployVpToken();
      expect(
        (await vpToken.getConfigTokenWeight(stakingToken.address)).toNumber()
      ).equal(stakeTokenWeight);
      expect(
        (await vpToken.getConfigTokenWeight(repToken.address)).toNumber()
      ).equal(repTokenWeight);
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
      // await burnAll();
      expect((await stakingToken.totalSupply()).toNumber()).equal(0);

      // update config to be 50% 50%
      await vpToken.setComposition(50, 50);

      const repWeight = await vpToken.getTokenWeight(repToken.address);
      expect(repWeight.toNumber()).equal(100);

      const stakingWeight = await vpToken.getTokenWeight(stakingToken.address);
      expect(stakingWeight.toNumber()).equal(0);
    });
    it("Should not allow to update composition if one or both weights are 0 or less", async () => {
      await expectRevert(
        vpToken.setComposition(0, 0),
        "At least one token weight must be greater than zero"
      );
    });
    it("Should not allow to update composition one or both weights are > 100", async () => {
      await expectRevert(
        vpToken.setComposition(101, 50),
        "Weights cannot be bigger than 100"
      );
      await expectRevert(
        vpToken.setComposition(20, 200),
        "Weights cannot be bigger than 100"
      );
      await expectRevert(
        vpToken.setComposition(101, 130),
        "Weights cannot be bigger than 100"
      );
    });
    it("Should fail if the sum of both weigths is not 100", async () => {
      await expectRevert(
        vpToken.setComposition(50, 51),
        "Weights sum must be equal to 100"
      );
      await expectRevert(
        vpToken.setComposition(51, 50),
        "Weights sum must be equal to 100"
      );
      await expectRevert(
        vpToken.setComposition(80, 30),
        "Weights sum must be equal to 100"
      );
    });
    it("Should be called only by the owner", async () => {
      await expectRevert(
        vpToken.setComposition(50, 50, { from: accounts[3] }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("_getVotingPower", () => {
    beforeEach(async () => await deployVpToken());
    it("Should return 10%", async () => {
      const votingPower = await vpToken._getVotingPower(10, 100);
      expect(votingPower.toNumber()).equal(10 * precision);
    });

    it("Should return 100%", async () => {
      const votingPower = await vpToken._getVotingPower(100, 100);
      expect(votingPower.toNumber()).equal(100 * precision);
    });

    it("Should return 1%", async () => {
      const votingPower = await vpToken._getVotingPower(1, 100);
      expect(votingPower.toNumber()).equal(1 * precision);
    });

    it("Should return 0.03%", async () => {
      const expectedVotingPowerPercent = 0.03;
      const supply = 100000;
      const balance = Math.round((expectedVotingPowerPercent / 100) * supply);

      const votingPower = await vpToken._getVotingPower(balance, supply);
      expect(votingPower.toNumber() / precision).equal(
        expectedVotingPowerPercent
      );
    });

    it("Should return 0%", async () => {
      const votingPower = await vpToken._getVotingPower(0, 100);
      expect(votingPower.toNumber()).equal(0 * precision);
    });

    it("Should return revert if balance > total", async () => {
      await expectRevert(
        vpToken._getVotingPower(101, 100),
        "Invalid balance or totalSupply"
      );
    });
  });

  describe("_getWeightedPercentage", () => {
    beforeEach(async () => await deployVpToken());
    it("Should return 0%", async () => {
      const weightedPercentage = await vpToken._getWeightedPercentage(0, 100);
      expect(weightedPercentage.toNumber()).equal(0);
    });

    it("Should return 100%", async () => {
      const votingPowerPercent = 100; // 100%
      const votingPowerPercentPoweredByPrecision =
        votingPowerPercent * precision; //10_000_000_000
      const weightPercent = 100; // 50%
      const expectedResult =
        votingPowerPercent * (weightPercent / 100) * precision; // 1.5

      const weightedPercentage = await vpToken._getWeightedPercentage(
        weightPercent,
        votingPowerPercentPoweredByPrecision
      );
      expect(weightedPercentage.toNumber()).equal(expectedResult);
    });
    it("Should return 1.5% ", async () => {
      const votingPowerPercent = 3; // 3%
      const votingPowerPercentPoweredByPrecision =
        votingPowerPercent * precision; //30_000_000
      const weightPercent = 50; // 50%
      const expectedResult =
        votingPowerPercent * (weightPercent / 100) * precision; // 1.5

      const weightedPercentage = await vpToken._getWeightedPercentage(
        weightPercent,
        votingPowerPercentPoweredByPrecision
      );
      expect(weightedPercentage.toNumber()).equal(expectedResult);
    });
  });

  describe("Voting power", () => {
    beforeEach(async () => {
      await deployVpToken();
    });
    it("Should return correct voting power", async () => {
      await mintAll();
      const holder = repHolders[0].account;
      const balance = repHolders[0].amount;

      expect((await repToken.balanceOf(holder)).toNumber()).equal(balance);

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
      const repVotingPowerPercent =
        (repBalance.toNumber() * 100) / repSupply.toNumber();

      const repTokenWeight = (
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();

      const repVotingPowerPercentWeighted =
        repVotingPowerPercent * (repTokenWeight / 100) * precision;

      const stakingBalance = await stakingToken.balanceOf(holder);
      const stakingSupply = await stakingToken.totalSupply();
      const stakingVotingPowerPercent =
        (stakingBalance.toNumber() * 100) / stakingSupply.toNumber();

      const stakingTokenWeight = (
        await vpToken.getTokenWeight(stakingToken.address)
      ).toNumber();

      const stakeVotingPowerPercentWeighted =
        stakingVotingPowerPercent * (stakingTokenWeight / 100) * precision;

      const expectedTotalVotingPowerPercentPowered =
        Math.floor(repVotingPowerPercentWeighted) +
        Math.floor(stakeVotingPowerPercentWeighted);
      const votingPower = await vpToken.getVotingPowerPercentageOfAt(
        holder,
        vpTokenSnapshotId
      );

      expect(votingPower.toNumber()).equal(
        expectedTotalVotingPowerPercentPowered
      );
    });
    it("Should return 100% voting power when has 100% rep supply & staking has 0 supply", async () => {
      const holder = repHolders[1].account;
      const balance = repHolders[1].amount;
      const expectedVotingPowerPercent = 100;

      await repToken.mint(holder, balance);
      expect((await repToken.balanceOf(holder)).toNumber()).equal(balance);

      const repTokenWeight = (
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();

      expect(repTokenWeight).equal(100);

      const votingPower = await vpToken.getVotingPowerPercentageOf(holder);

      expect(votingPower.toNumber() / precision).equal(
        expectedVotingPowerPercent
      );
    });
    it("Should return 50% voting power", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = 250;
      const balance2 = 250;
      const expectedVotingPowerPercent = 50; // 50%:  (balance1/(balance1 + balance2))*100

      await repToken.mint(holder1, balance1);
      await repToken.mint(holder2, balance2);

      expect((await repToken.balanceOf(holder1)).toNumber()).equal(balance1);
      expect((await repToken.totalSupply()).toNumber()).equal(
        balance1 + balance2
      );

      const repTokenWeight = (
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();

      // No staking tokens locked - 100% weight to rep token
      expect(repTokenWeight).equal(100);

      const votingPower = await vpToken.getVotingPowerPercentageOf(holder1);

      expect(votingPower.toNumber() / precision).equal(
        expectedVotingPowerPercent
      );
    });
    it("Should return 0% if snapshot=0", async () => {
      await mintAll();
      expect((await vpToken.getCurrentSnapshotId()).toNumber()).not.equal(0);
      const votingPower = await vpToken.getVotingPowerPercentageOfAt(
        repHolders[0].account,
        0
      );
      expect(votingPower.toNumber()).equal(0);
    });
    it("Should return 0% voting power if user has no rep balance nor staking token balance", async () => {
      const user = accounts[9]; // has no balance
      await mintAll();
      expect((await vpToken.getCurrentSnapshotId()).toNumber()).gt(0);

      const votingPower = await vpToken.getVotingPowerPercentageOf(user);
      expect(votingPower.toNumber()).equal(0);
    });
    it("Should return 0.5% voting power if repVotingPower=1%, stakingVotingpower=0% and staking supply > minStakingTokensLocked", async () => {
      await vpToken.setComposition(50, 50);
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = 1;
      const balance2 = 99;
      const expectedVotingPowerPercent = 0.5; // 0.5%

      await repToken.mint(holder1, balance1); // 1% rep
      await repToken.mint(holder2, balance2); // 99% rep
      await stakingToken.stake(300, {
        // 100% rep to holder2
        from: holder2,
      });

      const repTokenWeight = (
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();
      // Staking tokens locked > minimum so 50% weight to rep token
      expect(repTokenWeight).equal(50);

      const votingPower = await vpToken.getVotingPowerPercentageOf(holder1);

      expect(votingPower.toNumber() / precision).equal(
        expectedVotingPowerPercent
      );
    });
    it("Should return 0.001% voting power", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = 200; // 0.001 %
      const balance2 = 19999800; // 99,999 %
      const expectedVotingPowerPercent = 0.001; // 0.001%

      await repToken.mint(holder1, balance1);
      await repToken.mint(holder2, balance2);

      const repTokenWeight = (
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();

      // Staking tokens locked < minimum so 100% weight to rep token
      expect(repTokenWeight).equal(100);

      const votingPower = await vpToken.getVotingPowerPercentageOf(holder1);

      expect(votingPower.toNumber() / precision).equal(
        expectedVotingPowerPercent
      );
    });
    it("Should return 0.000001% voting power", async () => {
      const holder1 = repHolders[0].account;
      const holder2 = repHolders[1].account;
      const balance1 = 1;
      const balance2 = precision - 1;
      const expectedVotingPowerPercent = (1 * 100) / precision; // 0.000001%
      const expectedVotingPowerPercentPowered =
        expectedVotingPowerPercent * precision; // 100

      await repToken.mint(holder2, balance2);
      await repToken.mint(holder1, balance1);

      const repTokenWeight = (
        await vpToken.getTokenWeight(repToken.address)
      ).toNumber();

      // Staking tokens locked < minimum so 100% weight to rep token
      expect(repTokenWeight).equal(100);

      const votingPower = await vpToken.getVotingPowerPercentageOf(holder1);
      expect(votingPower.toNumber()).equal(expectedVotingPowerPercentPowered);
    });
  });

  describe("getTokenWeight", () => {
    it("Should receive only rep or staking token", async () => {
      await deployVpToken();
      const anyAddress = accounts[9];
      await expectRevert(
        vpToken.getTokenWeight(anyAddress),
        "VotingPowerToken: Invalid token address"
      );
    });
    it("Should return 0 for stakingToken if staking token totalSupply is less than minStakingTokensLocked", async () => {
      await deployVpToken();
      expect(
        (await vpToken.getTokenWeight(stakingToken.address)).toNumber()
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
      await stakingToken.stake(minStakingTokensLocked, {
        from: accounts[1],
      });
      expect((await stakingToken.totalSupply()).toNumber()).equal(
        minStakingTokensLocked
      );
      expect((await vpToken.getTokenWeight(repToken.address)).toNumber()).equal(
        repTokenWeight
      );
      expect(
        (await vpToken.getTokenWeight(stakingToken.address)).toNumber()
      ).equal(stakeTokenWeight);
    });
  });
});
