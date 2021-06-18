import * as helpers from "../helpers";
const { fixSignature } = require('../helpers/sign');

const { time, expectRevert } = require("@openzeppelin/test-helpers");
const moment = require("moment");

const WalletScheme = artifacts.require("./WalletScheme.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const DaoCreator = artifacts.require("./DaoCreator.sol");
const DxControllerCreator = artifacts.require("./DxControllerCreator.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const Wallet = artifacts.require("./Wallet.sol");
const DXdaoNFT = artifacts.require("./DXdaoNFT.sol");
const DXDVestingFactory = artifacts.require("./DXDVestingFactory.sol");
const TokenVesting = artifacts.require("./TokenVesting.sol");

contract("Dxvote Utils", function(accounts) {
  
  let standardTokenMock,
  permissionRegistry,
  masterWalletScheme,
  quickWalletScheme,
  daoCreator,
  org,
  actionMock,
  votingMachine,
  testToken,
  nftMinter,
  vestingFactory
  
  const constants = helpers.constants;
  const executionTimeout = 172800 + 86400; // _queuedVotePeriodLimit + _boostedVotePeriodLimit
  
  beforeEach( async function(){
    actionMock = await ActionMock.new();
    testToken = await ERC20Mock.new(accounts[1], 1000);
    standardTokenMock = await ERC20Mock.new(accounts[1], web3.utils.toWei("100"));
    const controllerCreator = await DxControllerCreator.new({gas: constants.GAS_LIMIT});
    daoCreator = await DaoCreator.new(
      controllerCreator.address, {gas: constants.GAS_LIMIT}
    );
    org = await helpers.setupOrganizationWithArrays(
      daoCreator,
      [accounts[0], accounts[1], accounts[2]],
      [1000, 1000, 1000],
      [20000, 10000, 70000]
    );
    votingMachine = await helpers.setupGenesisProtocol(
      accounts, standardTokenMock.address, 'dxd'
    );
    await standardTokenMock.transfer(org.avatar.address, web3.utils.toWei("50"), {from: accounts[1]});
    permissionRegistry = await PermissionRegistry.new(accounts[0], 30);
    
    masterWalletScheme = await WalletScheme.new();
    await masterWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
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
      votingMachine.params,
      constants.NULL_ADDRESS,
      permissionRegistry.address,
      "Quick Wallet",
      executionTimeout,
      0
    );
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      org.avatar.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      true
    );
    
    await permissionRegistry.setAdminPermission(
      standardTokenMock.address, 
      org.avatar.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      true
    );
    
    await permissionRegistry.setAdminPermission(
      constants.NULL_ADDRESS, 
      quickWalletScheme.address, 
      constants.ANY_ADDRESS, 
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256, 
      true
    );
    
    await time.increase(30);
    
    nftMinter = await DXdaoNFT.new();
    await nftMinter.transferOwnership(org.avatar.address);
    vestingFactory = await DXDVestingFactory.new(standardTokenMock.address);
    
    await daoCreator.setSchemes(
      org.avatar.address,
      [masterWalletScheme.address, quickWalletScheme.address],
      [votingMachine.params, votingMachine.params],
      [helpers.encodePermission({
        canGenericCall: true,
        canUpgrade: true,
        canChangeConstraints: true,
        canRegisterSchemes: true
      }),
      helpers.encodePermission({
        canGenericCall: false,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
      })
     ],
      "metaData"
    );
  });
  
  it("Mint NFT and create DXD vesting in one proposal", async function() {
    
    const approveToVestingFactoryData = standardTokenMock.contract.methods.approve(
      vestingFactory.address,
      constants.MAX_UINT_256
    ).encodeABI();
    const vestingStart = moment().unix();
    const createVestingData = vestingFactory.contract.methods.create(
      accounts[3],
      vestingStart,
      moment.duration(1, 'years').asSeconds(),
      moment.duration(2, 'years').asSeconds(),
      web3.utils.toWei("10")
    ).encodeABI();
    const mintNFTData = nftMinter.contract.methods.mint(accounts[3], "tokenURIHere").encodeABI();
    
    const tx = await masterWalletScheme.proposeCalls(
      [standardTokenMock.address, vestingFactory.address, nftMinter.address],
      [approveToVestingFactoryData, createVestingData, mintNFTData],
      [0, 0, 0],
      constants.TEST_TITLE,
      constants.SOME_HASH
    );

    const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
  
    const executionProposalTx = await votingMachine.contract.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {from: accounts[2]});
    const executionTxEvents = helpers.logDecoder.decodeLogs(executionProposalTx.receipt.rawLogs);
    const vestingCreatedEvent = executionTxEvents.find(
      event => (event.name == "VestingCreated" && web3.utils.toChecksumAddress(event.address) == vestingFactory.address)
    );
    const nftMintedEvent = executionTxEvents.find(
      event => (event.name == "Transfer" && web3.utils.toChecksumAddress(event.address) == nftMinter.address)
    );
    const vestingContract = await TokenVesting.at(vestingCreatedEvent.values.vestingContractAddress);
    assert.equal(await nftMinter.ownerOf(nftMintedEvent.values.tokenId), accounts[3]);
    assert.equal(await nftMinter.tokenURI(nftMintedEvent.values.tokenId), "tokenURIHere");
    assert.equal(await vestingContract.start(), vestingStart);
    assert.equal((await vestingContract.cliff()).toNumber(), vestingStart + moment.duration(1, 'years').asSeconds());
    assert.equal((await vestingContract.duration()).toNumber(), moment.duration(2, 'years').asSeconds());
    assert.equal(await vestingContract.revocable(), true);
    assert.equal(await vestingContract.beneficiary(), accounts[3]);
    assert.equal(await standardTokenMock.balanceOf(vestingContract.address), web3.utils.toWei("10"));
  
  });
  
});
