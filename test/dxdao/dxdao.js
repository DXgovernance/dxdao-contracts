import * as helpers from "../helpers";

const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const DxController = artifacts.require("./DxController.sol");
const DxAvatar = artifacts.require("./DxAvatar.sol");
const DxReputation = artifacts.require("./DxReputation.sol");
const DxToken = artifacts.require("./DxToken.sol");
const DaoCreator = artifacts.require("./DaoCreator.sol");
const DxControllerCreator = artifacts.require("./DxControllerCreator.sol");
const DXDVotingMachine = artifacts.require("./DXDVotingMachine.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const Wallet = artifacts.require("./Wallet.sol");

const setup = async function( accounts ) {
};

const createCallToActionMock = async function(_sender, _actionMock) {
  return await new web3.eth.Contract(_actionMock.abi).methods.test2(_sender).encodeABI();
};

contract("DXdao", function(accounts) {

  const constants = helpers.constants;

  it("Wallet - execute proposeVote -positive decision - check action - with DXDVotingMachine", async function() {  
    const votingMachineToken = await ERC20Mock.new(accounts[ 0 ], 1000);
    const masterWalletScheme = await WalletScheme.new();
    const controllerCreator = await DxControllerCreator.new({gas: constants.GAS_LIMIT});
    const daoCreator = await DaoCreator.new(
      controllerCreator.address, {gas: constants.GAS_LIMIT}
    );
    const users = [ accounts[ 0 ], accounts[ 1 ], accounts[ 2 ] ];
    const usersTokens = [ 1000, 1000, 1000 ];
    const usersRep = [ 20, 10, 70 ];
    
    var tx = await daoCreator.forgeOrg(
      "testOrg", "TEST", "TST", users, usersTokens, usersRep, 0, {gas: constants.GAS_LIMIT}
    );
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[ 0 ].event, "NewOrg");
    const avatar = await DxAvatar.at(tx.logs[ 0 ].args._avatar);
    const token = await DxToken.at(await avatar.nativeToken());
    const reputation = await DxReputation.at(await avatar.nativeReputation());
    const controller = await DxController.at(await avatar.owner());
    
    const votingMachine = await helpers.setupGenesisProtocol(
      accounts, votingMachineToken.address, 'dxd', constants.NULL_ADDRESS
    );
    
    const genesisProtocol = await DXDVotingMachine.new(token.address, {gas: constants.GAS_LIMIT});
    
    // Parameters
    const voteOnBehalf = constants.NULL_ADDRESS;
    const _queuedVoteRequiredPercentage = 50;
    const _queuedVotePeriodLimit = 60;
    const _boostedVotePeriodLimit = 60;
    const _preBoostedVotePeriodLimit = 0;
    const _thresholdConst = 2000;
    const _quietEndingPeriod = 0;
    const _proposingRepReward = 60;
    const _votersReputationLossRatio = 10;
    const _minimumDaoBounty = 15;
    const _daoBountyConst = 10;
    const _activationTime = 0;
    
    genesisProtocol.setParameters([
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
      _activationTime 
    ], voteOnBehalf);
    const params = await genesisProtocol.getParametersHash([
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
      _activationTime
    ], voteOnBehalf);
    
    const permissionRegistry = await PermissionRegistry.new(accounts[0], 10);

    await masterWalletScheme.initialize(
      avatar.address,
      votingMachine.address,
      votingMachine.params,
      controller.address,
      permissionRegistry.address,
      "Master Scheme",
      86400,
      5
    );
    
    await daoCreator.setSchemes(
      avatar.address,
      [ masterWalletScheme.address ],
      [ constants.NULL_HASH ],
      [ helpers.encodePermission({
        canGenericCall: true,
        canUpgrade: true,
        canChangeConstraints: true,
        canRegisterSchemes: true
      }) ],
      "metaData"
    );
    
  });

});
