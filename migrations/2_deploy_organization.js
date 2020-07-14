//this migration file is used only for testing purpose
var DxAvatar = artifacts.require("DxAvatar.sol");
var DxController = artifacts.require("DxController.sol");
var DaoCreator = artifacts.require("DaoCreator.sol");
var WalletScheme = artifacts.require("WalletScheme.sol");
var ContributionReward = artifacts.require("ContributionReward.sol");
var SchemeRegistrar = artifacts.require("SchemeRegistrar.sol");
var GenesisProtocol = artifacts.require("GenesisProtocol.sol");
var DxControllerCreator = artifacts.require("DxControllerCreator.sol");
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const DXD_TOKEN = "0xdd25bae0659fc06a8d00cd06c7f5a98d71bfb715";
var moment = require("moment");
const constants = require("../test/helpers/constants");
const { encodePermission } = require("../test/helpers/permissions");

// DXdao ORG parameters:
const orgName = "DXdao";
const tokenName = "DXDNative";
const tokenSymbol = "DXDN";
const founders = [];
const initRep = web3.utils.toWei("10");
const initRepInWei = [ initRep ];
const initToken = web3.utils.toWei("1000");
const initTokenInWei = [ initToken ];
const cap = web3.utils.toWei("100000000", "ether");

const votePrec = 50;

var accounts;

