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

const ERC20Guild = artifacts.require("ERC20GuildUpgradeable.sol");
const IERC20Guild = artifacts.require("IERC20Guild.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const ERC20Mock = artifacts.require("ERC20Mock.sol");
const Multicall = artifacts.require("Multicall.sol");
const MultiSend = artifacts.require("MultiSend.sol");
const TestAvatar = artifacts.require("TestAvatar.sol");
const PermissionRegistryModule = artifacts.require(
  "PermissionRegistryModule.sol"
);

require("chai").should();

contract("PermissionRegistryModule", function (accounts) {
  const constants = helpers.constants;
  const VOTE_GAS = new BN(100000); // 100k gwei

  let guildToken,
    actionMockA,
    actionMockB,
    erc20Guild,
    permissionRegistry,
    genericProposal,
    multicall,
    multiSend,
    testAvatar,
    permissionRegistryModule;

  beforeEach(async function () {
    const proxyAdmin = await ProxyAdmin.new({ from: accounts[0] });

    multicall = await Multicall.new();

    const erc20GuildImplementation = await ERC20Guild.new();

    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6),
      [0, 50000, 50000, 100000, 100000, 200000]
    );
    permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    multiSend = await MultiSend.new();
    testAvatar = await TestAvatar.new();
    permissionRegistryModule = await PermissionRegistryModule.new(
      permissionRegistry.address
    );

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
      erc20GuildImplementation.address,
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
          to: [permissionRegistryModule.address],
          data: [
            await new web3.eth.Contract(PermissionRegistryModule.abi).methods
              .relayTransactions(
                testAvatar.address,
                [actionMockA.address, actionMockA.address],
                [
                  helpers.testCallFrom(testAvatar.address),
                  helpers.testCallFrom(testAvatar.address, 666),
                ],
                [new BN("0"), new BN("0")]
              )
              .encodeABI(),
          ],
          value: [0],
        },
        {
          to: [permissionRegistryModule.address],
          data: [
            await new web3.eth.Contract(PermissionRegistryModule.abi).methods
              .relayTransactions(
                testAvatar.address,
                [actionMockA.address, constants.ZERO_ADDRESS],
                [helpers.testCallFrom(testAvatar.address), "0x00"],
                [new BN("101"), new BN("0")]
              )
              .encodeABI(),
          ],
          value: [0],
        },
        {
          to: [permissionRegistryModule.address],
          data: [
            await new web3.eth.Contract(PermissionRegistryModule.abi).methods
              .relayTransactions(
                testAvatar.address,
                [actionMockB.address, constants.ZERO_ADDRESS],
                [helpers.testCallFrom(testAvatar.address, 666), "0x00"],
                [new BN("10"), new BN("0")]
              )
              .encodeABI(),
          ],
          value: [0],
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
    const calldataArray = [
      await new web3.eth.Contract(PermissionRegistry.abi).methods
        .setETHPermission(
          testAvatar.address,
          constants.ZERO_ADDRESS,
          constants.NULL_SIGNATURE,
          200,
          true
        )
        .encodeABI(),
      await new web3.eth.Contract(PermissionRegistry.abi).methods
        .setETHPermission(
          testAvatar.address,
          actionMockA.address,
          constants.NULL_SIGNATURE,
          100,
          true
        )
        .encodeABI(),
      await new web3.eth.Contract(PermissionRegistry.abi).methods
        .setETHPermission(
          testAvatar.address,
          actionMockA.address,
          helpers.testCallFrom(erc20Guild.address).substring(0, 10),
          50,
          true
        )
        .encodeABI(),
      await new web3.eth.Contract(PermissionRegistry.abi).methods
        .setETHPermission(
          testAvatar.address,
          actionMockA.address,
          web3.eth.abi.encodeFunctionSignature(
            "executeCall(address,bytes,uint256)"
          ),
          0,
          true
        )
        .encodeABI(),
    ];

    const setETHPermissionToActionMockA = await createProposal({
      guild: erc20Guild,
      options: [
        {
          to: [permissionRegistryModule.address],
          data: [
            await new web3.eth.Contract(PermissionRegistryModule.abi).methods
              .relayTransactions(
                testAvatar.address,
                Array(4).fill(permissionRegistry.address),
                calldataArray,
                [0, 0, 0, 0]
              )
              .encodeABI(),
          ],
          value: [0],
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

  const allowPRModule = async function () {
    const setPRMPermission = await createProposal({
      guild: erc20Guild,
      options: [
        {
          to: [permissionRegistry.address],
          data: [
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                erc20Guild.address,
                permissionRegistryModule.address,
                web3.eth.abi.encodeFunctionSignature(
                  "relayTransactions(address,address[],bytes[],uint256[])"
                ),
                0,
                true
              )
              .encodeABI(),
          ],
          value: [0],
        },
      ],
      account: accounts[1],
    });
    await setVotesOnProposal({
      guild: erc20Guild,
      proposalId: setPRMPermission,
      option: 1,
      account: accounts[4],
    });
    await setVotesOnProposal({
      guild: erc20Guild,
      proposalId: setPRMPermission,
      option: 1,
      account: accounts[5],
    });
    await time.increase(30);
    await erc20Guild.endProposal(setPRMPermission);
  };

  describe("Module Acivation", function () {
    it("should reject transactions from unauthorized addresses", async function () {
      const txData = await new web3.eth.Contract(TestAvatar.abi).methods
        .enableModule(accounts[2])
        .encodeABI();
      await expectRevert(
        permissionRegistryModule.relayTransactions(
          testAvatar.address,
          [testAvatar.address],
          [txData],
          [0],
          {
            from: accounts[2],
          }
        ),
        "PRModule: Only callable by admin"
      );
    });
  });

  describe("permission registry checks", function () {
    let testToken;

    beforeEach(async function () {
      const activateModuleData = await new web3.eth.Contract(
        PermissionRegistryModule.abi
      ).methods
        .activateModule(erc20Guild.address, multiSend.address)
        .encodeABI();
      await testAvatar.exec(
        permissionRegistryModule.address,
        0,
        activateModuleData
      );
      await testAvatar.enableModule(permissionRegistryModule.address);
      await lockTokens();
      await allowPRModule();

      testToken = await ERC20Mock.new("TestToken", "TTT", 1000, accounts[1]);
      await testToken.transfer(testAvatar.address, 300, { from: accounts[1] });

      const calldataArray = [
        await new web3.eth.Contract(PermissionRegistry.abi).methods
          .setETHPermission(
            testAvatar.address,
            actionMockB.address,
            constants.NULL_SIGNATURE,
            0,
            false
          )
          .encodeABI(),
        await new web3.eth.Contract(PermissionRegistry.abi).methods
          .setETHPermission(
            testAvatar.address,
            testToken.address,
            web3.eth.abi.encodeFunctionSignature("transfer(address,uint256)"),
            0,
            true
          )
          .encodeABI(),
        await new web3.eth.Contract(PermissionRegistry.abi).methods
          .addERC20Limit(testAvatar.address, testToken.address, 200, 0)
          .encodeABI(),
      ];

      const setTestPermissions = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  Array(3).fill(permissionRegistry.address),
                  calldataArray,
                  [0, 0, 0]
                )
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        account: accounts[1],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: setTestPermissions,
        option: 1,
        account: accounts[4],
      });
      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: setTestPermissions,
        option: 1,
        account: accounts[5],
      });
      await time.increase(30);
      await erc20Guild.endProposal(setTestPermissions);
    });

    it("fail to execute a not allowed proposal to a contract from the avatar", async function () {
      await web3.eth.sendTransaction({
        to: erc20Guild.address,
        value: 300,
        from: accounts[0],
      });
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  [actionMockB.address],
                  [helpers.testCallFrom(testAvatar.address)],
                  [0]
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
        "ERC20Guild: Proposal call failed"
      );
    });

    it("fail to execute a transfer over global transfer limits", async function () {
      await web3.eth.sendTransaction({
        to: testAvatar.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  [accounts[8], accounts[7], actionMockA.address],
                  ["0x00", "0x00", helpers.testCallFrom(erc20Guild.address)],
                  [100, 51, 50]
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
        "ERC20Guild: Proposal call failed"
      );
    });

    it("fail to execute an ERC20 transfer over global transfer limits", async function () {
      await web3.eth.sendTransaction({
        to: erc20Guild.address,
        value: 300,
        from: accounts[0],
      });

      const calldataArray = [
        await new web3.eth.Contract(ERC20Mock.abi).methods
          .transfer(accounts[2], 100)
          .encodeABI(),
        await new web3.eth.Contract(ERC20Mock.abi).methods
          .transfer(accounts[3], 101)
          .encodeABI(),
      ];

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  [testToken.address, testToken.address],
                  calldataArray,
                  [0, 0]
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
        "ERC20Guild: Proposal call failed"
      );
    });

    it("execute ERC20 transfers within the transfer limit", async function () {
      const calldataArray = [
        await new web3.eth.Contract(ERC20Mock.abi).methods
          .transfer(accounts[2], 100)
          .encodeABI(),
        await new web3.eth.Contract(ERC20Mock.abi).methods
          .transfer(accounts[3], 99)
          .encodeABI(),
      ];

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  [testToken.address, testToken.address],
                  calldataArray,
                  [0, 0]
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
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "3",
      });
    });

    it("try to set eth permission used inside proposal execution to erc20guild fail", async function () {
      await web3.eth.sendTransaction({
        to: testAvatar.address,
        value: 300,
        from: accounts[0],
      });

      const calldataArray = [
        "0x0",
        // setETHPermissionUsed from the ActionMock contract by using execute call
        await new web3.eth.Contract(ActionMock.abi).methods
          .executeCall(
            permissionRegistry.address,
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermissionUsed(
                testAvatar.address,
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
            testAvatar.address,
            actionMockA.address,
            "0x0",
            0
          )
          .encodeABI(),
        "0x0",
      ];
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  [
                    actionMockA.address,
                    actionMockA.address,
                    actionMockA.address,
                    permissionRegistry.address,
                    actionMockA.address,
                  ],
                  calldataArray,
                  [99, 0, 1, 0, 1]
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
        "ERC20Guild: Proposal call failed"
      );
    });

    it("fail to execute a transfer exceeding the allowed on a call", async function () {
      await web3.eth.sendTransaction({
        to: testAvatar.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  [actionMockA.address, actionMockA.address],
                  [
                    helpers.testCallFrom(testAvatar.address),
                    helpers.testCallFrom(testAvatar.address),
                  ],
                  [25, 26]
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
        "ERC20Guild: Proposal call failed"
      );
    });

    it("fail to execute a transfer exceeding the allowed on a wildcard permission call", async function () {
      await web3.eth.sendTransaction({
        to: testAvatar.address,
        value: 300,
        from: accounts[0],
      });

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  [actionMockA.address],
                  ["0x00"],
                  [101]
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
        "ERC20Guild: Proposal call failed"
      );
    });
  });

  describe("complete proposal process", function () {
    beforeEach(async function () {
      const activateModuleData = await new web3.eth.Contract(
        PermissionRegistryModule.abi
      ).methods
        .activateModule(erc20Guild.address, multiSend.address)
        .encodeABI();
      await testAvatar.exec(
        permissionRegistryModule.address,
        0,
        activateModuleData
      );
      await testAvatar.enableModule(permissionRegistryModule.address);
      await lockTokens();
      await allowPRModule();
      await allowActionMockA();
    });

    it("execute a proposal to a contract from the avatar", async function () {
      await web3.eth.sendTransaction({
        to: testAvatar.address,
        value: 10,
        from: accounts[0],
      });

      const calldataArray = [
        await new web3.eth.Contract(PermissionRegistry.abi).methods
          .setETHPermission(
            testAvatar.address,
            actionMockB.address,
            helpers.testCallFrom(testAvatar.address).substring(0, 10),
            10,
            true
          )
          .encodeABI(),
      ];
      const allowActionMock = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  [permissionRegistry.address],
                  calldataArray,
                  [0]
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

    it("cannot execute a proposal if module was deactivated", async function () {
      await web3.eth.sendTransaction({
        to: testAvatar.address,
        value: 10,
        from: accounts[0],
      });

      const calldataArray = [
        await new web3.eth.Contract(PermissionRegistry.abi).methods
          .setETHPermission(
            testAvatar.address,
            actionMockB.address,
            helpers.testCallFrom(testAvatar.address).substring(0, 10),
            10,
            true
          )
          .encodeABI(),
      ];
      const allowActionMock = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [permissionRegistryModule.address],
            data: [
              await new web3.eth.Contract(PermissionRegistryModule.abi).methods
                .relayTransactions(
                  testAvatar.address,
                  [permissionRegistry.address],
                  calldataArray,
                  [0]
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
      // Deactivate module
      const deactivateModuleData = await new web3.eth.Contract(
        PermissionRegistryModule.abi
      ).methods
        .deactivateModule(erc20Guild.address)
        .encodeABI();
      await testAvatar.exec(
        permissionRegistryModule.address,
        0,
        deactivateModuleData
      );
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal call failed"
      );
    });
  });
});
