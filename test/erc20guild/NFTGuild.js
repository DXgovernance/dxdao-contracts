import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert, expect } from "chai";
import * as helpers from "../helpers";
import { config } from "hardhat";
const {
  signTypedData,
  SignTypedDataVersion,
} = require("@metamask/eth-sig-util");
const {
  createAndSetupNFT,
  createNFTProposal,
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
const NFTGuild = artifacts.require("NFTGuildInitializable.sol");
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

    const nftGuildInitializeData = await new web3.eth.Contract(
      NFTGuild.abi
    ).methods
      .initialize(
        guildToken.address,
        30,
        30,
        1,
        "TestGuild",
        0,
        0,
        10,
        permissionRegistry.address
      )
      .encodeABI();

    const erc721GuildProxy = await TransparentUpgradeableProxy.new(
      nftGuildAddress,
      proxyAdmin.address,
      nftGuildInitializeData
    );

    nftGuild = await INFTGuild.at(erc721GuildProxy.address);

    actionMockA = await ActionMock.new();
    actionMockB = await ActionMock.new();
    genericProposal = {
      nftGuild: nftGuild,
      options: [
        {
          to: [actionMockA.address, actionMockA.address],
          data: [
            helpers.testCallFrom(nftGuild.address),
            helpers.testCallFrom(nftGuild.address, 666),
          ],
          value: [0, 0],
        },
        {
          to: [actionMockA.address, constants.ZERO_ADDRESS],
          data: [helpers.testCallFrom(nftGuild.address), "0x00"],
          value: [101, 0],
        },
        {
          to: [actionMockB.address, constants.ZERO_ADDRESS],
          data: [helpers.testCallFrom(nftGuild.address, 666), "0x00"],
          value: [10, 0],
        },
      ],
      account: accounts[3],
      ownedTokenId: 3,
    };
  });

  const allowActionMockA = async function () {
    const { proposalId, proposalIndex, proposalData } = await createNFTProposal(
      {
        nftGuild: nftGuild,
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
                  constants.ZERO_ADDRESS,
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
        ownedTokenId: 1,
        account: accounts[1],
      }
    );
    await setNFTVotesOnProposal({
      guild: nftGuild,
      proposalId: proposalId,
      option: 1,
      tokenIds: [4],
      account: accounts[4],
    });
    await setNFTVotesOnProposal({
      guild: nftGuild,
      proposalId: proposalId,
      option: 1,
      tokenIds: [5],
      account: accounts[5],
    });
    await time.increase(30);
    await nftGuild.endProposal(proposalIndex, proposalData);
  };

  const sigEIP712 = async function (
    accountIndex,
    proposalId,
    option,
    tokenIds
  ) {
    const domain = [
      { name: "name", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ];
    const typeSetSignedVote = [
      { name: "proposalId", type: "bytes32" },
      { name: "option", type: "uint256" },
      { name: "tokenIds", type: "uint256[]" },
    ];

    //Create data structs
    const domainData = {
      name: "NFT Guild",
      chainId: await web3.eth.getChainId(),
      verifyingContract: nftGuild.address,
    };

    const setSignedVote = {
      proposalId: proposalId,
      option: option,
      tokenIds: tokenIds,
    };

    //Put them together in one data structure
    const data = {
      types: {
        EIP712Domain: domain,
        setSignedVote: typeSetSignedVote,
      },
      primaryType: "setSignedVote",
      domain: domainData,
      message: setSignedVote,
    };

    const wallet = ethers.Wallet.fromMnemonic(
      config.networks.hardhat.accounts.mnemonic,
      config.networks.hardhat.accounts.path + `/${accountIndex}`
    );
    return signTypedData({
      privateKey: Buffer.from(wallet.privateKey.substring(2, 66), "hex"),
      data: data,
      version: SignTypedDataVersion.V4,
    });
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
      assert.deepEqual(await nftGuild.getProposalsIds(0, 0), []);
    });

    it("cannot initialize with zero proposalTime", async function () {
      nftGuild = await NFTGuild.new();
      await expectRevert(
        nftGuild.initialize(
          guildToken.address,
          0,
          30,
          1,
          "TestGuild",
          0,
          0,
          10,
          permissionRegistry.address
        ),
        "NFTGuild: proposal time has to be more than 0"
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
          "TestGuild",
          0,
          0,
          10,
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
          0,
          "TestGuild",
          0,
          0,
          10,
          permissionRegistry.address
        ),
        "Initializable: contract is already initialized"
      );
    });
  });

  describe("setConfig", function () {
    it("execute an NFTGuild setConfig proposal on the guild", async function () {
      assert.equal(await nftGuild.getProposalTime(), 30);
      assert.equal(await nftGuild.getTimeForExecution(), 30);
      assert.equal(await nftGuild.getVotingPowerForProposalExecution(), 1);
      assert.equal(await nftGuild.votingPowerForInstantProposalExecution(), 0);
      assert.equal(await nftGuild.getVoteGas(), 0);
      assert.equal(await nftGuild.getMaxGasPrice(), 0);
      assert.equal(await nftGuild.getMaxActiveProposals(), 10);

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [nftGuild.address],
              data: [
                await new web3.eth.Contract(NFTGuild.abi).methods
                  .setConfig("15", "30", "2", "4", "1", "10", "4")
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          account: accounts[3],
          ownedTokenId: 3,
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      const receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });

      assert.equal(await nftGuild.getProposalTime(), 15);
      assert.equal(await nftGuild.getTimeForExecution(), 30);
      assert.equal(await nftGuild.getVotingPowerForProposalExecution(), 2);
      assert.equal(await nftGuild.votingPowerForInstantProposalExecution(), 4);
      assert.equal(await nftGuild.getVoteGas(), 1);
      assert.equal(await nftGuild.getMaxGasPrice(), 10);
      assert.equal(await nftGuild.getMaxActiveProposals(), 4);
    });
  });

  describe("setETHPermission", function () {
    it("Proposal for setting permission delay should succeed", async function () {
      assert.equal(
        await permissionRegistry.getETHPermissionDelay(nftGuild.address),
        "0"
      );

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
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
          ownedTokenId: 2,
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[4],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);
      assert.equal(
        await permissionRegistry.getETHPermissionDelay(nftGuild.address),
        "120"
      );
    });
  });

  describe("createProposal", function () {
    it("cannot create a proposal with invalid totalOptions", async function () {
      const invalidtotalOptions = 3;
      await expectRevert(
        nftGuild.createProposal(
          [
            {
              to: actionMockA.address,
              value: 1,
              data: "0x00",
            },
            {
              to: actionMockA.address,
              value: 1,
              data: "0x00",
            },
          ],
          invalidtotalOptions,
          "Guild Test Proposal",
          constants.SOME_HASH,
          2,
          { from: accounts[2] }
        ),
        "ERC721Guild: Invalid totalOptions or option calls length"
      );
    });

    it("cannot create a proposal if creator does not owned a token", async function () {
      await expectRevert(
        nftGuild.createProposal(
          [
            {
              to: actionMockA.address,
              value: 1,
              data: "0x00",
            },
            {
              to: actionMockA.address,
              value: 1,
              data: "0x00",
            },
          ],
          2,
          "Guild Test Proposal",
          constants.SOME_HASH,
          2,
          { from: accounts[9] }
        ),
        "ERC721Guild: Provide an NFT you own to create a proposal"
      );
    });

    it("cannot create a proposal with empty _to, _data and _value arrays", async function () {
      await expectRevert(
        nftGuild.createProposal(
          [],
          1,
          "Guild Test Proposal",
          constants.SOME_HASH,
          3,
          { from: accounts[3] }
        ),
        "ERC721Guild: (to,data,value) array cannot be empty"
      );
    });

    it("cannot create a proposal if the max amount of active proposals is reached", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);
      assert.equal(await nftGuild.getActiveProposalsNow(), "1");
      await time.increase(10);

      // Create 9 more proposals and have 10 active proposals
      for (let i = 0; i < 9; i++) await createNFTProposal(genericProposal);
      assert.equal(await nftGuild.getActiveProposalsNow(), "10");

      // Cant create because maxActiveProposals limit reached
      await expectRevert(
        createNFTProposal(genericProposal),
        "ERC721Guild: Maximum amount of active proposals reached"
      );

      // Finish one proposal and can create another
      await time.increase(20);
      await nftGuild.endProposal(proposalIndex, proposalData);
      assert.equal(await nftGuild.getActiveProposalsNow(), "9");

      await createNFTProposal(genericProposal);
    });

    it("cannot create a proposal with more actions to the ones allowed", async function () {
      await expectRevert(
        createNFTProposal({
          nftGuild: nftGuild,
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
          ownedTokenId: 3,
        }),
        "ERC721Guild: Proposal has too many options"
      );
    });
  });

  describe("setVote", function () {
    it("cannot vote twice with same token id", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await expectRevert(
        setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: proposalId,
          option: 1,
          tokenIds: [3],
          account: accounts[3],
        }),
        "ERC721Guild: This NFT already voted"
      );
    });

    it("cannot vote with token ids that you don't own", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      await expectRevert(
        setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: proposalId,
          option: 1,
          tokenIds: [4],
          account: accounts[3],
        }),
        "ERC721Guild: Voting with tokens you don't own"
      );

      await expectRevert(
        setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: proposalId,
          option: 1,
          tokenIds: [3, 4],
          account: accounts[3],
        }),
        "ERC721Guild: Voting with tokens you don't own"
      );
    });

    it("cannot change voted option after initial vote", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 0,
        tokenIds: [3],
        account: accounts[3],
      });

      await expectRevert(
        setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: proposalId,
          option: 1,
          tokenIds: [3],
          account: accounts[3],
        }),
        "ERC721Guild: This NFT already voted"
      );
    });

    it("can vote with multiple token ids", async function () {
      await guildToken.mint(accounts[1], 10);
      await guildToken.mint(accounts[1], 11);
      await guildToken.mint(accounts[1], 100);
      await guildToken.mint(accounts[1], 101);
      await guildToken.mint(accounts[1], 102);
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [1],
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [10, 11],
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 2,
        tokenIds: [100, 101, 102],
        account: accounts[1],
      });

      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 1)
      ).to.be.bignumber.equal(new BN("1"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 10)
      ).to.be.bignumber.equal(new BN("1"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 11)
      ).to.be.bignumber.equal(new BN("1"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 100)
      ).to.be.bignumber.equal(new BN("2"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 101)
      ).to.be.bignumber.equal(new BN("2"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 102)
      ).to.be.bignumber.equal(new BN("2"));
    });
  });

  describe("endProposal", function () {
    beforeEach(async function () {
      permissionRegistry.address;
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [nftGuild.address],
              data: [
                await new web3.eth.Contract(NFTGuild.abi).methods
                  .setConfig("30", "30", "2", "0", "0", "0", "10")
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          account: accounts[3],
          ownedTokenId: 3,
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);
    });

    it("cannot execute as proposal not ended yet", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });

      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "ERC721Guild: Proposal hasn't ended yet"
      );
    });

    it("proposal rejected if not enough votes to execute proposal when proposal ends", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await time.increase(time.duration.seconds(61));

      await nftGuild.endProposal(proposalIndex, proposalData);
      const { state } = await nftGuild.getProposal(proposalId);
      assert.equal(state, constants.GUILD_PROPOSAL_STATES.Rejected);
    });

    it("Proposals are marked as rejected if voted on action 0", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 0,
        tokenIds: [2],
        account: accounts[2],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 0,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 0,
        tokenIds: [4],
        account: accounts[4],
      });

      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "ERC721Guild: Proposal hasn't ended yet"
      );

      await time.increase(time.duration.seconds(31));

      const receipt = await nftGuild.endProposal(proposalIndex, proposalData);

      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "2",
      });
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "ERC721Guild: Proposal already executed"
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

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [actionMockA.address],
              data: [testWithNoargsEncoded],
              value: [0],
            },
          ],
          account: accounts[2],
          ownedTokenId: 2,
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [2],
        account: accounts[2],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));

      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Call not allowed"
      );
    });

    it("proposal fail because it run out of time to execute", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [actionMockA.address, actionMockA.address],
              data: [
                helpers.testCallFrom(nftGuild.address),
                helpers.testCallFrom(nftGuild.address, 666),
              ],
              value: [0, 0],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [2],
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(30));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Call not allowed"
      );

      await time.increase(time.duration.seconds(30));
      await nftGuild.endProposal(proposalIndex, proposalData);
      assert.equal((await nftGuild.getProposal(proposalId)).state, 4);
    });
  });

  describe("Early proposal executions", function () {
    it("should set votingPowerForInstantProposalExecution correctly", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [nftGuild.address],
              data: [
                await new web3.eth.Contract(NFTGuild.abi).methods
                  .setConfig("30", "30", "2", "2", "0", "0", "10")
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          account: accounts[3],
          ownedTokenId: 3,
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);

      const votingPowerForInstantProposalExecution =
        await nftGuild.votingPowerForInstantProposalExecution();
      expect(votingPowerForInstantProposalExecution).to.be.bignumber.equal(
        new BN("2")
      );
    });

    it("should not execute a proposal early if early proposal execution conditions are not met", async function () {
      // Set votingPowerForInstantProposalExecution
      let { proposalId, proposalIndex, proposalData } = await createNFTProposal(
        {
          nftGuild: nftGuild,
          options: [
            {
              to: [nftGuild.address],
              data: [
                await new web3.eth.Contract(NFTGuild.abi).methods
                  .setConfig("30", "30", "2", "2", "0", "0", "10")
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          account: accounts[3],
          ownedTokenId: 3,
        }
      );
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);

      //
      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal(
        genericProposal
      ));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 2,
        tokenIds: [2],
        account: accounts[2],
      });

      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "ERC721Guild: Proposal hasn't ended yet"
      );
    });

    it("should execute a proposal early if early proposal execution conditions are met", async function () {
      await allowActionMockA();

      // Set votingPowerForInstantProposalExecution
      let { proposalId, proposalIndex, proposalData } = await createNFTProposal(
        {
          nftGuild: nftGuild,
          options: [
            {
              to: [nftGuild.address],
              data: [
                await new web3.eth.Contract(NFTGuild.abi).methods
                  .setConfig("30", "30", "2", "2", "0", "0", "10")
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          account: accounts[3],
          ownedTokenId: 3,
        }
      );
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);

      //
      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal(
        genericProposal
      ));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [2],
        account: accounts[2],
      });
      await nftGuild.endProposal(proposalIndex, proposalData);
      const { state } = await nftGuild.getProposal(proposalId);
      assert.equal(state, constants.GUILD_PROPOSAL_STATES.Executed);
    });
  });

  describe("action votes tie checks", async function () {
    let proposalWithThreeOptions;

    beforeEach(async function () {
      proposalWithThreeOptions = {
        nftGuild: nftGuild,
        options: [
          {
            to: [actionMockA.address, actionMockA.address],
            data: [
              helpers.testCallFrom(nftGuild.address),
              helpers.testCallFrom(nftGuild.address, 666),
            ],
            value: [0, 0],
          },
          {
            to: [actionMockA.address, actionMockA.address],
            data: [
              helpers.testCallFrom(nftGuild.address),
              helpers.testCallFrom(nftGuild.address, 666),
            ],
            value: [0, 0],
          },
          {
            to: [actionMockA.address, actionMockA.address],
            data: [
              helpers.testCallFrom(nftGuild.address),
              helpers.testCallFrom(nftGuild.address, 666),
            ],
            value: [0, 0],
          },
        ],
        ownedTokenId: 3,
        account: accounts[3],
      };

      const allowAllActionsMock = async function () {
        const { proposalId, proposalIndex, proposalData } =
          await createNFTProposal({
            nftGuild: nftGuild,
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
            ownedTokenId: 1,
            account: accounts[1],
          });
        await setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: proposalId,
          option: 1,
          tokenIds: [4],
          account: accounts[4],
        });
        await setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: proposalId,
          option: 1,
          tokenIds: [5],
          account: accounts[5],
        });
        await time.increase(30);
        await nftGuild.endProposal(proposalIndex, proposalData);
      };

      await allowAllActionsMock();
    });

    it("if there is a tie between winning actions, reject", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [1],
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 3,
        tokenIds: [2],
        account: accounts[2],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);

      const { state } = await nftGuild.getProposal(proposalId);
      assert.equal(state, constants.GUILD_PROPOSAL_STATES.Rejected);
    });

    it("when there are two tied losing actions and one winning action, execute", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [1],
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 2,
        tokenIds: [2],
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 3,
        tokenIds: [4],
        account: accounts[4],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 3,
        tokenIds: [5],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);

      const { state } = await nftGuild.getProposal(proposalId);
      assert.equal(state, constants.GUILD_PROPOSAL_STATES.Executed);
    });

    it("when there is a tie between an action and no action, reject", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 0,
        tokenIds: [1],
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [2],
        account: accounts[2],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);

      const { state } = await nftGuild.getProposal(proposalId);
      assert.equal(state, constants.GUILD_PROPOSAL_STATES.Rejected);
    });

    it("when there is a tie between more than two actions, reject", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [1],
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [2],
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 2,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 2,
        tokenIds: [4],
        account: accounts[4],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);

      const { state } = await nftGuild.getProposal(proposalId);
      assert.equal(state, constants.GUILD_PROPOSAL_STATES.Rejected);
    });

    it("when there is a winning action in the middle of two tied actions, execute", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(proposalWithThreeOptions);

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [1],
        account: accounts[1],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [2],
        account: accounts[2],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 2,
        tokenIds: [5],
        account: accounts[5],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 3,
        tokenIds: [3],
        account: accounts[3],
      });

      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);

      const { state } = await nftGuild.getProposal(proposalId);
      assert.equal(state, constants.GUILD_PROPOSAL_STATES.Executed);
    });
  });

  describe("permission registry checks", function () {
    let testToken;

    beforeEach(async function () {
      await allowActionMockA();

      testToken = await ERC20Mock.new("TestToken", "TTT", 1000, accounts[1]);
      await testToken.transfer(nftGuild.address, 300, { from: accounts[1] });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
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
                  .setETHPermission(
                    nftGuild.address,
                    testToken.address,
                    web3.eth.abi.encodeFunctionSignature(
                      "mint(address,uint256)"
                    ),
                    0,
                    true
                  )
                  .encodeABI(),
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .addERC20Limit(nftGuild.address, testToken.address, 200, 0)
                  .encodeABI(),
              ],
              value: [0, 0, 0, 0],
            },
          ],
          ownedTokenId: 1,
          account: accounts[1],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[4],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(30);
      await nftGuild.endProposal(proposalIndex, proposalData);
    });

    it("fail to execute a not allowed proposal to a contract from the guild", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [actionMockB.address],
              data: [helpers.testCallFrom(nftGuild.address)],
              value: [0],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Call not allowed"
      );
    });

    it("fail to execute a transfer over global transfer limits", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [accounts[8], accounts[7], actionMockA.address],
              data: [
                constants.ZERO_DATA,
                constants.ZERO_DATA,
                helpers.testCallFrom(nftGuild.address),
              ],
              value: [100, 51, 50],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("fail to execute an ERC20 transfer over global transfer limits", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
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
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("execute ERC20 transfers within the transfer limit", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
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
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      const receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });
    });

    it("execute ERC20 transfers within the transfer limit before removal gets executed", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      let { proposalId, proposalIndex, proposalData } = await createNFTProposal(
        {
          nftGuild: nftGuild,
          options: [
            {
              to: [
                permissionRegistry.address,
                testToken.address,
                testToken.address,
              ],
              data: [
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .updateERC20Limit(nftGuild.address, 0, 0)
                  .encodeABI(),
                await new web3.eth.Contract(ERC20Mock.abi).methods
                  .transfer(accounts[2], 100)
                  .encodeABI(),
                await new web3.eth.Contract(ERC20Mock.abi).methods
                  .transfer(accounts[3], 99)
                  .encodeABI(),
              ],
              value: [0, 0, 0],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        }
      );
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      let receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });

      await testToken.mint(nftGuild.address, 1000000);
      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal({
        nftGuild: nftGuild,
        options: [
          {
            to: [permissionRegistry.address, testToken.address],
            data: [
              await new web3.eth.Contract(PermissionRegistry.abi).methods
                .executeUpdateERC20Limit(nftGuild.address, 0)
                .encodeABI(),
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[2], 1000000)
                .encodeABI(),
            ],
            value: [0, 0],
          },
        ],
        ownedTokenId: 3,
        account: accounts[3],
      }));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });
    });

    it("fail to remove and execute ERC20 transfer removals in the same block", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [permissionRegistry.address, permissionRegistry.address],
              data: [
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .updateERC20Limit(nftGuild.address, 0, 0)
                  .encodeABI(),
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .executeUpdateERC20Limit(nftGuild.address, 0)
                  .encodeABI(),
              ],
              value: [0, 0],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "ERC721Guild: Proposal call failed"
      );
    });

    it("execute ERC20 transfer removals only after the delay has passed", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      // ERC20 Limit removal request + set delay time
      let { proposalId, proposalIndex, proposalData } = await createNFTProposal(
        {
          nftGuild: nftGuild,
          options: [
            {
              to: [permissionRegistry.address, permissionRegistry.address],
              data: [
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .setETHPermissionDelay(nftGuild.address, 60 * 10)
                  .encodeABI(),
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .updateERC20Limit(nftGuild.address, 0, 0)
                  .encodeABI(),
              ],
              value: [0, 0],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        }
      );
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      let receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });

      // Transfer limits still checked after delay has passed if the removal request wasn't executed
      await time.increase(time.duration.seconds(60 * 10));
      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal({
        nftGuild: nftGuild,
        options: [
          {
            to: [testToken.address],
            data: [
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[3], 299)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        ownedTokenId: 3,
        account: accounts[3],
      }));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Value limit reached"
      );

      // ERC20 transfer limits are no longer checked after removal execution
      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal({
        nftGuild: nftGuild,
        options: [
          {
            to: [permissionRegistry.address, testToken.address],
            data: [
              await new web3.eth.Contract(PermissionRegistry.abi).methods
                .executeUpdateERC20Limit(nftGuild.address, 0)
                .encodeABI(),
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[3], 250)
                .encodeABI(),
            ],
            value: [0, 0],
          },
        ],
        ownedTokenId: 3,
        account: accounts[3],
      }));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });

      // ERC20 transfer limits are no longer checked after removal execution
      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal({
        nftGuild: nftGuild,
        options: [
          {
            to: [testToken.address],
            data: [
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[3], 1)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        ownedTokenId: 3,
        account: accounts[3],
      }));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });
    });

    it("execute ERC20 limit increases correctly", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      // ERC20 Limit increase request
      let { proposalId, proposalIndex, proposalData } = await createNFTProposal(
        {
          nftGuild: nftGuild,
          options: [
            {
              to: [permissionRegistry.address],
              data: [
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .updateERC20Limit(nftGuild.address, 0, 250)
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        }
      );
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      let receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });

      await permissionRegistry.executeUpdateERC20Limit(nftGuild.address, 0);
      await expectRevert(
        permissionRegistry.executeUpdateERC20Limit(nftGuild.address, 0),
        "PermissionRegistry: Cant execute permission update"
      );
      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal({
        nftGuild: nftGuild,
        options: [
          {
            to: [testToken.address],
            data: [
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[3], 250)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        ownedTokenId: 3,
        account: accounts[3],
      }));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });

      await testToken.transfer(nftGuild.address, 250, { from: accounts[3] });
      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal({
        nftGuild: nftGuild,
        options: [
          {
            to: [testToken.address],
            data: [
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[3], 251)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        ownedTokenId: 3,
        account: accounts[3],
      }));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("execute ERC20 limit reduction correctly", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      // ERC20 Limit increase request
      let { proposalId, proposalIndex, proposalData } = await createNFTProposal(
        {
          nftGuild: nftGuild,
          options: [
            {
              to: [permissionRegistry.address],
              data: [
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .updateERC20Limit(nftGuild.address, 0, 100)
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        }
      );
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      let receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });

      await permissionRegistry.executeUpdateERC20Limit(nftGuild.address, 0);
      await expectRevert(
        permissionRegistry.executeUpdateERC20Limit(nftGuild.address, 0),
        "PermissionRegistry: Cant execute permission update"
      );
      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal({
        nftGuild: nftGuild,
        options: [
          {
            to: [testToken.address],
            data: [
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[3], 100)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        ownedTokenId: 3,
        account: accounts[3],
      }));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });

      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal({
        nftGuild: nftGuild,
        options: [
          {
            to: [testToken.address],
            data: [
              await new web3.eth.Contract(ERC20Mock.abi).methods
                .transfer(accounts[3], 101)
                .encodeABI(),
            ],
            value: [0],
          },
        ],
        ownedTokenId: 3,
        account: accounts[3],
      }));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("execute ERC20 transfers to the guild contract without limits", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [testToken.address],
              data: [
                await new web3.eth.Contract(ERC20Mock.abi).methods
                  .mint(nftGuild.address, 100)
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      const receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
        newState: "3",
      });
    });

    it("try to set eth permission used inside proposal execution to nftGuild fail", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
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
                constants.ZERO_DATA,

                // setETHPermissionUsed from the ActionMock contract by using execute call
                await new web3.eth.Contract(ActionMock.abi).methods
                  .executeCall(
                    permissionRegistry.address,
                    await new web3.eth.Contract(PermissionRegistry.abi).methods
                      .setETHPermissionUsed(
                        nftGuild.address,
                        actionMockA.address,
                        constants.NULL_SIGNATURE,
                        0
                      )
                      .encodeABI(),
                    0
                  )
                  .encodeABI(),
                constants.ZERO_DATA,

                // setETHPermissionUsed from the guild directly
                await new web3.eth.Contract(PermissionRegistry.abi).methods
                  .setETHPermissionUsed(
                    nftGuild.address,
                    actionMockA.address,
                    constants.NULL_SIGNATURE,
                    0
                  )
                  .encodeABI(),
                constants.ZERO_DATA,
              ],
              value: [99, 0, 1, 0, 1],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));

      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("fail to execute a transfer exceeding the allowed on a call", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
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
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Value limit reached"
      );
    });

    it("fail to execute a transfer exceeding the allowed on a wildcard permission call", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 300,
        from: accounts[0],
      });

      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [actionMockA.address],
              data: [constants.ZERO_DATA],
              value: [101],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        nftGuild.endProposal(proposalIndex, proposalData),
        "PermissionRegistry: Value limit reached'"
      );
    });
  });

  describe("complete proposal process", function () {
    beforeEach(async function () {
      await allowActionMockA();
    });

    it("execute a proposal to a contract from the guild", async function () {
      await web3.eth.sendTransaction({
        to: nftGuild.address,
        value: 10,
        from: accounts[0],
      });

      let { proposalId, proposalIndex, proposalData } = await createNFTProposal(
        {
          nftGuild: nftGuild,
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
          ownedTokenId: 3,
          account: accounts[3],
        }
      );
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [3],
        account: accounts[3],
      });

      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);

      ({ proposalId, proposalIndex, proposalData } = await createNFTProposal(
        genericProposal
      ));
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 3,
        tokenIds: [3],
        account: accounts[3],
      });

      const txVote = await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 3,
        tokenIds: [5],
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(VOTE_GAS.toNumber());

      await time.increase(time.duration.seconds(31));
      const receipt = await nftGuild.endProposal(proposalIndex, proposalData);
      expectEvent(receipt, "ProposalStateChanged", {
        proposalId: proposalId,
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
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      const { startTime, endTime, totalOptions, state, totalVotes } =
        await nftGuild.getProposal(proposalId);

      const now = await time.latest();
      assert.equal(startTime.toString(), now.toString());
      assert.equal(endTime.toString(), now.add(new BN("30")).toString());
      assert.equal(totalOptions, 4);
      assert.equal(totalVotes.length, 4);
      assert.equal(state, "1");
    });
  });

  describe("refund votes", function () {
    beforeEach(async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal({
          nftGuild: nftGuild,
          options: [
            {
              to: [nftGuild.address],
              data: [
                await new web3.eth.Contract(NFTGuild.abi).methods
                  .setConfig(30, 30, 1, 0, VOTE_GAS, MAX_GAS_PRICE, 3)
                  .encodeABI(),
              ],
              value: [0],
            },
          ],
          ownedTokenId: 3,
          account: accounts[3],
        });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [4],
        account: accounts[4],
      });
      await setNFTVotesOnProposal({
        guild: nftGuild,
        proposalId: proposalId,
        option: 1,
        tokenIds: [5],
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await nftGuild.endProposal(proposalIndex, proposalData);
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
        const { proposalId, proposalIndex, proposalData } =
          await createNFTProposal(genericProposal);

        const guildTracker = await balance.tracker(nftGuild.address);

        // send ether to cover gas
        await send.ether(accounts[0], nftGuild.address, ether("10"), {
          from: accounts[0],
        });
        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ether("10"));

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await nftGuild.setVote(proposalId, 1, [2], {
          from: accounts[2],
          gasPrice: REAL_GAS_PRICE,
        });
        expectEvent(txVote, "VoteAdded", {
          proposalId: proposalId,
          option: "1",
          voter: accounts[2],
        });

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
        const { proposalId, proposalIndex, proposalData } =
          await createNFTProposal(genericProposal);

        const guildTracker = await balance.tracker(nftGuild.address);

        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO);

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await nftGuild.setVote(proposalId, 1, [2], {
          from: accounts[2],
          gasPrice: REAL_GAS_PRICE,
        });
        expectEvent(txVote, "VoteAdded", {
          proposalId: proposalId,
          option: "1",
          voter: accounts[2],
        });

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
        let { proposalId, proposalIndex, proposalData } =
          await createNFTProposal({
            nftGuild: nftGuild,
            options: [
              {
                to: [nftGuild.address],
                data: [
                  await new web3.eth.Contract(NFTGuild.abi).methods
                    .setConfig(
                      30,
                      30,
                      1,
                      0,
                      incorrectVoteGas,
                      REAL_GAS_PRICE,
                      3
                    )
                    .encodeABI(),
                ],
                value: [0],
              },
            ],
            ownedTokenId: 3,
            account: accounts[3],
          });
        await setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: proposalId,
          option: 1,
          tokenIds: [4],
          account: accounts[4],
        });
        await setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: proposalId,
          option: 1,
          tokenIds: [5],
          account: accounts[5],
        });
        await time.increase(time.duration.seconds(31));
        await expectRevert(
          nftGuild.endProposal(proposalIndex, proposalData),
          "ERC721Guild: Proposal call failed"
        );

        ({ proposalId, proposalIndex, proposalData } = await createNFTProposal(
          genericProposal
        ));
        const accountBalanceTracker = await balance.tracker(accounts[1]);

        await setNFTVotesOnProposal({
          guild: nftGuild,
          proposalId: proposalId,
          option: 1,
          tokenIds: [1],
          account: accounts[1],
        });

        // Checks that the voter spent more than it got refunded
        let accountBalance = await accountBalanceTracker.delta();
        accountBalance.negative.should.be.equal(1); // The variation in balance is negative
      });
    });

    it("only refunds up to max gas price", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      const guildTracker = await balance.tracker(nftGuild.address);

      // send ether to cover gas
      await send.ether(accounts[0], nftGuild.address, ether("10"), {
        from: accounts[0],
      });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[2]);

      const txVote = await nftGuild.setVote(proposalId, 1, [2], {
        from: accounts[2],
        gasPrice: MAX_GAS_PRICE.add(new BN("50")),
      });
      expectEvent(txVote, "VoteAdded", {
        proposalId: proposalId,
        option: "1",
        voter: accounts[2],
      });

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
    it("can set a signed vote", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      const option = 1;
      const tokenIds = [2];
      const signature = await sigEIP712(2, proposalId, option, tokenIds);
      const txVote = await nftGuild.setSignedVote(
        proposalId,
        option,
        tokenIds,
        signature,
        { from: accounts[3] }
      );

      expectEvent(txVote, "VoteAdded", {
        proposalId: proposalId,
        option: new BN("1"),
        voter: accounts[3],
      });
      assert.equal(
        (await nftGuild.getProposalVoteOfTokenId(proposalId, 2)).toNumber(),
        1
      );
    });

    it("can set a signed vote with multiple token ids", async function () {
      await guildToken.mint(accounts[1], 10);
      await guildToken.mint(accounts[1], 11);
      await guildToken.mint(accounts[1], 100);
      await guildToken.mint(accounts[1], 101);
      await guildToken.mint(accounts[1], 102);
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      let signature = await sigEIP712(1, proposalId, 1, [1]);
      await nftGuild.setSignedVote(proposalId, 1, [1], signature, {
        from: accounts[3],
      });
      signature = await sigEIP712(1, proposalId, 1, [10, 11]);
      await nftGuild.setSignedVote(proposalId, 1, [10, 11], signature, {
        from: accounts[3],
      });
      signature = await sigEIP712(1, proposalId, 2, [100, 101, 102]);
      await nftGuild.setSignedVote(proposalId, 2, [100, 101, 102], signature, {
        from: accounts[3],
      });

      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 1)
      ).to.be.bignumber.equal(new BN("1"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 10)
      ).to.be.bignumber.equal(new BN("1"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 11)
      ).to.be.bignumber.equal(new BN("1"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 100)
      ).to.be.bignumber.equal(new BN("2"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 101)
      ).to.be.bignumber.equal(new BN("2"));
      expect(
        await nftGuild.getProposalVoteOfTokenId(proposalId, 102)
      ).to.be.bignumber.equal(new BN("2"));
    });

    it("cannot set a signed vote twice", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      const option = 1;
      const tokenIds = [2];
      const signature = await sigEIP712(2, proposalId, option, tokenIds);
      const txVote = await nftGuild.setSignedVote(
        proposalId,
        option,
        tokenIds,
        signature,
        { from: accounts[3] }
      );

      await expectRevert(
        nftGuild.setSignedVote(proposalId, option, tokenIds, signature, {
          from: accounts[3],
        }),
        "ERC721Guild: This NFT already voted"
      );
    });

    it("cannot set a vote if wrong signer", async function () {
      const { proposalId, proposalIndex, proposalData } =
        await createNFTProposal(genericProposal);

      const option = 1;
      const tokenIds = [1];
      const signature = await sigEIP712(2, proposalId, option, tokenIds);

      // now call from different account aka accounts[1]
      await expectRevert(
        nftGuild.setSignedVote(proposalId, option, tokenIds, signature, {
          from: accounts[3],
        }),
        "ERC721Guild: Voting with tokens you don't own"
      );
    });
  });
});
