import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert } from "chai";
import * as helpers from "../../helpers";
const { toEthSignedMessageHash } = require("../../helpers/sign");
const {
  createAndSetupGuildToken,
  createProposal,
  setVotesOnProposal,
} = require("../../helpers/guild");

const { BN, expectEvent, time } = require("@openzeppelin/test-helpers");

const ProxyAdmin = artifacts.require("ProxyAdmin.sol");
const TransparentUpgradeableProxy = artifacts.require(
  "TransparentUpgradeableProxy.sol"
);
const Create2Deployer = artifacts.require("Create2Deployer.sol");
const ERC20GuildWithERC1271 = artifacts.require("ERC20GuildWithERC1271.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");
const ActionMock = artifacts.require("ActionMock.sol");

require("chai").should();

contract("ERC20GuildWithERC1271", function (accounts) {
  const constants = helpers.constants;
  const VOTE_GAS = new BN(100000); // 100k gwei

  let guildToken, actionMockA, erc20Guild, permissionRegistry;

  beforeEach(async function () {
    const proxyAdmin = await ProxyAdmin.new({ from: accounts[0] });

    const create2Deployer = await Create2Deployer.new();
    const erc20GuildAddress = await create2Deployer.getHashedSaltDeployAddress(
      ERC20GuildWithERC1271.bytecode,
      constants.SOME_HASH
    );
    await create2Deployer.deployWithHashedSalt(
      ERC20GuildWithERC1271.bytecode,
      "0x0",
      constants.SOME_HASH
    );

    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6),
      [0, 50000, 50000, 100000, 100000, 200000]
    );
    permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    const erc20GuildInitializeData = await new web3.eth.Contract(
      ERC20GuildWithERC1271.abi
    ).methods
      .initialize(
        guildToken.address,
        30,
        30,
        5000,
        100,
        0,
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

    erc20Guild = await ERC20GuildWithERC1271.at(erc20GuildProxy.address);

    actionMockA = await ActionMock.new();
  });

  const lockTokens = async function () {
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
          ],
          value: [0, 0, 0],
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

  describe("EIP1271", function () {
    beforeEach(async function () {
      await lockTokens();
      await allowActionMockA();
    });

    it("Can validate an EIP1271 Signature", async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        options: [
          {
            to: [erc20Guild.address],
            data: [
              await new web3.eth.Contract(ERC20GuildWithERC1271.abi).methods
                .setEIP1271SignedHash(
                  toEthSignedMessageHash(constants.SOME_HASH),
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
        proposalId: guildProposalId,
        option: 1,
        account: accounts[3],
      });

      const txVote = await setVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        option: 1,
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(VOTE_GAS.toNumber());

      const voteEvent = helpers.logDecoder.decodeLogs(
        txVote.receipt.rawLogs
      )[0];
      assert.equal(voteEvent.name, "VoteAdded");
      assert.equal(voteEvent.args[0], guildProposalId);
      assert.equal(voteEvent.args[1], 1);
      assert.equal(voteEvent.args[2], accounts[5]);
      assert.equal(voteEvent.args[3], 200000);

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: guildProposalId,
        newState: "3",
      });
      assert.equal(
        await erc20Guild.getEIP1271SignedHash(
          toEthSignedMessageHash(constants.SOME_HASH)
        ),
        true
      );

      const validSignature = await web3.eth.sign(
        constants.SOME_HASH,
        accounts[5]
      );
      const invalidSignature = await web3.eth.sign(
        constants.SOME_HASH,
        accounts[10]
      );

      assert.equal(
        await erc20Guild.isValidSignature(
          toEthSignedMessageHash(constants.SOME_HASH),
          validSignature
        ),
        web3.eth.abi.encodeFunctionSignature("isValidSignature(bytes32,bytes)")
      );

      assert.equal(
        await erc20Guild.isValidSignature(
          toEthSignedMessageHash(constants.SOME_HASH),
          invalidSignature
        ),
        "0x00000000"
      );
    });
  });
});
