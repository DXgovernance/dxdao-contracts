import * as helpers from "../helpers";

const ERC20GuildLockable = artifacts.require("ERC20GuildLockable.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const {
  BN,
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");
const { createDAO, createAndSetupGuildToken } = require("../helpers/guild");

require("chai").should();

contract("ERC20GuildLockable", function (accounts) {
  let walletScheme, daoCreator, org, actionMock, votingMachine, guildToken;

  let erc20GuildLockable,
    genericCallDataVote,
    callData,
    genericCallData,
    proposalId;

  const TEST_HASH = helpers.SOME_HASH;

  const TIMELOCK = new BN("60");

  describe("ERC20GuildLockable", function () {
    beforeEach(async function () {
      const guildTokenBalances = [
        new BN("1000"),
        new BN("50"),
        new BN("100"),
        new BN("100"),
        new BN("100"),
        new BN("200"),
      ];

      guildToken = await createAndSetupGuildToken(
        accounts.slice(0, 6),
        guildTokenBalances
      );

      actionMock = await ActionMock.new();

      erc20GuildLockable = await ERC20GuildLockable.new();
      await erc20GuildLockable.initialize(
        guildToken.address,
        new BN("0"),
        new BN("200"),
        new BN("100"),
        TIMELOCK
      );

      // ensure lock time is set in the contract
      (await erc20GuildLockable.lockTime()).should.be.bignumber.equal(TIMELOCK);

      const createDaoResult = await createDAO(erc20GuildLockable, accounts);
      daoCreator = createDaoResult.daoCreator;
      walletScheme = createDaoResult.walletScheme;
      votingMachine = createDaoResult.votingMachine;
      org = createDaoResult.org;

      callData = helpers.testCallFrom(org.avatar.address);
      genericCallData = helpers.encodeGenericCallData(
        org.avatar.address,
        actionMock.address,
        callData,
        0
      );

      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        TEST_HASH
      );
      proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      genericCallDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods
        .vote(proposalId, 1, 0, helpers.NULL_ADDRESS)
        .encodeABI();
    });

    it("cannot initialize with zero locktime", async function () {
      erc20GuildLockable = await ERC20GuildLockable.new();
      await expectRevert(
        erc20GuildLockable.initialize(
          guildToken.address,
          new BN("0"),
          new BN("200"),
          new BN("100"),
          new BN("0")
        ),
        "ERC20Guild: lockTime should be higher than zero"
      );
    });

    it("cannot setConfig with zero locktime", async function () {
      erc20GuildLockable = await ERC20GuildLockable.new();
      await erc20GuildLockable.initialize(
        guildToken.address,
        new BN("0"),
        new BN("200"),
        new BN("100"),
        new BN("1000")
      );
      await expectRevert(
        erc20GuildLockable.setConfig(
          new BN("0"),
          new BN("200"),
          new BN("100"),
          new BN("0")
        ),
        "ERC20Guild: lockTime should be higher than zero"
      );
    });

    it("cannot setConfig externally", async function () {
      erc20GuildLockable = await ERC20GuildLockable.new();
      await erc20GuildLockable.initialize(
        guildToken.address,
        new BN("0"),
        new BN("200"),
        new BN("100"),
        new BN("1000")
      );

      await expectRevert(
        erc20GuildLockable.setConfig(
          new BN("0"),
          new BN("200"),
          new BN("100"),
          new BN("100")
        ),
        "ERC20Guild: Only callable by ERC20guild itself when initialized"
      );
    });

    it("can lock tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, 50, {
        from: accounts[1],
      });

      const tx = await erc20GuildLockable.lockTokens(50, { from: accounts[1] });
      expectEvent(tx, "TokensLocked", { voter: accounts[1], value: "50" });

      const now = await time.latest();
      const { amount, timestamp } = await erc20GuildLockable.tokensLocked(
        accounts[1]
      );
      amount.should.be.bignumber.equal("50");
      timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20GuildLockable.methods["votesOf(address)"](
        accounts[1]
      );
      votes.should.be.bignumber.equal("50");

      const totalLocked = await erc20GuildLockable.totalLocked();
      totalLocked.should.be.bignumber.equal("50");
    });

    it("can release tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, new BN("50"), {
        from: accounts[2],
      });

      const txLock = await erc20GuildLockable.lockTokens(new BN("50"), {
        from: accounts[2],
      });
      expectEvent(txLock, "TokensLocked", { voter: accounts[2], value: "50" });

      let votes = await erc20GuildLockable.methods["votesOf(address)"](
        accounts[2]
      );
      votes.should.be.bignumber.equal("50");

      let totalLocked = await erc20GuildLockable.totalLocked();
      totalLocked.should.be.bignumber.equal("50");

      // move past the time lock period
      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      const txRelease = await erc20GuildLockable.releaseTokens(new BN("50"), {
        from: accounts[2],
      });
      expectEvent(txRelease, "TokensReleased", {
        voter: accounts[2],
        value: "50",
      });

      votes = await erc20GuildLockable.methods["votesOf(address)"](accounts[2]);
      votes.should.be.bignumber.equal("0");

      totalLocked = await erc20GuildLockable.totalLocked();
      totalLocked.should.be.bignumber.equal("0");
    });

    it("cannot release more token than locked", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, new BN("50"), {
        from: accounts[2],
      });

      const txLock = await erc20GuildLockable.lockTokens(new BN("50"), {
        from: accounts[2],
      });
      expectEvent(txLock, "TokensLocked", { voter: accounts[2], value: "50" });

      // move past the time lock period
      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      await expectRevert(
        erc20GuildLockable.releaseTokens(new BN("100"), { from: accounts[2] }),
        "ERC20GuildLockable: Unable to release more tokens than locked"
      );
    });

    it("cannot release before end of timelock", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, new BN("50"), {
        from: accounts[2],
      });

      const txLock = await erc20GuildLockable.lockTokens(new BN("50"), {
        from: accounts[2],
      });
      expectEvent(txLock, "TokensLocked", { voter: accounts[2], value: "50" });

      await expectRevert(
        erc20GuildLockable.releaseTokens(new BN("25"), { from: accounts[2] }),
        "ERC20GuildLockable: Tokens still locked"
      );
    });

    it("cannot transfer locked tokens", async function () {
      let bal = await guildToken.balanceOf(accounts[2]);
      bal.should.be.bignumber.equal("100");

      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(erc20GuildLockable.address, new BN("100"), {
        from: accounts[2],
      });

      const txLock = await erc20GuildLockable.lockTokens(new BN("100"), {
        from: accounts[2],
      });
      expectEvent(txLock, "TokensLocked", { voter: accounts[2], value: "100" });

      bal = await guildToken.balanceOf(accounts[2]);
      bal.should.be.bignumber.equal("0");

      await expectRevert(
        guildToken.transfer(accounts[0], new BN("50"), { from: accounts[2] }),
        "ERC20: transfer amount exceeds balance"
      );
    });
  });
});
