import { ZERO_ADDRESS } from "@openzeppelin/test-helpers/src/constants";
import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert, expect } from "chai";
import * as helpers from "../../helpers";
const { fixSignature } = require("../../helpers/sign");
const {
  createAndSetupGuildToken,
  createProposal,
  setVotesOnProposal,
} = require("../../helpers/guild");

const {
  BN,
  expectEvent,
  expectRevert,
  balance,
  send,
  ether,
  time,
} = require("@openzeppelin/test-helpers");

const ProxyAdmin = artifacts.require("ProxyAdmin.sol");
const TransparentUpgradeableProxy = artifacts.require(
  "TransparentUpgradeableProxy.sol"
);
const Create2Deployer = artifacts.require("Create2Deployer.sol");
const ERC20Guild = artifacts.require("GuardedERC20Guild.sol");
const IERC20Guild = artifacts.require("GuardedERC20Guild.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const Multicall = artifacts.require("Multicall.sol");

require("chai").should();

contract("GuardedERC20Guild", function (accounts) {
  const constants = helpers.constants;
  const ZERO = new BN("0");
  const VOTE_GAS = new BN(100000); // 100k gwei
  const MAX_GAS_PRICE = new BN(8000000000); // 8 gwei
  const REAL_GAS_PRICE = new BN(constants.GAS_PRICE); // 10 gwei (check config)

  let guildToken,
    actionMockA,
    actionMockB,
    erc20Guild,
    permissionRegistry,
    genericProposal,
    multicall;

  beforeEach(async function () {
    const proxyAdmin = await ProxyAdmin.new({ from: accounts[0] });

    multicall = await Multicall.new();
    const erc20GuildDeployer = await Create2Deployer.new();
    const erc20GuildAddress = helpers.create2Address(
      erc20GuildDeployer.address,
      ERC20Guild.bytecode,
      constants.SOME_HASH
    );
    await erc20GuildDeployer.deploy(ERC20Guild.bytecode, constants.SOME_HASH);

    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6),
      [0, 50000, 50000, 100000, 100000, 200000]
    );
    permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    const erc20GuildInitializeData = await new web3.eth.Contract(
      ERC20Guild.abi
    ).methods
      .initialize(
        guildToken.address,
        30,
        30,
        5000,
        100,
        "TestGuild",
        0,
        0,
        10,
        60,
        permissionRegistry.address
      )
      .encodeABI();

    const erc20GuildProxy = await TransparentUpgradeableProxy.new(
      erc20GuildAddress,
      proxyAdmin.address,
      erc20GuildInitializeData
    );

    erc20Guild = await IERC20Guild.at(erc20GuildProxy.address);

    actionMockA = await ActionMock.new();
    actionMockB = await ActionMock.new();
    genericProposal = {
      guild: erc20Guild,
      options: [
        {
          to: [actionMockA.address, actionMockA.address],
          data: [
            helpers.testCallFrom(erc20Guild.address),
            helpers.testCallFrom(erc20Guild.address, 666),
          ],
          value: [new BN("0"), new BN("0")],
        },
        {
          to: [actionMockA.address, constants.ZERO_ADDRESS],
          data: [helpers.testCallFrom(erc20Guild.address), "0x00"],
          value: [new BN("101"), new BN("0")],
        },
        {
          to: [actionMockB.address, constants.ZERO_ADDRESS],
          data: [helpers.testCallFrom(erc20Guild.address, 666), "0x00"],
          value: [new BN("10"), new BN("0")],
        },
      ],
      account: accounts[3],
    };
  });

  const lockTokens = async function (acc, tokens) {
    const tokenVault = await erc20Guild.getTokenVault();
    if (acc && tokens) {
      await guildToken.approve(tokenVault, tokens, { from: acc });
      await erc20Guild.lockTokens(tokens, { from: acc });
      return;
    }
    await guildToken.approve(tokenVault, 50000, { from: accounts[1] });
    await guildToken.approve(tokenVault, 50000, { from: accounts[2] });
    await guildToken.approve(tokenVault, 100000, { from: accounts[3] });
    await guildToken.approve(tokenVault, 100000, { from: accounts[4] });
    await guildToken.approve(tokenVault, 200000, { from: accounts[5] });
    await erc20Guild.lockTokens(50000, { from: accounts[1] });
    await erc20Guild.lockTokens(50000, { from: accounts[2] });
    await erc20Guild.lockTokens(100000, { from: accounts[3] });
    await erc20Guild.lockTokens(100000, { from: accounts[4] });
    await erc20Guild.lockTokens(200000, { from: accounts[5] });
  };

  const withdrawTokens = async function (acc = null, tokens = 50000) {
    if (acc) return await erc20Guild.withdrawTokens(tokens, { from: acc });
    await erc20Guild.withdrawTokens(50000, { from: accounts[1] });
    await erc20Guild.withdrawTokens(50000, { from: accounts[2] });
    await erc20Guild.withdrawTokens(100000, { from: accounts[3] });
    await erc20Guild.withdrawTokens(100000, { from: accounts[4] });
    await erc20Guild.withdrawTokens(200000, { from: accounts[5] });
  };

  const allowActionMockA = async function () {
    const setETHPermissionToActionMockA = await createProposal({
      guild: erc20Guild,
      options: [
        {
          to: [
            permissionRegistry.address,
            permissionRegistry.address,
            permissionRegistry.address,
            permissionRegistry.address,
          ],
          data: [
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                erc20Guild.address,
                constants.ZERO_ADDRESS,
                constants.NULL_SIGNATURE,
                200,
                true
              )
              .encodeABI(),
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                erc20Guild.address,
                actionMockA.address,
                constants.NULL_SIGNATURE,
                100,
                true
              )
              .encodeABI(),
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                erc20Guild.address,
                actionMockA.address,
                helpers.testCallFrom(erc20Guild.address).substring(0, 10),
                50,
                true
              )
              .encodeABI(),
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                erc20Guild.address,
                actionMockA.address,
                web3.eth.abi.encodeFunctionSignature(
                  "executeCall(address,bytes,uint256)"
                ),
                0,
                true
              )
              .encodeABI(),
          ],
          value: [0, 0, 0, 0],
        },
      ],
      account: accounts[1],
    });
    await setVotesOnProposal({
      guild: erc20Guild,
      proposalId: setETHPermissionToActionMockA,
      option: 1,
      account: accounts[4],
    });
    await setVotesOnProposal({
      guild: erc20Guild,
      proposalId: setETHPermissionToActionMockA,
      option: 1,
      account: accounts[5],
    });
    await time.increase(30);
    await erc20Guild.endProposal(setETHPermissionToActionMockA);
  };

  describe("Guardian features", function () {
    beforeEach(async function () {
      await lockTokens();
    });

    it("executes GuardedERC20Guild setGuardianConfig proposal on the guild", async function () {
      await expectRevert(
        erc20Guild.setGuardianConfig(ZERO_ADDRESS, 10),
        "GuardedERC20Guild: guildGuardian cant be address 0"
      );
      await erc20Guild.setGuardianConfig(accounts[3], 10);
      await expectRevert(
        erc20Guild.setGuardianConfig(accounts[3], 10),
        "GuardedERC20Guild: Only callable by the guild itself when guildGuardian is set"
      );

      expect(await erc20Guild.getGuildGuardian()).to.be.equal(accounts[3]);
      expect(await erc20Guild.getExtraTimeForGuardian()).to.be.bignumber.equal(
        new BN("10")
      );

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(ERC20Guild.abi).methods
                .setGuardianConfig(accounts[2], 5)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[3],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal hasn't ended yet"
      );

      await time.increase(time.duration.seconds(10));
      await erc20Guild.endProposal(guildProposalId);

      expect(await erc20Guild.getGuildGuardian()).to.be.equal(accounts[2]);
      expect(await erc20Guild.getExtraTimeForGuardian()).to.be.bignumber.equal(
        new BN("5")
      );
    });

    it("executes a proposal unilaterally and early by the guardian", async function () {
      await erc20Guild.setGuardianConfig(accounts[3], 30);

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(ERC20Guild.abi).methods
                .setGuardianConfig(accounts[2], 5)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[3],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });

      await expectRevert(
        erc20Guild.endProposal(guildProposalId, { from: accounts[3] }),
        "ERC20Guild: Proposal hasn't ended yet"
      );

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal hasn't ended yet"
      );
      await erc20Guild.endProposal(guildProposalId, { from: accounts[3] });

      expect(await erc20Guild.getGuildGuardian()).to.be.equal(accounts[2]);
      expect(await erc20Guild.getExtraTimeForGuardian()).to.be.bignumber.equal(
        new BN("5")
      );
    });

    it("rejects a proposal unilaterally and early by the guardian", async function () {
      await erc20Guild.setGuardianConfig(accounts[3], 30);

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(ERC20Guild.abi).methods
                .setGuardianConfig(accounts[2], 5)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[3],
      });

      await erc20Guild.rejectProposal(guildProposalId, { from: accounts[3] });
    });
  });

  describe("createProposal", function () {
    beforeEach(async function () {
      await lockTokens();
    });

    it("should not create proposal without enough tokens locked", async function () {
      const MINIMUM_TOKENS_LOCKED = 3000;

      assert.equal(await erc20Guild.getTotalMembers(), 5);

      // Create a proposal to execute setConfig with minimum tokens locked 3000 for proposal creation
      const setConfigProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(ERC20Guild.abi).methods
                .setConfig(
                  "15",
                  "30",
                  "5001",
                  "1001",
                  "0",
                  "1",
                  "10",
                  "4",
                  "61",
                  "0",
                  MINIMUM_TOKENS_LOCKED
                )
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[2],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: setConfigProposalId,
        option: 1,
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: setConfigProposalId,
        option: 1,
        account: accounts[5],
      });

      // wait for proposal to end and execute setConfig proposal
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(setConfigProposalId);

      assert.equal(
        await erc20Guild.getMinimumTokensLockedForProposalCreation(),
        MINIMUM_TOKENS_LOCKED
      );

      // wait to unlock tokens and withdraw all members tokens
      await time.increase(new BN("62"));
      await withdrawTokens();
      assert.equal(await erc20Guild.getTotalMembers(), 0);
      assert.equal(await erc20Guild.getTotalLocked(), 0);

      // Expect new proposal to be rejected with 0 tokens locked.
      await expectRevert(
        createProposal(genericProposal),
        "ERC20Guild: Not enough tokens locked to create a proposal"
      );

      // Lock new tokens but not enough for minimum required to pass
      await lockTokens(accounts[1], MINIMUM_TOKENS_LOCKED - 1);
      assert.equal(await erc20Guild.getTotalMembers(), 1);
      assert.equal(
        await erc20Guild.getTotalLocked(),
        MINIMUM_TOKENS_LOCKED - 1
      );

      // Expect new proposal to be rejected with only 2999 tokens locked.
      await expectRevert(
        createProposal(genericProposal),
        "ERC20Guild: Not enough tokens locked to create a proposal"
      );
    });

    it("should not create proposal without enough members", async function () {
      const MINIMUM_MEMBERS = 3;

      assert.equal(await erc20Guild.getTotalMembers(), 5);

      // Create a proposal to execute setConfig with minimum 3 members to create proposal.
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(ERC20Guild.abi).methods
                .setConfig(
                  "15",
                  "30",
                  "5001",
                  "1001",
                  "0",
                  "1",
                  "10",
                  "4",
                  "61",
                  MINIMUM_MEMBERS,
                  "0"
                )
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[2],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });

      // wait for proposal to end and execute setConfig proposal
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(guildProposalId);

      assert.equal(
        await erc20Guild.getMinimumMembersForProposalCreation(),
        MINIMUM_MEMBERS
      );

      // wait to unlock tokens and withdraw 3 members tokens.
      await time.increase(new BN("62"));
      await erc20Guild.withdrawTokens(50000, { from: accounts[1] });
      await erc20Guild.withdrawTokens(50000, { from: accounts[2] });
      await erc20Guild.withdrawTokens(100000, { from: accounts[3] });

      assert.equal(await erc20Guild.getTotalMembers(), 2);

      // Expect new proposal to be rejected with only 2 members.
      await expectRevert(
        createProposal(genericProposal),
        "ERC20Guild: Not enough members to create a proposal"
      );

      // withdraw remaining members tokens.
      await erc20Guild.withdrawTokens(100000, { from: accounts[4] });
      await erc20Guild.withdrawTokens(200000, { from: accounts[5] });
      assert.equal(await erc20Guild.getTotalMembers(), 0);

      // Expect new proposal to be rejected with only 0.
      await expectRevert(
        createProposal(genericProposal),
        "ERC20Guild: Not enough members to create a proposal"
      );
    });

    it("cannot create a proposal with invalid totalOptions", async function () {
      const invalidtotalOptions = 3;
      await expectRevert(
        erc20Guild.createProposal(
          [actionMockA.address, actionMockA.address],
          ["0x00", "0x00"],
          [1, 1],
          invalidtotalOptions,
          "Guild Test Proposal",
          constants.SOME_HASH,
          { from: accounts[2] }
        ),
        "ERC20Guild: Invalid totalOptions or option calls length"
      );
    });

    it("cannot create a proposal without enough creation votes", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [actionMockA.address],
          ["0x00"],
          [1],
          1,
          "Guild Test Proposal",
          constants.SOME_HASH,
          { from: accounts[9] }
        ),
        "ERC20Guild: Not enough votingPower to create proposal"
      );
    });

    it("cannot create a proposal with uneven _to and _data arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [actionMockA.address],
          [],
          [0],
          1,
          "Guild Test Proposal",
          constants.ZERO_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with uneven _to and _value arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [actionMockA.address],
          ["0x0"],
          [],
          1,
          "Guild Test Proposal",
          constants.ZERO_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with empty _to, _data and _value arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [],
          [],
          [],
          1,
          "Guild Test Proposal",
          constants.ZERO_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: to, data value arrays cannot be empty"
      );
    });

    it("cannot create a proposal if the max amount of active proposals is reached", async function () {
      const firstProposalId = await createProposal(genericProposal);
      assert.equal(await erc20Guild.getActiveProposalsNow(), "1");
      await time.increase(10);

      // Create 9 more proposals and have 10 active proposals
      for (let i = 0; i < 9; i++) await createProposal(genericProposal);

      assert.equal(await erc20Guild.getActiveProposalsNow(), "10");

      // Cant create because maxActiveProposals limit reached
      await expectRevert(
        createProposal(genericProposal),
        "ERC20Guild: Maximum amount of active proposals reached"
      );

      // Finish one proposal and can create another
      await time.increase(20);
      await erc20Guild.endProposal(firstProposalId);
      assert.equal(await erc20Guild.getActiveProposalsNow(), "9");

      await createProposal(genericProposal);
    });

    it("cannot create a proposal with more actions to the ones allowed", async function () {
      await expectRevert(
        createProposal({
          guild: erc20Guild,
          options: [
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
            { to: [actionMockA.address], data: ["0x00"], value: ["1"] },
          ],
          account: accounts[3],
        }),
        "ERC20Guild: Maximum amount of options per proposal reached"
      );
    });
  });

  describe("setVote", function () {
    beforeEach(async function () {
      await lockTokens();
    });

    it("cannot reduce votes after initial vote", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[3],
        votingPower: 25000,
      });

      await expectRevert(
        setVotesOnProposal({
          guild: erc20Guild,
          proposalId: guildProposalId,
          option: 1,
          account: accounts[3],
          votingPower: 20000,
        }),
        "ERC20Guild: Invalid votingPower amount"
      );
    });

    it("cannot vote with more than locked voting power", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const votingPower = await erc20Guild.votingPowerOf(accounts[3]);
      await expectRevert(
        setVotesOnProposal({
          guild: erc20Guild,
          proposalId: guildProposalId,
          option: 1,
          account: accounts[3],
          votingPower: votingPower + 1,
        }),
        "ERC20Guild: Invalid votingPower amount"
      );
    });

    it("cannot change voted option after initial vote", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 0,
        account: accounts[3],
        votingPower: 25000,
      });

      await expectRevert(
        setVotesOnProposal({
          guild: erc20Guild,
          proposalId: guildProposalId,
          option: 1,
          account: accounts[3],
        }),
        "ERC20Guild: Cannot change option voted, only increase votingPower"
      );
    });
  });

  describe("endProposal", function () {
    beforeEach(async function () {
      await lockTokens();
    });

    it("cannot execute as proposal not ended yet", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[3],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal hasn't ended yet"
      );
    });

    it("proposal rejected if not enough votes to execute proposal when proposal ends", async function () {
      const guildProposalId = await createProposal(genericProposal);
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[3],
      });
      await time.increase(time.duration.seconds(61));

      await erc20Guild.endProposal(guildProposalId);
      const { state } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(state, constants.WALLET_SCHEME_PROPOSAL_STATES.rejected);
    });

    it("Proposals are marked as rejected if voted on action 0", async function () {
      const proposalId = await createProposal(genericProposal);

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: proposalId,
        option: 0,
        account: accounts[2],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: proposalId,
        option: 0,
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: proposalId,
        option: 0,
        account: accounts[4],
      });

      await expectRevert(
        erc20Guild.endProposal(proposalId),
        "ERC20Guild: Proposal hasn't ended yet"
      );

      await time.increase(time.duration.seconds(31));

      const receipt = await erc20Guild.endProposal(proposalId);

      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "2",
      });
      await expectRevert(
        erc20Guild.endProposal(proposalId),
        "ERC20Guild: Proposal already executed"
      );

      const proposalInfo = await erc20Guild.getProposal(proposalId);
      assert.equal(
        proposalInfo.state,
        constants.GUILD_PROPOSAL_STATES.Rejected
      );
    });

    it("cannot end proposal with an unauthorized function", async function () {
      const testWithNoargsEncoded = await new web3.eth.Contract(
        ActionMock.abi
      ).methods
        .testWithNoargs()
        .encodeABI();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [actionMockA.address],
            data: [testWithNoargsEncoded],
            value: [0],
          },
        ],
        account: accounts[2],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[2],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "PermissionRegistry: Call not allowed"
      );
    });

    it("proposal fail because it run out of time to execute", async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [actionMockA.address, actionMockA.address],
            data: [
              helpers.testCallFrom(erc20Guild.address),
              helpers.testCallFrom(erc20Guild.address, 666),
            ],
            value: [new BN("0"), new BN("0")],
          },
        ],
        account: accounts[3],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[2],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(30));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "PermissionRegistry: Call not allowed"
      );

      await time.increase(time.duration.seconds(30));
      await erc20Guild.endProposal(guildProposalId);
      assert.equal((await erc20Guild.getProposal(guildProposalId)).state, 4);
    });
  });

  describe("Early proposal executions", function () {
    beforeEach(async function () {
      await lockTokens();

      // Set votingPowerPercentageForInstantProposalExecution
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(ERC20Guild.abi).methods
                .setConfig(30, 30, 5000, 100, 7500, 0, 0, 10, 60, 0, 0)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[2],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[2],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(guildProposalId);

      await erc20Guild.setGuardianConfig(accounts[3], 30);
    });

    it("should not execute a proposal early if early proposal execution conditions are not met", async function () {
      const guildProposalId = await createProposal(genericProposal);
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[3],
      });
      // await time.increase(time.duration.seconds(61));
      const totalSupply = await guildToken.totalSupply();
      const totalVotesA = await erc20Guild.getProposalOptionTotalVotes(
        guildProposalId,
        1
      );
      const multiplier = new BN("10000");
      expect(totalVotesA.mul(multiplier).div(totalSupply)).to.be.bignumber.lt(
        new BN("7500")
      );

      await expectRevert(
        erc20Guild.endProposal(guildProposalId, { from: accounts[3] }),
        "ERC20Guild: Proposal hasn't ended yet"
      );
    });

    it("should execute a proposal early if early proposal execution conditions are met", async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(ERC20Guild.abi).methods
                .setConfig(30, 30, 5000, 100, 5000, 0, 0, 10, 60, 0, 0)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[2],
      });
      for (let i = 3; i <= 5; i++) {
        await setVotesOnProposal({
          guild: erc20Guild,
          proposalId: guildProposalId,
          option: 1,
          account: accounts[i],
        });
      }
      // await time.increase(time.duration.seconds(61));
      const totalSupply = await guildToken.totalSupply();
      const totalVotesA = await erc20Guild.getProposalOptionTotalVotes(
        guildProposalId,
        1
      );
      const multiplier = new BN("10000");
      expect(totalVotesA.mul(multiplier).div(totalSupply)).to.be.bignumber.gte(
        new BN("7500")
      );

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal hasn't ended yet"
      );
      await erc20Guild.endProposal(guildProposalId, { from: accounts[3] });

      const votingPowerPercentageForInstantProposalExecution =
        await erc20Guild.votingPowerPercentageForInstantProposalExecution();
      expect(
        votingPowerPercentageForInstantProposalExecution
      ).to.be.bignumber.gte(new BN("5000"));
    });
  });

  describe("complete proposal process", function () {
    beforeEach(async function () {
      await lockTokens();
      await allowActionMockA();
    });

    it("execute a proposal to a contract from the guild", async function () {
      await web3.eth.sendTransaction({
        to: erc20Guild.address,
        value: 10,
        from: accounts[0],
      });

      const allowActionMock = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistry.address],
            data: [
              await new web3.eth.Contract(PermissionRegistry.abi).methods
                .setETHPermission(
                  erc20Guild.address,
                  actionMockB.address,
                  helpers.testCallFrom(erc20Guild.address).substring(0, 10),
                  10,
                  true
                )
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[3],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: allowActionMock,
        option: 1,
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: allowActionMock,
        option: 1,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(allowActionMock);

      const guildProposalId = await createProposal(genericProposal);
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 3,
        account: accounts[3],
      });

      const txVote = await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 3,
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(VOTE_GAS.toNumber());

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "3",
      });
      expectEvent.inTransaction(receipt.tx, actionMockB, "ReceivedEther", {
        _sender: erc20Guild.address,
        _value: "10",
      });
      expectEvent.inTransaction(receipt.tx, actionMockB, "LogNumber", {
        number: "666",
      });
    });

    it("can read proposal details of proposal", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const {
        creator,
        startTime,
        endTime,
        to,
        data,
        value,
        title,
        contentHash,
        state,
        totalVotes,
      } = await erc20Guild.getProposal(guildProposalId);

      const callsTo = [],
        callsData = [],
        callsValue = [];

      genericProposal.options.map(option => {
        option.to.map(to => callsTo.push(to));
        option.data.map(data => callsData.push(data));
        option.value.map(value => callsValue.push(value.toString()));
      });

      assert.equal(creator, accounts[3]);
      const now = await time.latest();
      assert.equal(startTime.toString(), now.toString());
      assert.equal(endTime.toString(), now.add(new BN("30")).toString());
      assert.deepEqual(to, callsTo);
      assert.deepEqual(data, callsData);
      assert.deepEqual(value, callsValue);
      assert.equal(title, "Awesome Proposal Title");
      assert.equal(contentHash, constants.SOME_HASH);
      assert.equal(totalVotes.length, 4);
      assert.equal(state, "1");
    });

    it("can read votingPowerOf single accounts", async function () {
      const votes = await erc20Guild.votingPowerOf(accounts[2]);
      votes.should.be.bignumber.equal("50000");
    });

    it("can read votingPowerOf multiple accounts", async function () {
      const calls = await Promise.all(
        [accounts[2], accounts[5]].map(async account => {
          return [
            erc20Guild.address,
            await new web3.eth.Contract(ERC20Guild.abi).methods
              .votingPowerOf(account)
              .encodeABI(),
          ];
        })
      );

      const votingPowersCall = await multicall.aggregate.call(calls);

      web3.eth.abi
        .decodeParameter("uint256", votingPowersCall.returnData[0])
        .should.equal("50000");
      web3.eth.abi
        .decodeParameter("uint256", votingPowersCall.returnData[1])
        .should.equal("200000");
    });
  });

  describe("refund votes", function () {
    beforeEach(async function () {
      await lockTokens();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(ERC20Guild.abi).methods
                .setConfig(
                  30,
                  30,
                  200,
                  100,
                  0,
                  VOTE_GAS,
                  MAX_GAS_PRICE,
                  3,
                  60,
                  0,
                  0
                )
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[3],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[4],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(guildProposalId);
      (await erc20Guild.getVoteGas()).should.be.bignumber.equal(VOTE_GAS);
      (await erc20Guild.getMaxGasPrice()).should.be.bignumber.equal(
        MAX_GAS_PRICE
      );
    });

    describe("with high gas vote setting (above cost) and standard gas price", function () {
      it("can pay ETH to the guild (to cover votes)", async function () {
        const tracker = await balance.tracker(erc20Guild.address);
        let guildBalance = await tracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO); // empty

        await send.ether(accounts[5], erc20Guild.address, VOTE_GAS, {
          from: accounts[5],
        });

        guildBalance = await tracker.delta();
        guildBalance.should.be.bignumber.equal(VOTE_GAS);
      });

      it("can set a vote and refund gas", async function () {
        const guildProposalId = await createProposal(genericProposal);

        const guildTracker = await balance.tracker(erc20Guild.address);

        // send ether to cover gas
        await send.ether(accounts[0], erc20Guild.address, ether("10"), {
          from: accounts[0],
        });
        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ether("10"));

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await erc20Guild.setVote(guildProposalId, 1, 100, {
          from: accounts[2],
          gasPrice: REAL_GAS_PRICE,
        });
        const voteEvent = helpers.logDecoder.decodeLogs(
          txVote.receipt.rawLogs
        )[0];
        assert.equal(voteEvent.name, "VoteAdded");
        assert.equal(voteEvent.args[0], guildProposalId);
        assert.equal(voteEvent.args[1], 1);
        assert.equal(voteEvent.args[2], accounts[2]);
        assert.equal(voteEvent.args[3], 100);

        if (constants.GAS_PRICE > 1) {
          const txGasUsed = txVote.receipt.gasUsed;

          // mul by -1 as balance has decreased
          guildBalance = await guildTracker.delta();
          guildBalance.should.be.bignumber.equal(
            VOTE_GAS.mul(MAX_GAS_PRICE).neg()
          );
          // account 1 should have a refund
          // the gas for the vote multipled by set gas price minus the real cost of gas multiplied by gas price
          let accounts1Balance = await tracker.delta();
          accounts1Balance
            .neg()
            .should.be.bignumber.equal(
              new BN(txGasUsed)
                .mul(REAL_GAS_PRICE)
                .sub(VOTE_GAS.mul(MAX_GAS_PRICE))
            );
        }
      });

      it("can set a vote but no refund as contract has no ether", async function () {
        const guildProposalId = await createProposal(genericProposal);

        const guildTracker = await balance.tracker(erc20Guild.address);

        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO);

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await erc20Guild.setVote(guildProposalId, 1, 100, {
          from: accounts[2],
          gasPrice: REAL_GAS_PRICE,
        });

        const voteEvent = helpers.logDecoder.decodeLogs(
          txVote.receipt.rawLogs
        )[0];
        assert.equal(voteEvent.name, "VoteAdded");
        assert.equal(voteEvent.args[0], guildProposalId);
        assert.equal(voteEvent.args[1], 1);
        assert.equal(voteEvent.args[2], accounts[2]);
        assert.equal(voteEvent.args[3], 100);

        if (constants.GAS_PRICE > 1) {
          const txGasUsed = txVote.receipt.gasUsed;

          // no change as still no ether
          guildBalance = await guildTracker.delta();
          guildBalance.should.be.bignumber.equal(ZERO);

          // account 1 has paid as normal for the vote
          let accounts1Balance = await tracker.delta();
          accounts1Balance.should.be.bignumber.equal(
            new BN(txGasUsed).mul(REAL_GAS_PRICE).neg()
          );
        }
      });

      it("cannot empty contract if voteGas is incorrectly set", async function () {
        // send ether to cover gas
        await send.ether(accounts[0], erc20Guild.address, ether("10"), {
          from: accounts[0],
        });

        let incorrectVoteGas = new BN(220000);
        const guildProposalIncorrectVoteGas = await createProposal({
          guild: erc20Guild,
          options: [
            {
              to: [erc20Guild.address],
              data: [
                await new web3.eth.Contract(ERC20Guild.abi).methods
                  .setConfig(
                    30,
                    30,
                    200,
                    100,
                    0,
                    incorrectVoteGas,
                    REAL_GAS_PRICE,
                    3,
                    60,
                    0,
                    0
                  )
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          account: accounts[3],
        });
        await setVotesOnProposal({
          guild: erc20Guild,
          proposalId: guildProposalIncorrectVoteGas,
          option: 1,
          account: accounts[4],
        });
        await setVotesOnProposal({
          guild: erc20Guild,
          proposalId: guildProposalIncorrectVoteGas,
          option: 1,
          account: accounts[5],
        });
        await time.increase(time.duration.seconds(31));
        await expectRevert(
          erc20Guild.endProposal(guildProposalIncorrectVoteGas),
          "ERC20Guild: Proposal call failed"
        );

        const newProposal = await createProposal(genericProposal);
        const accountBalanceTracker = await balance.tracker(accounts[1]);

        await setVotesOnProposal({
          guild: erc20Guild,
          proposalId: newProposal,
          option: 1,
          account: accounts[1],
        });

        // Checks that the voter spent more than it got refunded
        let accountBalance = await accountBalanceTracker.delta();
        accountBalance.negative.should.be.equal(1); // The variation in balance is negative
      });
    });

    it("only refunds up to max gas price", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20Guild.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20Guild.address, ether("10"), {
        from: accounts[0],
      });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[2]);

      const txVote = await erc20Guild.setVote(guildProposalId, 1, 100, {
        from: accounts[2],
        gasPrice: MAX_GAS_PRICE.add(new BN("50")),
      });
      const voteEvent = helpers.logDecoder.decodeLogs(
        txVote.receipt.rawLogs
      )[0];
      assert.equal(voteEvent.name, "VoteAdded");
      assert.equal(voteEvent.args[0], guildProposalId);
      assert.equal(voteEvent.args[1], 1);
      assert.equal(voteEvent.args[2], accounts[2]);
      assert.equal(voteEvent.args[3], 100);

      if (constants.GAS_PRICE > 1) {
        const txGasUsed = txVote.receipt.gasUsed;

        // mul by -1 as balance has decreased
        guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(
          VOTE_GAS.mul(MAX_GAS_PRICE).neg()
        );
        // account 1 should have a refund
        // the gas for the vote multipled by set gas price minus the real cost of gas multiplied by gas price
        let accounts1Balance = await tracker.delta();
        accounts1Balance
          .neg()
          .should.be.bignumber.equal(
            new BN(txGasUsed)
              .mul(MAX_GAS_PRICE.add(new BN("50")))
              .sub(VOTE_GAS.mul(MAX_GAS_PRICE))
          );
      }
    });
  });

  describe("Signed votes", function () {
    beforeEach(async function () {
      const tokenVault = await erc20Guild.getTokenVault();
      await guildToken.approve(tokenVault, 50000, { from: accounts[1] });
      await guildToken.approve(tokenVault, 50000, { from: accounts[2] });
      await guildToken.approve(tokenVault, 100000, { from: accounts[3] });
      await guildToken.approve(tokenVault, 100000, { from: accounts[4] });
      await guildToken.approve(tokenVault, 200000, { from: accounts[5] });
      await erc20Guild.lockTokens(50000, { from: accounts[1] });
      await erc20Guild.lockTokens(50000, { from: accounts[2] });
      await erc20Guild.lockTokens(100000, { from: accounts[3] });
      await erc20Guild.lockTokens(100000, { from: accounts[4] });
      await erc20Guild.lockTokens(200000, { from: accounts[5] });
    });

    it("can hash a vote", async function () {
      const hashedVote = await erc20Guild.hashVote(
        accounts[1],
        web3.utils.asciiToHex("abc123"),
        1,
        50
      );
      hashedVote.should.exist;
    });

    it("can set a signed vote", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const hashedVote = await erc20Guild.hashVote(
        accounts[2],
        guildProposalId,
        1,
        50
      );
      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20Guild.setSignedVote(
        guildProposalId,
        1,
        50,
        accounts[2],
        signature,
        { from: accounts[3] }
      );

      const voteEvent = helpers.logDecoder.decodeLogs(
        txVote.receipt.rawLogs
      )[0];
      assert.equal(voteEvent.name, "VoteAdded");
      assert.equal(voteEvent.args[0], guildProposalId);
      assert.equal(voteEvent.args[1], 1);
      assert.equal(voteEvent.args[2], accounts[2]);
      assert.equal(voteEvent.args[3], 50);

      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(true);
    });

    it("can set setVotes more efficient than multiple setVote", async function () {
      // Forwarding ~10 votes is 24% less effective than 10 setVote functions
      const getSignature = async function (proposalId, account) {
        const hash = await erc20Guild.hashVote(account, proposalId, 1, 10);
        return fixSignature(await web3.eth.sign(hash, account));
      };

      let proposalIds = [],
        options = [],
        votes = [],
        voters = [],
        signatures = [];

      for (let i = 0; i < 10; i++) {
        const guildProposalId = await createProposal(genericProposal);
        proposalIds.push(guildProposalId);
        options.push(1);
        votes.push(10);
        voters.push(accounts[1]);
        signatures.push(await getSignature(guildProposalId, accounts[1]));
      }
      const calls = await Promise.all(
        proposalIds.map(async (proposalId, i) => {
          return [
            erc20Guild.address,
            await new web3.eth.Contract(ERC20Guild.abi).methods
              .setSignedVote(
                proposalId,
                options[i],
                votes[i],
                voters[i],
                signatures[i]
              )
              .encodeABI(),
          ];
        })
      );

      const txVote3 = await multicall.aggregate(calls, { from: accounts[4] });

      if (constants.GAS_PRICE > 1)
        expect(txVote3.receipt.gasUsed / (VOTE_GAS * 10)).to.be.below(1.25);
    });

    it("cannot set a signed vote twice", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const hashedVote = await erc20Guild.hashVote(
        accounts[2],
        guildProposalId,
        1,
        50
      );
      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20Guild.setSignedVote(
        guildProposalId,
        1,
        50,
        accounts[2],
        signature,
        { from: accounts[3] }
      );

      const voteEvent = helpers.logDecoder.decodeLogs(
        txVote.receipt.rawLogs
      )[0];
      assert.equal(voteEvent.name, "VoteAdded");
      assert.equal(voteEvent.args[0], guildProposalId);
      assert.equal(voteEvent.args[1], 1);
      assert.equal(voteEvent.args[2], accounts[2]);
      assert.equal(voteEvent.args[3], 50);

      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(true);

      await expectRevert(
        erc20Guild.setSignedVote(
          guildProposalId,
          1,
          50,
          accounts[2],
          signature,
          {
            from: accounts[3],
          }
        ),
        "ERC20Guild: Already voted"
      );
    });

    it("cannot set a vote if wrong signer", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const hashedVote = await erc20Guild.hashVote(
        accounts[1],
        guildProposalId,
        1,
        50
      );
      (await erc20Guild.getSignedVote(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[0])
      ); // wrong signer
      accounts[0].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      // now call from different account aka accounts[1]
      await expectRevert(
        erc20Guild.setSignedVote(
          guildProposalId,
          1,
          50,
          accounts[1],
          signature,
          {
            from: accounts[1],
          }
        ),
        "ERC20Guild: Wrong signer"
      );
    });
  });
});
