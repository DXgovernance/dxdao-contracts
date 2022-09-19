import { expectRevert } from "@openzeppelin/test-helpers";
import { assert } from "chai";
import * as helpers from "../helpers";

const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");

contract("DXdao", function (accounts) {
  const constants = helpers.constants;
  let dxDao;
  let proposalId;

  beforeEach(async function () {
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
        { address: accounts[2], amount: 70 },
      ],
    });

    await web3.eth.sendTransaction({
      to: dxDao.dxAvatar.address,
      from: accounts[0],
      value: 100,
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

    const permissionRegistry = await PermissionRegistry.new(
      dxDao.dxAvatar.address,
      10
    );
    await permissionRegistry.initialize();

    await permissionRegistry.setETHPermission(
      dxDao.dxAvatar.address,
      constants.NULL_ADDRESS,
      constants.NULL_SIGNATURE,
      10,
      true
    );

    const masterWalletScheme = await WalletScheme.new();

    await masterWalletScheme.initialize(
      dxDao.dxAvatar.address,
      dxDao.votingMachine.address,
      true,
      dxDao.dxController.address,
      permissionRegistry.address,
      "Master Scheme",
      86400,
      5
    );

    await dxDao.dxController.registerScheme(
      masterWalletScheme.address,
      paramsHash,
      true,
      true
    );

    const createProposalTx = await masterWalletScheme.proposeCalls(
      [accounts[1], accounts[1]],
      ["0x0", "0x0"],
      [10, 5],
      2,
      "Test Proposal",
      constants.NULL_HASH
    );

    proposalId = createProposalTx.logs[0].args._proposalId;
  });

  it("Wallet - execute proposeVote -option 0 - check action - with DXDVotingMachine", async function () {
    assert.equal(await web3.eth.getBalance(dxDao.dxAvatar.address), "100");

    await expectRevert(
      dxDao.votingMachine.vote(proposalId, 0, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "wrong decision value"
    );
    assert.equal(await web3.eth.getBalance(dxDao.dxAvatar.address), "100");
  });

  it("Wallet - execute proposeVote -option 1 - check action - with DXDVotingMachine", async function () {
    assert.equal(await web3.eth.getBalance(dxDao.dxAvatar.address), "100");

    await dxDao.votingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });
    assert.equal(await web3.eth.getBalance(dxDao.dxAvatar.address), "90");
  });

  it("Wallet - execute proposeVote -option 2 - check action - with DXDVotingMachine", async function () {
    assert.equal(await web3.eth.getBalance(dxDao.dxAvatar.address), "100");

    await dxDao.votingMachine.vote(proposalId, 2, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });
    assert.equal(await web3.eth.getBalance(dxDao.dxAvatar.address), "95");
  });
});
