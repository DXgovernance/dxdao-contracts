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
const GEN_TOKEN = "0x543Ff227F64Aa17eA132Bf9886cAb5DB55DCAddf";
var moment = require("moment");
const constants = require("../test/helpers/constants");
const { encodePermission } = require("../test/helpers/permissions");

// DXdao ORG parameters:
const orgName = "DXdao";
const tokenName = "DXDNative";
const tokenSymbol = "DXDN";
const founders = [];
const initRep = 0;
const initRepInWei = [ initRep ];
const initToken = 0;
const initTokenInWei = [ initToken ];
const cap = 0;

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
      
    const accounts = await web3.eth.getAccounts();
    founders[ 0 ] = accounts[ 0 ];
    var returnedParams = await daoCreatorInst.forgeOrg(orgName, tokenName, tokenSymbol, founders,
      initTokenInWei, initRepInWei, cap, {gas: constants.ARC_GAS_LIMIT});
    var DxAvatarInst = await DxAvatar.at(returnedParams.logs[ 0 ].args._avatar);
    var ContollerInst = await DxController.at(await DxAvatarInst.owner());
    await deployer.deploy(GenesisProtocol, GEN_TOKEN, {gas: constants.ARC_GAS_LIMIT});
    // Deploy GenesisProtocol:
    var genesisProtocol = await GenesisProtocol.deployed();
    
    async function encodeParameters(parameters) {
      return await genesisProtocol.getParametersHash(
        [
          parameters.queuedVoteRequiredPercentage,
          parameters.queuedVotePeriodLimit,
          parameters.boostedVotePeriodLimit,
          parameters.preBoostedVotePeriodLimit,
          parameters.thresholdConst,
          parameters.quietEndingPeriod,
          parameters.proposingRepReward,
          parameters.votersReputationLossRatio,
          parameters.minimumDaoBounty,
          parameters.daoBountyConst,
          parameters.activationTime,
        ], parameters.voteOnBehalf
      );
    }
  
    // Deploy MasterWalletScheme:
    await deployer.deploy(WalletScheme);
    var masterWalletScheme = await WalletScheme.deployed();
    var masterWalletSchemeParamsHash = await encodeParameters({
      queuedVoteRequiredPercentage: 50, 
      queuedVotePeriodLimit: moment.duration(2, 'days').asSeconds(), 
      boostedVotePeriodLimit: moment.duration(0.5, 'days').asSeconds(), 
      preBoostedVotePeriodLimit: moment.duration(0.5, 'days').asSeconds(), 
      thresholdConst: 2, 
      quietEndingPeriod: moment.duration(1, 'days').asSeconds(), 
      proposingRepReward: 0, 
      votersReputationLossRatio: 0, 
      minimumDaoBounty: web3.utils.toWei("200"),
      daoBountyConst: 2, 
      activationTime: moment().add(10, 'min').unix(),
      voteOnBehalf: NULL_ADDRESS
    });
    await masterWalletScheme.initialize(
      DxAvatarInst.address, genesisProtocol.address, masterWalletSchemeParamsHash, ContollerInst.address
    );
    
    // Deploy QuickWalletScheme:
    await deployer.deploy(WalletScheme);
    var quickWalletScheme = await WalletScheme.deployed();
    var quickWalletSchemeParamsHash = await encodeParameters({
      queuedVoteRequiredPercentage: 40, 
      queuedVotePeriodLimit: moment.duration(1, 'days').asSeconds(), 
      boostedVotePeriodLimit: moment.duration(0.25, 'days').asSeconds(), 
      preBoostedVotePeriodLimit: moment.duration(0.25, 'days').asSeconds(), 
      thresholdConst: 2, 
      quietEndingPeriod: moment.duration(0.5, 'days').asSeconds(), 
      proposingRepReward: 0, 
      votersReputationLossRatio: 0, 
      minimumDaoBounty: web3.utils.toWei("100"),
      daoBountyConst: 2, 
      activationTime: moment().add(10, 'min').unix(),
      voteOnBehalf: NULL_ADDRESS
    });
    await quickWalletScheme.initialize(
      DxAvatarInst.address, genesisProtocol.address, quickWalletSchemeParamsHash, NULL_ADDRESS
    );
    
    // Deploy ContributionReward:
    await deployer.deploy(ContributionReward);
    var contributionsReward = await ContributionReward.deployed();
    var contributionsRewardParamsHash = await encodeParameters({
      queuedVoteRequiredPercentage: 50, 
      queuedVotePeriodLimit: moment.duration(1, 'days').asSeconds(), 
      boostedVotePeriodLimit: moment.duration(0.25, 'days').asSeconds(), 
      preBoostedVotePeriodLimit: moment.duration(0.25, 'days').asSeconds(), 
      thresholdConst: 2, 
      quietEndingPeriod: moment.duration(2, 'days').asSeconds(), 
      proposingRepReward: 0, 
      votersReputationLossRatio: 0, 
      minimumDaoBounty: web3.utils.toWei("100"),
      daoBountyConst: 2, 
      activationTime: moment().add(10, 'min').unix(),
      voteOnBehalf: NULL_ADDRESS
    });
    
    // Deploy SchemeRegistrar:
    await deployer.deploy(SchemeRegistrar);
    var schemeRegistrar = await SchemeRegistrar.deployed();
    var schemeRegistrarParamsHash = await encodeParameters({
      queuedVoteRequiredPercentage: 50,
      queuedVotePeriodLimit: moment.duration(2, 'days').asSeconds(),
      boostedVotePeriodLimit: moment.duration(0.5, 'days').asSeconds(),
      preBoostedVotePeriodLimit: moment.duration(0.5, 'days').asSeconds(),
      thresholdConst: 2,
      quietEndingPeriod: moment.duration(1, 'days').asSeconds(),
      proposingRepReward: 0,
      votersReputationLossRatio: 0,
      minimumDaoBounty: web3.utils.toWei("100"),
      daoBountyConst: 2,
      activationTime: moment().add(10, 'min').unix(),
      voteOnBehalf: NULL_ADDRESS
    });

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
