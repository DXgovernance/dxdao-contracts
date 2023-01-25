const { expectRevert } = require("@openzeppelin/test-helpers");
const { describe } = require("pm2");
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
  let burnAll;
  const repTokenWeight = 50;
  const stakeTOkenWeight = 50;
  const minStakingTokensLocked = 100;

  const repHolders = [
    { account: accounts[1], amount: 160 },
    { account: accounts[2], amount: 320 },
  ];
  const stakeHolders = [
    { account: accounts[1], amount: 340 },
    { account: accounts[2], amount: 110 },
  ];
  beforeEach(async () => {
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
      repToken.address,
      stakingToken.address,
      repTokenWeight,
      stakeTOkenWeight,
      minStakingTokensLocked
    );

    precision = (await vpToken.precision()).toNumber();

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

    burnAll = async () => {
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
  });

  describe("initialize", () => {
    it("Should not initialize 2 times", async () => {
      await expectRevert(
        vpToken.initialize(repToken.address, stakingToken.address, 50, 50, 100),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("Composition", () => {
    it("Should use 50% 50% if staking token supply > _minStakingTokensLocked", async () => {
      // update config to be 50% 50%
      await vpToken.updateComposition(50, 50);
      const repWeight = await vpToken.getTokenWeight(repToken.address);
      expect(repWeight.toNumber()).equal(50);
    });
    it("Should use 100% weight of rep if staking token supply < _minStakingTokensLocked", async () => {
      await burnAll();
      expect((await stakingToken.totalSupply()).toNumber()).equal(0);

      // update config to be 50% 50%
      await vpToken.updateComposition(50, 50);

      const repWeight = await vpToken.getTokenWeight(repToken.address);
      expect(repWeight.toNumber()).equal(100);

      const stakingWeight = await vpToken.getTokenWeight(stakingToken.address);
      expect(stakingWeight.toNumber()).equal(0);
    });
  });

  describe("_getVotingPower", () => {
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

  describe("getVotingPowerPercentageOfAt", () => {
    it("Should return correct voting power", async () => {
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
  });
});
