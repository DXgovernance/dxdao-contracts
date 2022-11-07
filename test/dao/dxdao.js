import { expectRevert } from "@openzeppelin/test-helpers";
import { assert } from "chai";
import * as helpers from "../helpers";
const moment = require("moment");
const { time } = require("@openzeppelin/test-helpers");

const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const AvatarScheme = artifacts.require("./AvatarScheme.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ERC721Factory = artifacts.require("./ERC721Factory.sol");
const ERC20VestingFactory = artifacts.require("./ERC20VestingFactory.sol");
const TokenVesting = artifacts.require("./TokenVesting.sol");

contract("DXdao", function (accounts) {
  const constants = helpers.constants;
  let dxDao,
    proposalId,
    masterAvatarScheme,
    nftMinter,
    vestingFactory,
    votingMachineToken,
    vestingStart;

  beforeEach(async function () {
    votingMachineToken = await ERC20Mock.new("DXDao", "DXD", 1000, accounts[0]);

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
      to: dxDao.avatar.address,
      from: accounts[0],
      value: 100,
    });
    await votingMachineToken.transfer(dxDao.avatar.address, 500, {
      from: accounts[0],
    });

    const defaultParamsHash = await helpers.setDefaultParameters(
      dxDao.votingMachine
    );

    const permissionRegistry = await PermissionRegistry.new(
      dxDao.avatar.address,
      10
    );
    await permissionRegistry.initialize();

    masterAvatarScheme = await AvatarScheme.new();

    await masterAvatarScheme.initialize(
      dxDao.avatar.address,
      dxDao.votingMachine.address,
      dxDao.controller.address,
      permissionRegistry.address,
      "Master Scheme",
      86400,
      5
    );

    await dxDao.controller.registerScheme(
      masterAvatarScheme.address,
      defaultParamsHash,
      true,
      true
    );

    nftMinter = await ERC721Factory.new("DXDAO NFT", "DXNFT", {
      from: accounts[0],
    });
    await nftMinter.transferOwnership(dxDao.avatar.address);
    vestingFactory = await ERC20VestingFactory.new(
      votingMachineToken.address,
      dxDao.avatar.address
    );

    const approveToVestingFactoryData = web3.eth.abi.encodeFunctionCall(
      votingMachineToken.abi.find(x => x.name === "approve"),
      [vestingFactory.address, constants.MAX_UINT_256]
    );
    vestingStart = moment().unix();

    const createVestingData = web3.eth.abi.encodeFunctionCall(
      vestingFactory.abi.find(x => x.name === "create"),
      [
        accounts[3],
        vestingStart,
        moment.duration(1, "years").asSeconds(),
        moment.duration(2, "years").asSeconds(),
        500,
      ]
    );

    const mintNFTData = web3.eth.abi.encodeFunctionCall(
      nftMinter.abi.find(x => x.name === "mint"),
      [accounts[3], "tokenURIHere"]
    );

    await permissionRegistry.addERC20Limit(
      dxDao.avatar.address,
      votingMachineToken.address,
      constants.MAX_UINT_256,
      0
    );

    await permissionRegistry.setETHPermission(
      dxDao.avatar.address,
      votingMachineToken.address,
      approveToVestingFactoryData.substring(0, 10),
      0,
      true
    );

    await permissionRegistry.setETHPermission(
      dxDao.avatar.address,
      vestingFactory.address,
      createVestingData.substring(0, 10),
      0,
      true
    );

    await permissionRegistry.setETHPermission(
      dxDao.avatar.address,
      nftMinter.address,
      mintNFTData.substring(0, 10),
      0,
      true
    );

    await permissionRegistry.setETHPermission(
      dxDao.avatar.address,
      constants.NULL_ADDRESS,
      constants.NULL_SIGNATURE,
      10,
      true
    );

    await time.increase(30);

    const tx = await masterAvatarScheme.proposeCalls(
      [
        votingMachineToken.address,
        vestingFactory.address,
        nftMinter.address,
        accounts[3],
      ],
      [approveToVestingFactoryData, createVestingData, mintNFTData, "0x0"],
      [0, 0, 0, 5],
      2,
      constants.TEST_TITLE,
      constants.SOME_HASH
    );

    proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    const activeProposals = await dxDao.controller.getActiveProposals(0, 0);
    assert.equal(activeProposals[0].proposalId, proposalId);
    assert.equal(activeProposals[0].scheme, masterAvatarScheme.address);
  });

  it.skip("Deploy DXvote", function (done) {
    // TODO: See how this tests can be run in github CI, the use the setTimeout breaks the tests
    if (!process.env.CI) hre.run("deploy-dxvote-develop").then(done);
    else done();
  });

  it("Wallet - execute proposeVote -option 0 - check action - with DXDVotingMachine", async function () {
    assert.equal(await web3.eth.getBalance(dxDao.avatar.address), "100");

    await expectRevert(
      dxDao.votingMachine.vote(proposalId, 0, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
      }),
      "wrong decision value"
    );
    assert.equal(await web3.eth.getBalance(dxDao.avatar.address), "100");
  });

  it("Wallet - execute proposeVote -option 2 - check action - with DXDVotingMachine", async function () {
    assert.equal(await web3.eth.getBalance(dxDao.avatar.address), "100");

    await dxDao.votingMachine.vote(proposalId, 2, 0, constants.NULL_ADDRESS, {
      from: accounts[2],
    });

    assert.equal((await masterAvatarScheme.getProposal(proposalId)).state, 2);
    const inactiveProposals = await dxDao.controller.getInactiveProposals(0, 0);
    assert.equal(inactiveProposals[0].proposalId, proposalId);
    assert.equal(inactiveProposals[0].scheme, masterAvatarScheme.address);
    assert.deepEqual(await dxDao.controller.getActiveProposals(0, 0), []);
    assert.equal(await web3.eth.getBalance(dxDao.avatar.address), "100");
  });

  it("Wallet - execute proposeVote -option 1 - check action - with DXDVotingMachine", async function () {
    assert.equal(await web3.eth.getBalance(dxDao.avatar.address), "100");

    const executionProposalTx = await dxDao.votingMachine.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      {
        from: accounts[2],
      }
    );

    assert.equal((await masterAvatarScheme.getProposal(proposalId)).state, 3);
    const inactiveProposals = await dxDao.controller.getInactiveProposals(0, 0);
    assert.equal(inactiveProposals[0].proposalId, proposalId);
    assert.equal(inactiveProposals[0].scheme, masterAvatarScheme.address);
    assert.deepEqual(await dxDao.controller.getActiveProposals(0, 0), []);
    assert.equal(await web3.eth.getBalance(dxDao.avatar.address), "95");

    const executionTxEvents = helpers.logDecoder.decodeLogs(
      executionProposalTx.receipt.rawLogs
    );
    const vestingCreatedEvent = executionTxEvents.find(
      event =>
        event.name === "VestingCreated" &&
        web3.utils.toChecksumAddress(event.address) === vestingFactory.address
    );
    const nftMintedEvent = executionTxEvents.find(
      event =>
        event.name === "Transfer" &&
        web3.utils.toChecksumAddress(event.address) === nftMinter.address
    );
    const vestingContract = await TokenVesting.at(
      vestingCreatedEvent.args.vestingContractAddress
    );
    assert.equal(
      await nftMinter.ownerOf(nftMintedEvent.args.tokenId),
      accounts[3]
    );
    assert.equal(
      await nftMinter.tokenURI(nftMintedEvent.args.tokenId),
      "tokenURIHere"
    );
    assert.equal(await vestingContract.start(), vestingStart);
    assert.equal(
      (await vestingContract.cliff()).toNumber(),
      vestingStart + moment.duration(1, "years").asSeconds()
    );
    assert.equal(
      (await vestingContract.duration()).toNumber(),
      moment.duration(2, "years").asSeconds()
    );
    assert.equal(await vestingContract.revocable(), true);
    assert.equal(await vestingContract.beneficiary(), accounts[3]);
    assert.equal(
      await votingMachineToken.balanceOf(vestingContract.address),
      500
    );
  });
});
