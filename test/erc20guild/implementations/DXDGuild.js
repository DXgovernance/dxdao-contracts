import { ZERO_ADDRESS } from "@openzeppelin/test-helpers/src/constants";
import * as helpers from "../../helpers";
const {
  createAndSetupGuildToken,
  setVotesOnProposal,
} = require("../../helpers/guild");
const {
  BN,
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");

const DXDGuild = artifacts.require("DXDGuild.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const ERC20Mock = artifacts.require("ERC20Mock.sol");
const WalletScheme = artifacts.require("WalletScheme.sol");

require("chai").should();

contract("DXDGuild", function (accounts) {
  const constants = helpers.constants;
  const TIMELOCK = new BN("60");
  const VOTE_GAS = new BN("50000"); // 50k
  const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei

  let dxDao,
    actionMock,
    guildToken,
    dxdGuild,
    tokenVault,
    walletSchemeProposalId;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 5),
      [0, 50, 100, 100, 250]
    );
    dxdGuild = await DXDGuild.new();

    const votingMachineToken = await ERC20Mock.new(
      accounts[0],
      1000,
      "DXDao",
      "DXD",
      "18"
    );

    dxDao = await helpers.deployDao({
      owner: accounts[0],
      votingMachineToken: votingMachineToken.address,
      repHolders: [
        { address: accounts[0], amount: 20 },
        { address: accounts[1], amount: 10 },
        { address: dxdGuild.address, amount: 70 },
      ],
    });

    // Parameters
    const voteOnBehalf = constants.NULL_ADDRESS;
    const _queuedVoteRequiredPercentage = 50;
    const _queuedVotePeriodLimit = 60;
    const _boostedVotePeriodLimit = 60;
    const _preBoostedVotePeriodLimit = 0;
    const _thresholdConst = 2000;
    const _quietEndingPeriod = 0;
    const _proposingRepReward = 0;
    const _votersReputationLossRatio = 10;
    const _minimumDaoBounty = 15;
    const _daoBountyConst = 10;
    const _activationTime = 0;

    await dxDao.votingMachine.setParameters(
      [
        _queuedVoteRequiredPercentage,
        _queuedVotePeriodLimit,
        _boostedVotePeriodLimit,
        _preBoostedVotePeriodLimit,
        _thresholdConst,
        _quietEndingPeriod,
        _proposingRepReward,
        _votersReputationLossRatio,
        _minimumDaoBounty,
        _daoBountyConst,
        _activationTime,
      ],
      voteOnBehalf
    );

    const paramsHash = await dxDao.votingMachine.getParametersHash(
      [
        _queuedVoteRequiredPercentage,
        _queuedVotePeriodLimit,
        _boostedVotePeriodLimit,
        _preBoostedVotePeriodLimit,
        _thresholdConst,
        _quietEndingPeriod,
        _proposingRepReward,
        _votersReputationLossRatio,
        _minimumDaoBounty,
        _daoBountyConst,
        _activationTime,
      ],
      voteOnBehalf
    );

    const permissionRegistry = await PermissionRegistry.new(accounts[0], 10);
    await permissionRegistry.initialize();

    const masterWalletScheme = await WalletScheme.new();

    await masterWalletScheme.initialize(
      dxDao.avatar.address,
      dxDao.votingMachine.address,
      true,
      dxDao.controller.address,
      permissionRegistry.address,
      "Master Scheme",
      86400,
      5
    );

    await dxDao.controller.registerScheme(
      masterWalletScheme.address,
      paramsHash,
      true,
      true
    );

    actionMock = await ActionMock.new();
    await dxdGuild.methods[
      "initialize(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address,address)"
    ](
      guildToken.address,
      30,
      30,
      5000,
      1100,
      VOTE_GAS,
      MAX_GAS_PRICE,
      10,
      TIMELOCK,
      permissionRegistry.address,
      dxDao.votingMachine.address
    );

    await time.increase(time.duration.seconds(1));

    tokenVault = await dxdGuild.getTokenVault();

    await guildToken.approve(tokenVault, 50, { from: accounts[1] });
    await guildToken.approve(tokenVault, 100, { from: accounts[2] });
    await guildToken.approve(tokenVault, 100, { from: accounts[3] });
    await guildToken.approve(tokenVault, 250, { from: accounts[4] });

    await dxdGuild.lockTokens(50, { from: accounts[1] });
    await dxdGuild.lockTokens(100, { from: accounts[2] });
    await dxdGuild.lockTokens(100, { from: accounts[3] });
    await dxdGuild.lockTokens(250, { from: accounts[4] });

    await permissionRegistry.setETHPermission(
      dxDao.avatar.address,
      actionMock.address,
      helpers.testCallFrom(dxDao.avatar.address).substring(0, 10),
      0,
      true
    );

    const tx = await masterWalletScheme.proposeCalls(
      [ZERO_ADDRESS, actionMock.address],
      ["0x0", helpers.testCallFrom(dxDao.avatar.address)],
      [0, 0],
      2,
      "Test Title",
      constants.SOME_HASH
    );
    walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
  });

  describe("DXDGuild", function () {
    it("execute a positive vote on the voting machine from the dxd-guild", async function () {
      const positiveVoteData = web3.eth.abi.encodeFunctionCall(
        dxDao.votingMachine.abi.find(x => x.name === "vote"),
        [walletSchemeProposalId, 2, 0, constants.NULL_ADDRESS]
      );
      const negativeVoteData = web3.eth.abi.encodeFunctionCall(
        dxDao.votingMachine.abi.find(x => x.name === "vote"),
        [walletSchemeProposalId, 1, 0, constants.NULL_ADDRESS]
      );

      await expectRevert(
        dxdGuild.createProposal(
          [dxDao.votingMachine.address, dxDao.votingMachine.address],
          [positiveVoteData, negativeVoteData],
          [0, 0],
          2,
          `vote on ${walletSchemeProposalId}`,
          constants.SOME_HASH,
          { from: accounts[1] }
        ),
        "ERC20Guild: Not enough votingPower to create proposal"
      );
      const tx = await dxdGuild.createProposal(
        [dxDao.votingMachine.address, dxDao.votingMachine.address],
        [positiveVoteData, negativeVoteData],
        [0, 0],
        2,
        `vote on ${walletSchemeProposalId}`,
        constants.SOME_HASH,
        { from: accounts[2] }
      );

      const proposalId = tx.logs[0].args.proposalId;

      await setVotesOnProposal({
        guild: dxdGuild,
        proposalId: proposalId,
        action: 1,
        account: accounts[1],
      });

      await expectRevert(
        dxdGuild.endProposal(proposalId),
        "ERC20Guild: Proposal hasn't ended yet"
      );

      await setVotesOnProposal({
        guild: dxdGuild,
        proposalId: proposalId,
        action: 1,
        account: accounts[2],
      });

      const txVote = await setVotesOnProposal({
        guild: dxdGuild,
        proposalId: proposalId,
        action: 1,
        account: accounts[3],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: proposalId });
      await time.increase(time.duration.seconds(31));
      const receipt = await dxdGuild.endProposal(proposalId);

      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });
      await expectRevert(
        dxdGuild.endProposal(proposalId),
        "ERC20Guild: Proposal already executed"
      );

      //TO DO: Check more conditions of REP vote done on voting machine and dao

      const proposalInfo = await dxdGuild.getProposal(proposalId);
      assert.equal(
        proposalInfo.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
      assert.equal(proposalInfo.to[0], dxDao.votingMachine.address);
      assert.equal(proposalInfo.value[0], 0);
    });
  });
});
