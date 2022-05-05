import * as helpers from "../helpers";

const { time } = require("@openzeppelin/test-helpers");
const moment = require("moment");

const WalletScheme = artifacts.require("./WalletScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ERC721Factory = artifacts.require("./ERC721Factory.sol");
const ERC20VestingFactory = artifacts.require("./ERC20VestingFactory.sol");
const TokenVesting = artifacts.require("./TokenVesting.sol");

contract("Dxvote Utils", function (accounts) {
  let standardTokenMock,
    permissionRegistry,
    masterWalletScheme,
    quickWalletScheme,
    org,
    votingMachine,
    nftMinter,
    vestingFactory;

  const constants = helpers.constants;
  const executionTimeout = 172800 + 86400; // _queuedVotePeriodLimit + _boostedVotePeriodLimit

  beforeEach(async function () {
    standardTokenMock = await ERC20Mock.new(
      accounts[1],
      web3.utils.toWei("100")
    );
    org = await helpers.setupOrganization(
      [accounts[0], accounts[1], accounts[2]],
      [1000, 1000, 1000],
      [20000, 10000, 70000]
    );
    votingMachine = await helpers.setUpVotingMachine(
      standardTokenMock.address,
      "dxd"
    );
    await standardTokenMock.transfer(
      org.avatar.address,
      web3.utils.toWei("50"),
      { from: accounts[1] }
    );
    permissionRegistry = await PermissionRegistry.new(accounts[0], 30);
    await permissionRegistry.initialize();

    masterWalletScheme = await WalletScheme.new();
    await masterWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      true,
      org.controller.address,
      permissionRegistry.address,
      "Master Wallet",
      executionTimeout,
      5
    );

    quickWalletScheme = await WalletScheme.new();
    await quickWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      false,
      org.controller.address,
      permissionRegistry.address,
      "Quick Wallet",
      executionTimeout,
      0
    );

    await permissionRegistry.setPermission(
      constants.NULL_ADDRESS,
      org.avatar.address,
      constants.ANY_ADDRESS,
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await permissionRegistry.setPermission(
      standardTokenMock.address,
      org.avatar.address,
      constants.ANY_ADDRESS,
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await permissionRegistry.setPermission(
      constants.NULL_ADDRESS,
      quickWalletScheme.address,
      constants.ANY_ADDRESS,
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await time.increase(30);

    nftMinter = await ERC721Factory.new("DXDAO NFT", "DXNFT", {
      from: accounts[0],
    });
    await nftMinter.transferOwnership(org.avatar.address);
    vestingFactory = await ERC20VestingFactory.new(
      standardTokenMock.address,
      org.avatar.address
    );

    await org.daoCreator.setSchemes(
      org.avatar.address,
      [masterWalletScheme.address, quickWalletScheme.address],
      [votingMachine.params, votingMachine.params],
      [
        helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true,
        }),
        helpers.encodePermission({
          canGenericCall: false,
          canUpgrade: false,
          canChangeConstraints: false,
          canRegisterSchemes: false,
        }),
      ],
      "metaData"
    );
  });

  it("Mint NFT and create DXD vesting in one proposal", async function () {
    const approveToVestingFactoryData = standardTokenMock.contract.methods
      .approve(vestingFactory.address, constants.MAX_UINT_256)
      .encodeABI();
    const vestingStart = moment().unix();
    const createVestingData = vestingFactory.contract.methods
      .create(
        accounts[3],
        vestingStart,
        moment.duration(1, "years").asSeconds(),
        moment.duration(2, "years").asSeconds(),
        web3.utils.toWei("10")
      )
      .encodeABI();
    const mintNFTData = nftMinter.contract.methods
      .mint(accounts[3], "tokenURIHere")
      .encodeABI();

    const tx = await masterWalletScheme.proposeCalls(
      [standardTokenMock.address, vestingFactory.address, nftMinter.address],
      [approveToVestingFactoryData, createVestingData, mintNFTData],
      [0, 0, 0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );

    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    const executionProposalTx = await votingMachine.contract.vote(
      proposalId,
      1,
      0,
      constants.NULL_ADDRESS,
      { from: accounts[2] }
    );
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
      await standardTokenMock.balanceOf(vestingContract.address),
      web3.utils.toWei("10")
    );
  });
});
