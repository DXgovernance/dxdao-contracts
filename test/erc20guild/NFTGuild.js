import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert, expect } from "chai";
import * as helpers from "../helpers";
const { fixSignature } = require("../helpers/sign");
const {
  createAndSetupNFT,
  createProposal,
  setNFTVotesOnProposal,
} = require("../helpers/guild");

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
const NFTGuild = artifacts.require("NFTGuildUpgradeable.sol");
const INFTGuild = artifacts.require("INFTGuild.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const ERC20Mock = artifacts.require("ERC20Mock.sol");
const Multicall = artifacts.require("Multicall.sol");

require("chai").should();

contract("NFTGuild", function (accounts) {
  const constants = helpers.constants;
  const ZERO = new BN("0");
  const VOTE_GAS = new BN(100000); // 100k gwei
  const MAX_GAS_PRICE = new BN(8000000000); // 8 gwei
  const REAL_GAS_PRICE = new BN(constants.GAS_PRICE); // 10 gwei (check config)

  let guildToken,
    actionMockA,
    actionMockB,
    nftGuild,
    permissionRegistry,
    genericProposal,
    multicall;

  beforeEach(async function () {
    const proxyAdmin = await ProxyAdmin.new({ from: accounts[0] });

    multicall = await Multicall.new();
    const NFTGuildDeployer = await Create2Deployer.new();
    const nftGuildAddress = helpers.create2Address(
      NFTGuildDeployer.address,
      NFTGuild.bytecode,
      constants.SOME_HASH
    );
    await NFTGuildDeployer.deploy(NFTGuild.bytecode, constants.SOME_HASH);

    guildToken = await createAndSetupNFT(accounts.slice(0, 6));
    permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    const erc20GuildInitializeData = await new web3.eth.Contract(
      NFTGuild.abi
    ).methods
      .initialize(
        guildToken.address,
        30,
        30,
        5000,
        "TestGuild",
        0,
        0,
        10,
        permissionRegistry.address
      )
      .encodeABI();

    const erc20GuildProxy = await TransparentUpgradeableProxy.new(
      nftGuildAddress,
      proxyAdmin.address,
      erc20GuildInitializeData
    );

    nftGuild = await INFTGuild.at(erc20GuildProxy.address);

    actionMockA = await ActionMock.new();
    actionMockB = await ActionMock.new();
    genericProposal = {
      guild: nftGuild,
      options: [
        {
          to: [actionMockA.address, actionMockA.address],
          data: [
            helpers.testCallFrom(nftGuild.address),
            helpers.testCallFrom(nftGuild.address, 666),
          ],
          value: [new BN("0"), new BN("0")],
        },
        {
          to: [actionMockA.address, constants.NULL_ADDRESS],
          data: [helpers.testCallFrom(nftGuild.address), "0x00"],
          value: [new BN("101"), new BN("0")],
        },
        {
          to: [actionMockB.address, constants.NULL_ADDRESS],
          data: [helpers.testCallFrom(nftGuild.address, 666), "0x00"],
          value: [new BN("10"), new BN("0")],
        },
      ],
      account: accounts[3],
    };
  });

  const registerTokens = async function () {
    await nftGuild.registerToken(2, { from: accounts[1] });
    await nftGuild.registerToken(3, { from: accounts[2] });
    await nftGuild.registerToken(4, { from: accounts[3] });
    await nftGuild.registerToken(5, { from: accounts[4] });
    await nftGuild.registerToken(6, { from: accounts[5] });
  };

  const allowActionMockA = async function () {
    const setETHPermissionToActionMockA = await createProposal({
      guild: nftGuild,
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
                nftGuild.address,
                constants.NULL_ADDRESS,
                constants.NULL_SIGNATURE,
                200,
                true
              )
              .encodeABI(),
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                nftGuild.address,
                actionMockA.address,
                constants.NULL_SIGNATURE,
                100,
                true
              )
              .encodeABI(),
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                nftGuild.address,
                actionMockA.address,
                helpers.testCallFrom(nftGuild.address).substring(0, 10),
                50,
                true
              )
              .encodeABI(),
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                nftGuild.address,
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
    await setNFTVotesOnProposal({
      guild: nftGuild,
      proposalId: setETHPermissionToActionMockA,
      option: 1,
      tokenIds: [5],
      account: accounts[4],
    });
    await setNFTVotesOnProposal({
      guild: nftGuild,
      proposalId: setETHPermissionToActionMockA,
      option: 1,
      tokenIds: [6],
      account: accounts[5],
    });
    await time.increase(30);
    await nftGuild.endProposal(setETHPermissionToActionMockA);
  };

  describe("initialization", function () {
    it("initial values are correct", async function () {
      assert.equal(await nftGuild.getToken(), guildToken.address);
      assert.equal(
        await nftGuild.getPermissionRegistry(),
        permissionRegistry.address
      );
      assert.equal(await nftGuild.getName(), "TestGuild");
      assert.equal(await nftGuild.getTotalProposals(), 0);
      assert.equal(await nftGuild.getActiveProposalsNow(), 0);
      assert.equal(await nftGuild.getProposalsIdsLength(), 0);
      assert.equal(await nftGuild.getTotalMembers(), 0);
      assert.deepEqual(await nftGuild.getProposalsIds(), []);
      assert.equal(
        await nftGuild.getMinimumTokensLockedForProposalCreation(),
        0
      );
    });

    it("cannot initialize with zero token", async function () {
      nftGuild = await NFTGuild.new();
      await expectRevert(
        nftGuild.initialize(
          constants.NULL_ADDRESS,
          30,
          30,
          5000,
          100,
          "TestGuild",
          0,
          0,
          3,
          60,
          permissionRegistry.address
        ),
        "NFTGuild: token cant be zero address"
      );
    });

    it("cannot initialize with zero proposalTime", async function () {
      nftGuild = await NFTGuild.new();
      await expectRevert(
        nftGuild.initialize(
          guildToken.address,
          0,
          30,
          5000,
          100,
          "TestGuild",
          0,
          0,
          3,
          60,
          permissionRegistry.address
        ),
        "NFTGuild: proposal time has to be more than 0"
      );
    });

    it("cannot initialize with lockTime lower than proposalTime", async function () {
      nftGuild = await NFTGuild.new();
      await expectRevert(
        nftGuild.initialize(
          guildToken.address,
          30,
          30,
          5000,
          100,
          "TestGuild",
          0,
          0,
          3,
          29,
          permissionRegistry.address
        ),
        "NFTGuild: lockTime has to be higher or equal to proposalTime"
      );
    });

    it("cannot initialize with zero locktime", async function () {
      nftGuild = await NFTGuild.new();
      await expectRevert(
        nftGuild.initialize(
          guildToken.address,
          30,
          30,
          0,
          100,
          "TestGuild",
          0,
          0,
          3,
          60,
          permissionRegistry.address
        ),
        "NFTGuild: voting power for execution has to be more than 0"
      );
    });

    it("cannot initialize twice", async function () {
      nftGuild = await NFTGuild.at(nftGuild.address);
      await expectRevert(
        nftGuild.initialize(
          guildToken.address,
          30,
          30,
          5000,
          100,
          "TestGuild",
          0,
          0,
          3,
          60,
          permissionRegistry.address
        ),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("setConfig", function () {
    beforeEach(async function () {
      await lockTokens();
    });

    it("execute an NFTGuild setConfig proposal on the guild", async function () {
      const guildTokenTotalSupply = await guildToken.totalSupply();

      assert.equal(await nftGuild.getProposalTime(), 30);
      assert.equal(await nftGuild.getTimeForExecution(), 30);
      assert.equal(
        (await nftGuild.getVotingPowerForProposalExecution()).toString(),
        guildTokenTotalSupply
          .mul(new BN("5000"))
          .div(new BN("10000"))
          .toString()
      );
      assert.equal(
        (await nftGuild.getVotingPowerForProposalCreation()).toString(),
        guildTokenTotalSupply.mul(new BN("100")).div(new BN("10000")).toString()
      );
      assert.equal(await nftGuild.getVoteGas(), 0);
      assert.equal(await nftGuild.getMaxGasPrice(), 0);
      assert.equal(await nftGuild.getMaxActiveProposals(), 10);
      assert.equal(await nftGuild.getLockTime(), 60);
      assert.equal(await nftGuild.getMinimumMembersForProposalCreation(), 0);
      assert.equal(
        await nftGuild.getMinimumTokensLockedForProposalCreation(),
        0
      );

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [nftGuild.address],
            data: [
              await new web3.eth.Contract(NFTGuild.abi).methods
                .setConfig(
                  "15",
                  "30",
                  "5001",
                  "1001",
                  "1",
                  "10",
                  "4",
                  "61",
                  "5",
                  "50000"
                )
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      const receipt = await nftGuild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "3",
      });

      assert.equal(await nftGuild.getProposalTime(), 15);
      assert.equal(await nftGuild.getTimeForExecution(), 30);
      assert.equal(
        (await nftGuild.getVotingPowerForProposalExecution()).toString(),
        guildTokenTotalSupply
          .mul(new BN("5001"))
          .div(new BN("10000"))
          .toString()
      );
      assert.equal(
        (await nftGuild.getVotingPowerForProposalCreation()).toString(),
        guildTokenTotalSupply
          .mul(new BN("1001"))
          .div(new BN("10000"))
          .toString()
      );
      assert.equal(await nftGuild.getVoteGas(), 1);
      assert.equal(await nftGuild.getMaxGasPrice(), 10);
      assert.equal(await nftGuild.getMaxActiveProposals(), 4);
      assert.equal(await nftGuild.getLockTime(), 61);
      assert.equal(await nftGuild.getMinimumMembersForProposalCreation(), 5);
      assert.equal(
        await nftGuild.getMinimumTokensLockedForProposalCreation(),
        50000
      );
    });
  });

  describe("setETHPermission", function () {
    beforeEach(async function () {
      await lockTokens();
    });

    it("Proposal for setting permission delay should succeed", async function () {
      assert.equal(
        await permissionRegistry.getETHPermissionDelay(nftGuild.address),
        "0"
      );

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [permissionRegistry.address],
            data: [
              await new web3.eth.Contract(PermissionRegistry.abi).methods
                .setETHPermissionDelay(nftGuild.address, 120)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[4],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(guildProposalId);
      assert.equal(
        await permissionRegistry.getETHPermissionDelay(nftGuild.address),
        "120"
      );
    });
  });

  describe("createProposal", function () {
    beforeEach(async function () {
      await lockTokens();
    });

    it("should not create proposal without enough tokens locked", async function () {
      const MINIMUM_TOKENS_LOCKED = 3000;

      assert.equal(await nftGuild.getTotalMembers(), 5);

      // Create a proposal to execute setConfig with minimum tokens locked 3000 for proposal creation
      const setConfigProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [nftGuild.address],
            data: [
              await new web3.eth.Contract(NFTGuild.abi).methods
                .setConfig(
                  "15",
                  "30",
                  "5001",
                  "1001",
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

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: setConfigProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: setConfigProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      // wait for proposal to end and execute setConfig proposal
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(setConfigProposalId);

      assert.equal(
        await nftGuild.getMinimumTokensLockedForProposalCreation(),
        MINIMUM_TOKENS_LOCKED
      );

      // wait to unlock tokens and withdraw all members tokens
      await time.increase(new BN("62"));
      await withdrawTokens();
      assert.equal(await nftGuild.getTotalMembers(), 0);
      assert.equal(await nftGuild.getTotalLocked(), 0);

      // Expect new proposal to be rejected with 0 tokens locked.
      await expectRevert(
        createProposal(genericProposal),
        "NFTGuild: Not enough tokens locked to create a proposal"
      );

      // Lock new tokens but not enough for minimum required to pass
      await registerTokens();
      assert.equal(await nftGuild.getTotalMembers(), 1);
      assert.equal(await nftGuild.getTotalLocked(), MINIMUM_TOKENS_LOCKED - 1);

      // Expect new proposal to be rejected with only 2999 tokens locked.
      await expectRevert(
        createProposal(genericProposal),
        "NFTGuild: Not enough tokens locked to create a proposal"
      );
    });

    it("should not create proposal without enough members", async function () {
      const MINIMUM_MEMBERS = 3;

      assert.equal(await nftGuild.getTotalMembers(), 5);

      // Create a proposal to execute setConfig with minimum 3 members to create proposal.
      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [nftGuild.address],
            data: [
              await new web3.eth.Contract(NFTGuild.abi).methods
                .setConfig(
                  "15",
                  "30",
                  "5001",
                  "1001",
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

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      // wait for proposal to end and execute setConfig proposal
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(guildProposalId);

      assert.equal(
        await nftGuild.getMinimumMembersForProposalCreation(),
        MINIMUM_MEMBERS
      );

      // wait to unlock tokens and withdraw 3 members tokens.
      await time.increase(new BN("62"));
      await nftGuild.withdrawTokens(50000, { from: accounts[1] });
      await nftGuild.withdrawTokens(50000, { from: accounts[2] });
      await nftGuild.withdrawTokens(100000, { from: accounts[3] });

      assert.equal(await nftGuild.getTotalMembers(), 2);

      // Expect new proposal to be rejected with only 2 members.
      await expectRevert(
        createProposal(genericProposal),
        "NFTGuild: Not enough members to create a proposal"
      );

      // withdraw remaining members tokens.
      await nftGuild.withdrawTokens(100000, { from: accounts[4] });
      await nftGuild.withdrawTokens(200000, { from: accounts[5] });
      assert.equal(await nftGuild.getTotalMembers(), 0);

      // Expect new proposal to be rejected with only 0.
      await expectRevert(
        createProposal(genericProposal),
        "NFTGuild: Not enough members to create a proposal"
      );
    });

    it("cannot create a proposal with invalid totalOptions", async function () {
      const invalidtotalOptions = 3;
      await expectRevert(
        nftGuild.createProposal(
          [actionMockA.address, actionMockA.address],
          ["0x00", "0x00"],
          [1, 1],
          invalidtotalOptions,
          "Guild Test Proposal",
          constants.SOME_HASH,
          { from: accounts[2] }
        ),
        "NFTGuild: Invalid totalOptions or option calls length"
      );
    });

    it("cannot create a proposal without enough creation votes", async function () {
      await expectRevert(
        nftGuild.createProposal(
          [actionMockA.address],
          ["0x00"],
          [1],
          1,
          "Guild Test Proposal",
          constants.SOME_HASH,
          { from: accounts[9] }
        ),
        "NFTGuild: Not enough votingPower to create proposal"
      );
    });

    it("cannot create a proposal with uneven _to and _data arrays", async function () {
      await expectRevert(
        nftGuild.createProposal(
          [actionMockA.address],
          [],
          [0],
          1,
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "NFTGuild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with uneven _to and _value arrays", async function () {
      await expectRevert(
        nftGuild.createProposal(
          [actionMockA.address],
          ["0x0"],
          [],
          1,
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "NFTGuild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with empty _to, _data and _value arrays", async function () {
      await expectRevert(
        nftGuild.createProposal(
          [],
          [],
          [],
          1,
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "NFTGuild: to, data value arrays cannot be empty"
      );
    });

    it("cannot create a proposal if the max amount of active proposals is reached", async function () {
      const firstProposalId = await createProposal(genericProposal);
      assert.equal(await nftGuild.getActiveProposalsNow(), "1");
      await time.increase(10);

      // Create 9 more proposals and have 10 active proposals
      for (let i = 0; i < 9; i++) await createProposal(genericProposal);

      assert.equal(await nftGuild.getActiveProposalsNow(), "10");

      // Cant create because maxActiveProposals limit reached
      await expectRevert(
        createProposal(genericProposal),
        "NFTGuild: Maximum amount of active proposals reached"
      );

      // Finish one proposal and can create another
      await time.increase(20);
      await nftGuild.endProposal(firstProposalId);
      assert.equal(await nftGuild.getActiveProposalsNow(), "9");

      await createProposal(genericProposal);
    });

    it("cannot create a proposal with more actions to the ones allowed", async function () {
      await expectRevert(
        createProposal({
          guild: nftGuild,
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
        "NFTGuild: Maximum amount of options per proposal reached"
      );
    });
  });

  describe("setVote", function () {
    beforeEach(async function () {
      await lockTokens();
    });

    it("cannot reduce votes after initial vote", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
        votingPower: 25000,
      });

      await expectRevert(
        setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: guildProposalId,
          option: 1,
          tokenIds: [4],
          account: accounts[3],
          votingPower: 20000,
        }),
        "NFTGuild: Invalid votingPower amount"
      );
    });

    it("cannot vote with more than locked voting power", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const votingPower = await nftGuild.votingPowerOf(accounts[3]);
      await expectRevert(
        setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: guildProposalId,
          option: 1,
          tokenIds: [4],
          account: accounts[3],
          votingPower: votingPower + 1,
        }),
        "NFTGuild: Invalid votingPower amount"
      );
    });

    it("cannot change voted option after initial vote", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 0,
        tokenIds: [4],
        account: accounts[3],
        votingPower: 25000,
      });

      await expectRevert(
        setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: guildProposalId,
          option: 1,
          tokenIds: [4],
          account: accounts[3],
        }),
        "NFTGuild: Cannot change option voted, only increase votingPower"
      );
    });
  });

  describe("endProposal", function () {
    beforeEach(async function () {
      await lockTokens();
    });

    it("cannot execute as proposal not ended yet", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      await expectRevert(
        nftGuild.endProposal(guildProposalId),
        "NFTGuild: Proposal hasn't ended yet"
      );
    });

    it("proposal rejected if not enough votes to execute proposal when proposal ends", async function () {
      const guildProposalId = await createProposal(genericProposal);
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });
      await time.increase(time.duration.seconds(61));

      await nftGuild.endProposal(guildProposalId);
      const { state } = await nftGuild.getProposal(guildProposalId);
      assert.equal(state, constants.WALLET_SCHEME_PROPOSAL_STATES.rejected);
    });

    it("Proposals are marked as rejected if voted on action 0", async function () {
      const proposalId = await createProposal(genericProposal);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 0,
        account: accounts[2],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 0,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 0,
        tokenIds: [5],
        account: accounts[4],
      });

      await expectRevert(
        nftGuild.endProposal(proposalId),
        "NFTGuild: Proposal hasn't ended yet"
      );

      await time.increase(time.duration.seconds(31));

      const receipt = await nftGuild.endProposal(proposalId);

      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "2",
      });
      await expectRevert(
        nftGuild.endProposal(proposalId),
        "NFTGuild: Proposal already executed"
      );

      const proposalInfo = await nftGuild.getProposal(proposalId);
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
        guild: nftGuild,
        options: [
          {
            to: [actionMockA.address],
            data: [testWithNoargsEncoded],
            value: [0],
          },
        ],
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[2],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));

      await expectRevert(
        nftGuild.endProposal(guildProposalId),
        "PermissionRegistry: Call not allowed"
      );
    });

    it("proposal fail because it run out of time to execute", async function () {
      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [actionMockA.address, actionMockA.address],
            data: [
              helpers.testCallFrom(nftGuild.address),
              helpers.testCallFrom(nftGuild.address, 666),
            ],
            value: [new BN("0"), new BN("0")],
          },
        ],
        tokenIds: [4],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(30));
      await expectRevert(
        nftGuild.endProposal(guildProposalId),
        "PermissionRegistry: Call not allowed"
      );

      await time.increase(time.duration.seconds(30));
      await nftGuild.endProposal(guildProposalId);
      assert.equal((await nftGuild.getProposal(guildProposalId)).state, 4);
    });
  });

  describe("action votes tie checks", async function () {
    let proposalWithThreeOptions;

    beforeEach(async function () {
      await lockTokens();

      // decrease amount of voting power for proposal execution
      // so more tests cases can be done
      const decreaseVotingPowerNeeded = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [nftGuild.address],
            data: [
              await new web3.eth.Contract(NFTGuild.abi).methods
                .setConfig(
                  30,
                  30,
                  200,
                  100,
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
        tokenIds: [4],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: decreaseVotingPowerNeeded,
        option: 1,
        tokenIds: [5],
        account: accounts[4],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: decreaseVotingPowerNeeded,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(decreaseVotingPowerNeeded);

      proposalWithThreeOptions = {
        guild: nftGuild,
        options: [
          {
            to: [actionMockA.address, actionMockA.address],
            data: [
              helpers.testCallFrom(nftGuild.address),
              helpers.testCallFrom(nftGuild.address, 666),
            ],
            value: [new BN("0"), new BN("0")],
          },
          {
            to: [actionMockA.address, actionMockA.address],
            data: [
              helpers.testCallFrom(nftGuild.address),
              helpers.testCallFrom(nftGuild.address, 666),
            ],
            value: [new BN("0"), new BN("0")],
          },
          {
            to: [actionMockA.address, actionMockA.address],
            data: [
              helpers.testCallFrom(nftGuild.address),
              helpers.testCallFrom(nftGuild.address, 666),
            ],
            value: [new BN("0"), new BN("0")],
          },
        ],
        tokenIds: [4],
        account: accounts[3],
      };

      const allowAllActionsMock = async function () {
        const setPermissionToActionMockA = await createProposal({
          guild: nftGuild,
          options: [
            {
              to: [permissionRegistry.address],
              data: [
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .setETHPermission(
                    nftGuild.address,
                    actionMockA.address,
                    helpers.testCallFrom(nftGuild.address).substring(0, 10),
                    1000,
                    true
                  )
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          account: accounts[1],
        });
        await setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: setPermissionToActionMockA,
          option: 1,
          tokenIds: [5],
          account: accounts[4],
        });
        await setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: setPermissionToActionMockA,
          option: 1,
          tokenIds: [6],
          account: accounts[5],
        });
        await time.increase(30);
        await nftGuild.endProposal(setPermissionToActionMockA);
      };

      await allowAllActionsMock();
    });

    it("if there is a tie between winning actions, reject", async function () {
      const guildProposalId = await createProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 3,
        account: accounts[2],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(guildProposalId);

      const { state } = await nftGuild.getProposal(guildProposalId);
      assert.equal(state, constants.WALLET_SCHEME_PROPOSAL_STATES.rejected);
    });

    it("when there are two tied losing actions and one winning action, execute", async function () {
      const guildProposalId = await createProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 2,
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 3,
        tokenIds: [6],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(guildProposalId);

      const { state } = await nftGuild.getProposal(guildProposalId);
      assert.equal(
        state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
    });

    it("when there is a tie between an action and no action, reject", async function () {
      const guildProposalId = await createProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 0,
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[2],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(guildProposalId);

      const { state } = await nftGuild.getProposal(guildProposalId);
      assert.equal(state, constants.WALLET_SCHEME_PROPOSAL_STATES.rejected);
    });

    it("when there is a tie between more than two actions, reject", async function () {
      const guildProposalId = await createProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 2,
        tokenIds: [4],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 3,
        tokenIds: [5],
        account: accounts[4],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(guildProposalId);

      const { state } = await nftGuild.getProposal(guildProposalId);
      assert.equal(state, constants.WALLET_SCHEME_PROPOSAL_STATES.rejected);
    });

    it("when there is a winning action in the middle of two tied actions, execute", async function () {
      const guildProposalId = await createProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 2,
        tokenIds: [6],
        account: accounts[5],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 3,
        tokenIds: [4],
        account: accounts[3],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(guildProposalId);

      const { state } = await nftGuild.getProposal(guildProposalId);
      assert.equal(
        state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
    });
  });

  describe("permission registry checks", function () {
    let testToken;

    beforeEach(async function () {
      await lockTokens();
      await allowActionMockA();

      testToken = await ERC20Mock.new(
        accounts[1],
        1000,
        "TestToken",
        "TTT",
        "18"
      );
      await testToken.transfer(nftGuild.address, 300, { from: accounts[1] });

      const setTestPermissions = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [
              permissionRegistry.address,
              permissionRegistry.address,
              permissionRegistry.address,
            ],
            data: [
              await new web3.eth.Contract(PermissionRegistry.abi).methods
                .setETHPermission(
                  nftGuild.address,
                  actionMockB.address,
                  constants.NULL_SIGNATURE,
                  0,
                  false
                )
                .encodeABI(),
              await new web3.eth.Contract(PermissionRegistry.abi).methods
                .setETHPermission(
                  nftGuild.address,
                  testToken.address,
                  web3.eth.abi.encodeFunctionSignature(
                    "transfer(address,uint256)"
                  ),
                  0,
                  true
                )
                .encodeABI(),
              await new web3.eth.Contract(PermissionRegistry.abi).methods
                .addERC20Limit(nftGuild.address, testToken.address, 200, 0)
                .encodeABI(),
            ],
            value: [0, 0, 0],
          },
        ],
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: setTestPermissions,
        option: 1,
        tokenIds: [5],
        account: accounts[4],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: setTestPermissions,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });
      await time.increase(30);
      await nftGuild.endProposal(setTestPermissions);
    });

    it("fail to execute a not allowed proposal to a contract from the guild", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [actionMockB.address],
            data: [helpers.testCallFrom(nftGuild.address)],
            value: [0],
          },
        ],
        tokenIds: [4],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(guildProposalId),
        "PermissionRegistry: Call not allowed"
      );
    });

    it("fail to execute a transfer over global transfer limits", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [accounts[8], accounts[7], actionMockA.address],
            data: ["0x00", "0x00", helpers.testCallFrom(nftGuild.address)],
            value: [100, 51, 50],
          },
        ],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(guildProposalId),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("fail to execute an ERC20 transfer over global transfer limits", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [testToken.address, testToken.address],
            data: [
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[2], 100)
                .encodeABI(),
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[3], 101)
                .encodeABI(),
            ],
            value: [0, 0],
          },
        ],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(guildProposalId),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("execute ERC20 transfers withing the transfer limit", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [testToken.address, testToken.address],
            data: [
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[2], 100)
                .encodeABI(),
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[3], 99)
                .encodeABI(),
            ],
            value: [0, 0],
          },
        ],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      const receipt = await nftGuild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "3",
      });
    });

    it("try to set eth permission used between calls to avoid checks and fail", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [
              actionMockA.address,
              actionMockA.address,
              actionMockA.address,
              permissionRegistry.address,
              actionMockA.address,
            ],
            data: [
              "0x0",

              // setETHPermissionUsed from the ActionMock contract by using execute call
              await new web3.eth.Contract(ActionMock.abi).methods
                .executeCall(
                  permissionRegistry.address,
                  await new web3.eth.Contract(PermissionRegistry.abi).methods
                    .setETHPermissionUsed(
                      nftGuild.address,
                      actionMockA.address,
                      "0x0",
                      0
                    )
                    .encodeABI(),
                  0
                )
                .encodeABI(),
              "0x0",

              // setETHPermissionUsed from the guild directly
              await new web3.eth.Contract(PermissionRegistry.abi).methods
                .setETHPermissionUsed(
                  nftGuild.address,
                  actionMockA.address,
                  "0x0",
                  0
                )
                .encodeABI(),
              "0x0",
            ],
            value: [99, 0, 1, 0, 1],
          },
        ],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(guildProposalId),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("fail to execute a transfer exceeding the allowed on a call", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [actionMockA.address, actionMockA.address],
            data: [
              helpers.testCallFrom(nftGuild.address),
              helpers.testCallFrom(nftGuild.address),
            ],
            value: [25, 26],
          },
        ],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(guildProposalId),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("fail to execute a transfer exceeding the allowed on a wildcard permission call", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [actionMockA.address, actionMockA.address],
            data: ["0x00", "0x00"],
            value: [50, 51],
          },
        ],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(guildProposalId),
        "PermissionRegistry: Value limit reached'"
      );
    });
  });

  describe("complete proposal process", function () {
    beforeEach(async function () {
      await lockTokens();
      await allowActionMockA();
    });

    it("execute a proposal to a contract from the guild", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 10,
        from: accounts[0],
      });

      const allowActionMock = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [permissionRegistry.address],
            data: [
              await new web3.eth.Contract(PermissionRegistry.abi).methods
                .setETHPermission(
                  nftGuild.address,
                  actionMockB.address,
                  helpers.testCallFrom(nftGuild.address).substring(0, 10),
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
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: allowActionMock,
        option: 1,
        tokenIds: [4],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: allowActionMock,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(allowActionMock);

      const guildProposalId = await createProposal(genericProposal);
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 3,
        account: accounts[3],
      });

      const txVote = await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 3,
        tokenIds: [6],
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(VOTE_GAS.toNumber());

      await time.increase(time.duration.seconds(31));
      const receipt = await nftGuild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "3",
      });
      expectEvent.inTransaction(receipt.tx, actionMockB, "ReceivedEther", {
        _sender: nftGuild.address,
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
      } = await nftGuild.getProposal(guildProposalId);

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
      const votes = await nftGuild.votingPowerOf(accounts[2]);
      votes.should.be.bignumber.equal("50000");
    });

    it("can read votingPowerOf multiple accounts", async function () {
      const calls = await Promise.all(
        [accounts[2], accounts[5]].map(async account => {
          return [
            nftGuild.address,
            await new web3.eth.Contract(NFTGuild.abi).methods
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

  describe("lock/release tokens", function () {
    it("can lock/release tokens", async function () {
      const tokenVault = await nftGuild.getTokenVault();
      const TIMELOCK = new BN("60");

      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50000, { from: accounts[1] });
      assert.equal(await nftGuild.getTotalMembers(), 0);

      const txLock = await nftGuild.lockTokens(50000, { from: accounts[1] });
      const lockEvent = helpers.logDecoder.decodeLogs(
        txLock.receipt.rawLogs
      )[2];
      assert.equal(lockEvent.name, "TokensLocked");
      assert.equal(lockEvent.args[0], accounts[1]);
      assert.equal(lockEvent.args[1], 50000);
      assert.equal(await nftGuild.getTotalMembers(), 1);

      const now = await time.latest();
      let voterLockTimestamp = await nftGuild.getVoterLockTimestamp(
        accounts[1]
      );
      voterLockTimestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      let voterLocked = await nftGuild.votingPowerOf(accounts[1]);
      voterLocked.should.be.bignumber.equal("50000");

      let votes = await nftGuild.votingPowerOf(accounts[1]);
      votes.should.be.bignumber.equal("50000");

      let totalLocked = await nftGuild.getTotalLocked();
      totalLocked.should.be.bignumber.equal("50000");

      // try lo release before time and fail
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.withdrawTokens(1, { from: accounts[1] }),
        "NFTGuild: Tokens still locked"
      );

      // move past the time lock period
      await time.increase(TIMELOCK.add(new BN("1")));

      // Cant transfer because all user tokens are locked
      await expectRevert(
        guildToken.transfer(accounts[0], 50, { from: accounts[1] }),
        "ERC20: transfer amount exceeds balance"
      );

      // Cannot withdraw zero tokens
      await expectRevert(
        nftGuild.withdrawTokens(0, { from: accounts[1] }),
        "NFTGuild: amount of tokens to withdraw must be greater than 0"
      );
      // Cant lock zero tokens
      await expectRevert(
        nftGuild.lockTokens(0, { from: accounts[1] }),
        "NFTGuild: Tokens to lock should be higher than 0"
      );

      // try to release more than locked and fail
      await expectRevert(
        nftGuild.withdrawTokens(50001, { from: accounts[1] }),
        "NFTGuild: Unable to withdraw more tokens than locked"
      );

      const txRelease = await nftGuild.withdrawTokens(50000, {
        from: accounts[1],
      });
      assert.equal(await nftGuild.getTotalMembers(), 0);

      const withdrawEvent = helpers.logDecoder.decodeLogs(
        txRelease.receipt.rawLogs
      )[1];
      assert.equal(withdrawEvent.name, "TokensWithdrawn");
      assert.equal(withdrawEvent.args[0], accounts[1]);
      assert.equal(withdrawEvent.args[1], 50000);

      votes = await nftGuild.votingPowerOf(accounts[1]);
      votes.should.be.bignumber.equal("0");

      totalLocked = await nftGuild.getTotalLocked();
      totalLocked.should.be.bignumber.equal("0");
    });

    it("can lock tokens and check snapshot", async function () {});

    it("increases lock time to at least proposal end time after voting", async function () {
      const tokenVault = await nftGuild.getTokenVault();
      const TIMELOCK = new BN("60");

      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50000, { from: accounts[3] });
      assert.equal(await nftGuild.getTotalMembers(), 0);

      // Lock tokens
      const txLock = await nftGuild.lockTokens(50000, { from: accounts[3] });
      const lockEvent = helpers.logDecoder.decodeLogs(
        txLock.receipt.rawLogs
      )[2];
      assert.equal(lockEvent.name, "TokensLocked");
      assert.equal(lockEvent.args[0], accounts[3]);
      assert.equal(lockEvent.args[1], 50000);
      assert.equal(await nftGuild.getTotalMembers(), 1);

      // Ensure tokens have been locked
      const timestampOnLock = await time.latest();
      let voterLockTimestampAtLockTime = await nftGuild.getVoterLockTimestamp(
        accounts[3]
      );
      voterLockTimestampAtLockTime.should.be.bignumber.equal(
        timestampOnLock.add(TIMELOCK)
      );

      // Increase time
      const proposalDelay = new BN("40");
      await time.increase(proposalDelay);

      // Create a new proposal and vote on it
      const guildProposalId = await createProposal(genericProposal);
      const { endTime: proposalEndTime } = await nftGuild.getProposal(
        guildProposalId
      );

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 3,
        tokenIds: [4],
        account: accounts[3],
      });

      // Ensure tokens lock has been extended
      let voterLockTimestampAfterVote = await nftGuild.getVoterLockTimestamp(
        accounts[3]
      );
      voterLockTimestampAfterVote.should.not.be.bignumber.equal(
        voterLockTimestampAtLockTime
      );
      voterLockTimestampAfterVote.should.be.bignumber.equal(proposalEndTime);

      // try lo release and fail
      await expectRevert(
        nftGuild.withdrawTokens(1, { from: accounts[3] }),
        "NFTGuild: Tokens still locked"
      );
      const timestampAfterVote = await time.latest();

      // move past the original time lock period and try to redeem and fail
      const timeTillOriginalTimeLock =
        voterLockTimestampAtLockTime.sub(timestampAfterVote);
      await time.increase(timeTillOriginalTimeLock);
      await expectRevert(
        nftGuild.withdrawTokens(1, { from: accounts[3] }),
        "NFTGuild: Tokens still locked"
      );

      const timestampAfterOriginalTimeLock = await time.latest();
      const timeTillVoteTimeLock = voterLockTimestampAfterVote.sub(
        timestampAfterOriginalTimeLock
      );
      await time.increase(timeTillVoteTimeLock);
      const txRelease = await nftGuild.withdrawTokens(50000, {
        from: accounts[3],
      });
      assert.equal(await nftGuild.getTotalMembers(), 0);

      const withdrawEvent = helpers.logDecoder.decodeLogs(
        txRelease.receipt.rawLogs
      )[1];
      assert.equal(withdrawEvent.name, "TokensWithdrawn");
      assert.equal(withdrawEvent.args[0], accounts[3]);
      assert.equal(withdrawEvent.args[1], 50000);
    });
  });

  describe("refund votes", function () {
    beforeEach(async function () {
      await lockTokens();

      const guildProposalId = await createProposal({
        guild: nftGuild,
        options: [
          {
            to: [nftGuild.address],
            data: [
              await new web3.eth.Contract(NFTGuild.abi).methods
                .setConfig(
                  30,
                  30,
                  200,
                  100,
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
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[4],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: guildProposalId,
        option: 1,
        tokenIds: [6],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(guildProposalId);
      (await nftGuild.getVoteGas()).should.be.bignumber.equal(VOTE_GAS);
      (await nftGuild.getMaxGasPrice()).should.be.bignumber.equal(
        MAX_GAS_PRICE
      );
    });

    describe("with high gas vote setting (above cost) and standard gas price", function () {
      it("can pay ETH to the guild (to cover votes)", async function () {
        const tracker = await balance.tracker(nftGuild.address);
        let guildBalance = await tracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO); // empty

        await send.ether(accounts[5], nftGuild.address, VOTE_GAS, {
          from: accounts[5],
        });

        guildBalance = await tracker.delta();
        guildBalance.should.be.bignumber.equal(VOTE_GAS);
      });

      it("can set a vote and refund gas", async function () {
        const guildProposalId = await createProposal(genericProposal);

        const guildTracker = await balance.tracker(nftGuild.address);

        // send ether to cover gas
        await send.ether(accounts[0], nftGuild.address, ether("10"), {
          from: accounts[0],
        });
        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ether("10"));

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await nftGuild.setVote(guildProposalId, 1, 100, {
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

        const guildTracker = await balance.tracker(nftGuild.address);

        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO);

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await nftGuild.setVote(guildProposalId, 1, 100, {
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
        await send.ether(accounts[0], nftGuild.address, ether("10"), {
          from: accounts[0],
        });

        let incorrectVoteGas = new BN(220000);
        const guildProposalIncorrectVoteGas = await createProposal({
          guild: nftGuild,
          options: [
            {
              to: [nftGuild.address],
              data: [
                await new web3.eth.Contract(NFTGuild.abi).methods
                  .setConfig(
                    30,
                    30,
                    200,
                    100,
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
        await setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: guildProposalIncorrectVoteGas,
          option: 1,
          tokenIds: [5],
          account: accounts[4],
        });
        await setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: guildProposalIncorrectVoteGas,
          option: 1,
          tokenIds: [6],
          account: accounts[5],
        });
        await time.increase(time.duration.seconds(31));
        await expectRevert(
          nftGuild.endProposal(guildProposalIncorrectVoteGas),
          "NFTGuild: Proposal call failed"
        );

        const newProposal = await createProposal(genericProposal);
        const accountBalanceTracker = await balance.tracker(accounts[1]);

        await setNFTVotesOnProposal({
          guild: nftGuild,
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

      const guildTracker = await balance.tracker(nftGuild.address);

      // send ether to cover gas
      await send.ether(accounts[0], nftGuild.address, ether("10"), {
        from: accounts[0],
      });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[2]);

      const txVote = await nftGuild.setVote(guildProposalId, 1, 100, {
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
      const tokenVault = await nftGuild.getTokenVault();
      await guildToken.approve(tokenVault, 50000, { from: accounts[1] });
      await guildToken.approve(tokenVault, 50000, { from: accounts[2] });
      await guildToken.approve(tokenVault, 100000, { from: accounts[3] });
      await guildToken.approve(tokenVault, 100000, { from: accounts[4] });
      await guildToken.approve(tokenVault, 200000, { from: accounts[5] });
      await nftGuild.lockTokens(50000, { from: accounts[1] });
      await nftGuild.lockTokens(50000, { from: accounts[2] });
      await nftGuild.lockTokens(100000, { from: accounts[3] });
      await nftGuild.lockTokens(100000, { from: accounts[4] });
      await nftGuild.lockTokens(200000, { from: accounts[5] });
    });

    it("can hash a vote", async function () {
      const hashedVote = await nftGuild.hashVote(
        accounts[1],
        web3.utils.asciiToHex("abc123"),
        1,
        50
      );
      hashedVote.should.exist;
    });

    it("can set a signed vote", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const hashedVote = await nftGuild.hashVote(
        accounts[2],
        guildProposalId,
        1,
        50
      );
      (await nftGuild.getSignedVote(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await nftGuild.setSignedVote(
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

      (await nftGuild.getSignedVote(hashedVote)).should.be.equal(true);
    });

    it("can set setVotes more efficient than multiple setVote", async function () {
      // Forwarding ~10 votes is 24% less effective than 10 setVote functions
      const getSignature = async function (proposalId, account) {
        const hash = await nftGuild.hashVote(account, proposalId, 1, 10);
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
            nftGuild.address,
            await new web3.eth.Contract(NFTGuild.abi).methods
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

      const hashedVote = await nftGuild.hashVote(
        accounts[2],
        guildProposalId,
        1,
        50
      );
      (await nftGuild.getSignedVote(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await nftGuild.setSignedVote(
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

      (await nftGuild.getSignedVote(hashedVote)).should.be.equal(true);

      await expectRevert(
        nftGuild.setSignedVote(guildProposalId, 1, 50, accounts[2], signature, {
          from: accounts[3],
        }),
        "NFTGuild: Already voted"
      );
    });

    it("cannot set a vote if wrong signer", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const hashedVote = await nftGuild.hashVote(
        accounts[1],
        guildProposalId,
        1,
        50
      );
      (await nftGuild.getSignedVote(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[0])
      ); // wrong signer
      accounts[0].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      // now call from different account aka accounts[1]
      await expectRevert(
        nftGuild.setSignedVote(guildProposalId, 1, 50, accounts[1], signature, {
          from: accounts[1],
        }),
        "NFTGuild: Wrong signer"
      );
    });
  });
});
