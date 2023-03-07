import { expect } from "chai";
import * as helpers from "../helpers";
const BigNumber = require("bignumber.js");
const bn = n => new BigNumber(n);

const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const AvatarScheme = artifacts.require("./AvatarScheme.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");

/**
 * Representation of voting power at dao level.
 * Very verbose test to explain actions and expectations.
 */

contract("GOV2.0", function (accounts) {
  const constants = helpers.constants;
  let votingMachineToken,
    votingPower,
    precision,
    holders,
    controller,
    avatar,
    reputation,
    votingMachine,
    permissionRegistry,
    dxdInfluence,
    mintApproveStake,
    defaultParamsHash,
    masterAvatarScheme,
    dxDao;

  const members = [
    { address: accounts[1], amount: { rep: 100, dxd: 10 } },
    { address: accounts[2], amount: { rep: 300, dxd: 390 } },
    { address: accounts[3], amount: { rep: 400, dxd: 400 } },
  ];

  before(async function () {
    votingMachineToken = await ERC20Mock.new("DXDao", "DXD", 1000, accounts[0]);
    // Util to deploy dao
    dxDao = await helpers.deployDaoV2({
      repTokenWeight: 100, // 100% rep for initial vp deploy
      stakeTokenWeight: 0, // 0% of dxd weight for initial voting power deploy
      owner: accounts[0],
      votingMachineToken: votingMachineToken.address,
      repHolders: [{ address: accounts[0], amount: { dxd: 0, rep: 1000 } }],
    });
    votingPower = dxDao.votingPowerToken;
    controller = dxDao.controller;
    avatar = dxDao.avatar;
    reputation = dxDao.reputation;
    votingMachine = dxDao.votingMachine;
    dxdInfluence = dxDao.dxdInfluence;
    defaultParamsHash = dxDao.defaultParamsHash;
    holders = dxDao.holders;
    precision = bn(await votingPower.precision());
    mintApproveStake = dxDao.mintApproveStake;

    permissionRegistry = await PermissionRegistry.new(avatar.address, 10);
    await permissionRegistry.initialize();

    masterAvatarScheme = await AvatarScheme.new();

    await masterAvatarScheme.initialize(
      avatar.address,
      votingMachine.address,
      controller.address,
      permissionRegistry.address,
      votingPower.address,
      "Master Scheme",
      100
    );
    await controller.registerScheme(
      masterAvatarScheme.address,
      defaultParamsHash,
      true,
      true,
      true
    );

    // set permissions to execute votingPower.setComposition()
    await permissionRegistry.setETHPermission(
      avatar.address,
      votingPower.address,
      web3.eth.abi.encodeFunctionSignature("setComposition(uint256,uint256)"),
      0,
      true
    );
  });

  it("Starts with initial holders", async () => {
    const user1 = holders[0].address;
    const user0VotingPower = bn(await votingPower.balanceOf(user1)).toNumber();
    expect(user0VotingPower).equal(precision.mul(100).toNumber());
  });

  it("Mint rep for other members", async () => {
    // 1. create proposal to mint rep
    const burnRepCall = web3.eth.abi.encodeFunctionCall(
      controller.abi.find(x => x.name === "burnReputation"),
      [800, holders[0].address]
    );

    const mintCalls = members.map(member => {
      return web3.eth.abi.encodeFunctionCall(
        controller.abi.find(x => x.name === "mintReputation"),
        [member.amount.rep, member.address]
      );
    });

    const tx = await masterAvatarScheme.proposeCalls(
      [
        controller.address,
        controller.address,
        controller.address,
        controller.address,
      ], // To
      [burnRepCall, ...mintCalls], // data
      [0, 0, 0, 0],
      2, // options
      "Mint rep for members", // title
      constants.SOME_HASH // description hash
    );

    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    // 2. Vote/execute proposal
    await votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: holders[0].address,
    });

    // Assertions --->>
    // O: Member 0 should have 100 reputation
    const member0Rep = bn(await reputation.balanceOf(members[0].address));
    expect(member0Rep.toNumber()).equal(100);

    // O: Member 0 should have 10% voting power (based on distribution)
    const member0VotingPower = bn(
      await votingPower.balanceOf(members[0].address)
    );
    expect(member0VotingPower.toString()).equal(precision.mul(10).toString());

    // O: Member 1 should have 300 reputation
    const member1Rep = bn(await reputation.balanceOf(members[1].address));
    expect(member1Rep.toNumber()).equal(300);

    // O: Member 1 should have 30% voting power (based on 1000REP distribution)
    const member1VotingPower = bn(
      await votingPower.balanceOf(members[1].address)
    );
    expect(member1VotingPower.toString()).equal(precision.mul(30).toString());
  });

  it("Dxdao can update weights composition", async () => {
    // 1. Create a proposal to update tokens weights in votingPower contract (owned by avatar)
    const updateCompositionCall = web3.eth.abi.encodeFunctionCall(
      votingPower.abi.find(x => x.name === "setComposition"),
      [
        70, // REP weight
        30, // DXDInfluence weight
      ]
    );

    const tx = await masterAvatarScheme.proposeCalls(
      [votingPower.address], // to
      [updateCompositionCall], // data
      [0], // value
      2, // options
      "Update votingPower weights composition", // title
      constants.SOME_HASH // description hash
    );

    const proposalId = await helpers.getValueFromLogs(tx, "proposalId");

    // 2. Vote for proposal to update composition
    await votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: members[1].address,
    });

    await votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
      from: members[2].address,
    });

    const snapshotId = bn(await votingPower.getCurrentSnapshotId()).toNumber();

    // Verify that values are updated: get reputation weight in internal storage
    const settingsReputationWeight = bn(
      await votingPower.weights(reputation.address, snapshotId)
    ).toNumber();

    // Get actual reputation value that will be applied to votingPower formula.
    const actualReputationWeightToBeApplied = bn(
      await votingPower.getWeightOf(reputation.address)
    ).toNumber();

    // Config should be 70% to rep token - this is contract storage config. (previous call was executed)
    expect(settingsReputationWeight).equal(70);

    // Reputation weight should be 100% since tokens locked (zero by this time) in dxdInfluence contract < _minStakingTokensLocked (set to 100 on init)
    // This is the value will be consider when reading .balanceOf(address)
    expect(actualReputationWeightToBeApplied).equal(100);

    // Verify that voting power hasn't been affected comparing to previous test
    const member0VotingPower = bn(
      await votingPower.balanceOf(members[0].address)
    );
    expect(member0VotingPower.toString()).equal(precision.mul(10).toString());
  });

  it("Stake dxd and get new voting power", async () => {
    // At this point the total supply of influence is zero, since no token has been staked yet.

    /**
     * Let's keep in mind this values: 
     *   const members = [
            { amount: { rep: 100, dxd: 100 } },
            { amount: { rep: 300, dxd: 300 } },
            { amount: { rep: 400, dxd: 400 } },
        ];
     */

    // 1. Stake tokens for all members
    await mintApproveStake(members[0].address, members[0].amount.dxd); // 10
    await mintApproveStake(members[1].address, members[1].amount.dxd); // 390
    await mintApproveStake(members[2].address, members[2].amount.dxd); // 400
    await mintApproveStake(holders[0].address, 200); // 200

    // 2. Verify that reputation/influence are updated now that influence amount of tokens locked (staked) is over _minStakingTokensLocked
    // This are not only sotred values. Also values that computes inside .balance() getter.
    const reputationWeight = bn(
      await votingPower.getWeightOf(reputation.address)
    ).toNumber();

    const influenceWeight = bn(
      await votingPower.getWeightOf(dxdInfluence.address)
    ).toNumber();

    // Check correct values.
    expect(reputationWeight).equal(70);
    expect(influenceWeight).equal(30);

    /**
     * At this point test user has 10% REP and 1% dxd (based on total supply)
     * Voting power config weights is 70%rep and 30% dxd
     *
     * So: 0.7(10rep) + 0.3(1) = 7.3% voting power
     */
    const testUser = members[0];

    let member0VotingPower = bn(await votingPower.balanceOf(testUser.address));
    expect(member0VotingPower.toString()).equal(precision.mul(7.3).toString());
  });
});