//Deploy test organization with the following schemes:
// WalletScheme with all permissions,
// WalletScheme with no permissions for quick decisions.
// SchemeRegistrar that can register schemes, upgrade controller and set constraints
// ContributionReward scheme that can only execute generic calls
module.exports = async function(deployer) {
  deployer.deploy(DxControllerCreator, {gas: constants.ARC_GAS_LIMIT}).then(async function(){
    var controllerCreator = await DxControllerCreator.deployed();
    await deployer.deploy(DaoCreator, controllerCreator.address, {gas: constants.ARC_GAS_LIMIT});
    var daoCreatorInst = await DaoCreator.deployed(controllerCreator.address, {gas: constants.ARC_GAS_LIMIT});
      
    accounts = await web3.eth.getAccounts();
    founders[ 0 ] = accounts[ 0 ];
    var returnedParams = await daoCreatorInst.forgeOrg(orgName, tokenName, tokenSymbol, founders,
      initTokenInWei, initRepInWei, cap, {gas: constants.ARC_GAS_LIMIT});
    var DxAvatarInst = await DxAvatar.at(returnedParams.logs[ 0 ].args._avatar);
    var ContollerInst = await DxController.at(await DxAvatarInst.owner());
    await deployer.deploy(GenesisProtocol, DXD_TOKEN, {gas: constants.ARC_GAS_LIMIT});
    // Deploy GenesisProtocol:
    var genesisProtocol = await GenesisProtocol.deployed();
  
    // Deploy MasterWalletScheme:
    await deployer.deploy(WalletScheme);
    var masterWalletScheme = await WalletScheme.deployed();
    var masterWalletSchemeParamsHash = await genesisProtocol.getParametersHash(
    [
      50, // queuedVoteRequiredPercentage
      moment.duration(2, 'days').asSeconds(), // queuedVotePeriodLimit
      moment.duration(0.5, 'days').asSeconds(), // boostedVotePeriodLimit
      moment.duration(0.5, 'days').asSeconds(), // preBoostedVotePeriodLimit
      2, // thresholdConst
      moment.duration(1, 'days').asSeconds(), // quietEndingPeriod
      0, // proposingRepReward
      0, // votersReputationLossRatio
      web3.utils.toWei("0.002"),// minimumDaoBounty
      2, // daoBountyConst
      moment().add(10, 'min').unix() // activationTime
    ], NULL_ADDRESS);
    await masterWalletScheme.initialize(
      DxAvatarInst.address, ContollerInst.address, genesisProtocol.address, masterWalletSchemeParamsHash
    );
    
    // Deploy QuickWalletScheme:
    await deployer.deploy(WalletScheme);
    var quickWalletScheme = await WalletScheme.deployed();
    var quickWalletSchemeParamsHash = await genesisProtocol.getParametersHash(
    [
      40, // queuedVoteRequiredPercentage
      moment.duration(1, 'days').asSeconds(), // queuedVotePeriodLimit
      moment.duration(0.25, 'days').asSeconds(), // boostedVotePeriodLimit
      moment.duration(0.25, 'days').asSeconds(), // preBoostedVotePeriodLimit
      2, // thresholdConst
      moment.duration(0.5, 'days').asSeconds(), // quietEndingPeriod
      0, // proposingRepReward
      0, // votersReputationLossRatio
      web3.utils.toWei("0.001"),// minimumDaoBounty
      2, // daoBountyConst
      moment().add(10, 'min').unix() // activationTime
    ], NULL_ADDRESS);
    await quickWalletScheme.initialize(
      DxAvatarInst.address, ContollerInst.address, genesisProtocol.address, quickWalletSchemeParamsHash
    );
    
    // Deploy ContributionReward:
    await deployer.deploy(ContributionReward);
    var contributionsReward = await ContributionReward.deployed();
    var contributionsRewardParamsHash = await genesisProtocol.getParametersHash(
    [
      50, // queuedVoteRequiredPercentage
      moment.duration(1, 'days').asSeconds(), // queuedVotePeriodLimit
      moment.duration(0.25, 'days').asSeconds(), // boostedVotePeriodLimit
      moment.duration(0.25, 'days').asSeconds(), // preBoostedVotePeriodLimit
      2, // thresholdConst
      moment.duration(2, 'days').asSeconds(), // quietEndingPeriod
      0, // proposingRepReward
      0, // votersReputationLossRatio
      web3.utils.toWei("0.001"),// minimumDaoBounty
      2, // daoBountyConst
      moment().add(10, 'min').unix() // activationTime
    ], NULL_ADDRESS);
    
    // Deploy SchemeRegistrar:
    await deployer.deploy(SchemeRegistrar);
    var schemeRegistrar = await SchemeRegistrar.deployed();
    var schemeRegistrarParamsHash = await genesisProtocol.getParametersHash(
    [
      50, // queuedVoteRequiredPercentage
      moment.duration(2, 'days').asSeconds(), // queuedVotePeriodLimit
      moment.duration(0.5, 'days').asSeconds(), // boostedVotePeriodLimit
      moment.duration(0.5, 'days').asSeconds(), // preBoostedVotePeriodLimit
      2, // thresholdConst
      moment.duration(1, 'days').asSeconds(), // quietEndingPeriod
      0, // proposingRepReward
      0, // votersReputationLossRatio
      web3.utils.toWei("0.002"),// minimumDaoBounty
      2, // daoBountyConst
      moment().add(10, 'min').unix() // activationTime
    ], NULL_ADDRESS);

    // set DXdao initial schmes:
    await daoCreatorInst.setSchemes(
      DxAvatarInst.address,
      [ masterWalletScheme.address, quickWalletScheme.address, schemeRegistrar.address, contributionsReward.address ],
      [ masterWalletSchemeParamsHash, quickWalletSchemeParamsHash, schemeRegistrarParamsHash, contributionsRewardParamsHash ],
      [ encodePermission({
        canGenericCall: true,
        canUpgrade: true,
        canChangeConstraints: true,
        canRegisterSchemes: true
      }),
      encodePermission({
        canGenericCall: false,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
      }),
      encodePermission({
        canGenericCall: false,
        canUpgrade: true,
        canChangeConstraints: true,
        canRegisterSchemes: true
      }),
      encodePermission({
        canGenericCall: true,
        canUpgrade: false,
        canChangeConstraints: false,
        canRegisterSchemes: false
      })
      ],
      "metaData"
    );
  });
};
