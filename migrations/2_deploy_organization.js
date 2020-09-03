//this migration file is used only for testing purpose
var DxToken = artifacts.require("DxToken.sol");
var DxAvatar = artifacts.require("DxAvatar.sol");
var DxReputation = artifacts.require("DxReputation.sol");
var DxController = artifacts.require("DxController.sol");
var DaoCreator = artifacts.require("DaoCreator.sol");
var WalletScheme = artifacts.require("WalletScheme.sol");
var ContributionReward = artifacts.require("ContributionReward.sol");
var SchemeRegistrar = artifacts.require("SchemeRegistrar.sol");
var GenesisProtocol = artifacts.require("GenesisProtocol.sol");
var DXDVotingMachine = artifacts.require("DXDVotingMachine.sol");
var DxControllerCreator = artifacts.require("DxControllerCreator.sol");
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const GEN_TOKEN = "0x543Ff227F64Aa17eA132Bf9886cAb5DB55DCAddf";
const DXD_TOKEN = "0xDd25BaE0659fC06a8d00CD06C7f5A98D71bfB715";
var moment = require("moment");
const constants = require("../test/helpers/constants");
const { encodePermission } = require("../test/helpers/permissions");
const repHolders = require('./repHolders.json');

// Get initial REP holders
let founders = [], initialRep = [], initialTokens = [];
for (var address in repHolders.addresses) {
  founders.push(address);
  initialRep.push(repHolders.addresses[address]);
  initialTokens.push(0);
}

// DXdao ORG parameters:
const orgName = "DXdao";
const tokenName = "DXDNative";
const tokenSymbol = "DXDN";

// Deploy test organization with the following schemes:
// WalletScheme with all permissions that uses DXDVotingMachine
// WalletScheme with no permissions for quick decisions  that uses DXDVotingMachine
// SchemeRegistrar that can register schemes, upgrade controller and set constraints that uses GenesisProtocol
// ContributionReward scheme that can only execute generic calls that uses GenesisProtocol
module.exports = async function(deployer) {
  const accounts = await web3.eth.getAccounts();
    
  // Deploy and mint reputation
  await deployer.deploy(DxReputation, {gas: constants.ARC_GAS_LIMIT});
  var dxReputation = await DxReputation.deployed();
  for (var i = 0; i < founders.length; i++)
    await dxReputation.mint(founders[i], initialRep[i]);
    
  // Deploy empty token
  await deployer.deploy(DxToken, tokenName, tokenSymbol, 0, {gas: constants.ARC_GAS_LIMIT});
  var dxToken = await DxToken.deployed();

  // Deploy Avatar
  await deployer.deploy(
    DxAvatar, orgName, dxReputation.address, dxToken.address, {gas: constants.ARC_GAS_LIMIT}
  );
  var dxAvatar = await DxAvatar.deployed();
  
  // Deploy controller and transfer avatar to controller
  await deployer.deploy(
    DxController, dxAvatar.address,{gas: constants.ARC_GAS_LIMIT}
  );
  var dxController = await DxController.deployed();
  await dxAvatar.transferOwnership(dxController.address);
  
  // Deploy GenesisProtocol and DXDVotingMachine:
  await deployer.deploy(GenesisProtocol, GEN_TOKEN, {gas: constants.ARC_GAS_LIMIT});
  var genesisProtocol = await GenesisProtocol.deployed();
  await deployer.deploy(DXDVotingMachine, DXD_TOKEN, {gas: constants.ARC_GAS_LIMIT});
  var dxdVotingMachine = await DXDVotingMachine.deployed();

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
  
  async function setParameters(votingMachine, parameters) {
    return await votingMachine.setParameters(
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
  const masterWalletSchemeParams = {
    queuedVoteRequiredPercentage: 60, 
    queuedVotePeriodLimit: moment.duration(2, 'days').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(1, 'days').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(0.5, 'days').asSeconds(), 
    thresholdConst: 2000, 
    quietEndingPeriod: moment.duration(1, 'days').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 0, 
    minimumDaoBounty: web3.utils.toWei("0.02"),
    daoBountyConst: 2, 
    activationTime: moment().add(10, 'min').unix(),
    voteOnBehalf: NULL_ADDRESS
  }
  var masterWalletSchemeParamsHash = await encodeParameters(masterWalletSchemeParams);
  await setParameters(dxdVotingMachine, masterWalletSchemeParams)
  await masterWalletScheme.initialize(
    dxAvatar.address, dxdVotingMachine.address, masterWalletSchemeParamsHash, dxController.address
  );
  
  // Deploy QuickWalletScheme:
  await deployer.deploy(WalletScheme);
  var quickWalletScheme = await WalletScheme.deployed();
  const quickWalletSchemeParams = {
    queuedVoteRequiredPercentage: 50, 
    queuedVotePeriodLimit: moment.duration(1, 'days').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(0.5, 'days').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(0.25, 'days').asSeconds(), 
    thresholdConst: 2000, 
    quietEndingPeriod: moment.duration(0.5, 'days').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 0, 
    minimumDaoBounty: web3.utils.toWei("0.01"),
    daoBountyConst: 2, 
    activationTime: moment().add(10, 'min').unix(),
    voteOnBehalf: NULL_ADDRESS
  };
  var quickWalletSchemeParamsHash = await encodeParameters(quickWalletSchemeParams);
  await setParameters(dxdVotingMachine, quickWalletSchemeParams)
  await quickWalletScheme.initialize(
    dxAvatar.address, dxdVotingMachine.address, quickWalletSchemeParamsHash, NULL_ADDRESS
  );
  
  // Deploy ContributionReward:
  await deployer.deploy(ContributionReward);
  const contributionReward = await ContributionReward.deployed();
  const contributionRewardParams = {
    queuedVoteRequiredPercentage: 50, 
    queuedVotePeriodLimit: moment.duration(1, 'days').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(0.5, 'days').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(0.25, 'days').asSeconds(), 
    thresholdConst: 2000, 
    quietEndingPeriod: moment.duration(0.5, 'days').asSeconds(), 
    proposingRepReward: web3.utils.toWei("500"), 
    votersReputationLossRatio: 4, 
    minimumDaoBounty: web3.utils.toWei("200"),
    daoBountyConst: 10, 
    activationTime: moment().add(10, 'min').unix(),
    voteOnBehalf: NULL_ADDRESS
  };
  await setParameters(genesisProtocol, contributionRewardParams);
  const contributionRewardParamsHash = await encodeParameters(contributionRewardParams);
  await contributionReward.setParameters(
    contributionRewardParamsHash,
    genesisProtocol.address
  );
  const contributionRewardVotingMachineParamsHash = await contributionReward.getParametersHash(
    contributionRewardParamsHash,
    genesisProtocol.address
  );
  
  // Deploy SchemeRegistrar:
  await deployer.deploy(SchemeRegistrar);
  var schemeRegistrar = await SchemeRegistrar.deployed();
  const schemeRegistrarParams = {
    queuedVoteRequiredPercentage: 50,
    queuedVotePeriodLimit: moment.duration(2, 'days').asSeconds(),
    boostedVotePeriodLimit: moment.duration(1, 'days').asSeconds(),
    preBoostedVotePeriodLimit: moment.duration(0.5, 'days').asSeconds(),
    thresholdConst: 2000,
    quietEndingPeriod: moment.duration(1, 'days').asSeconds(),
    proposingRepReward: web3.utils.toWei("2000"),
    votersReputationLossRatio: 4,
    minimumDaoBounty: web3.utils.toWei("1000"),
    daoBountyConst: 2,
    activationTime: moment().add(10, 'min').unix(),
    voteOnBehalf: NULL_ADDRESS
  };
  await setParameters(genesisProtocol, schemeRegistrarParams);
  const schemeRegistrarParamsHash = await encodeParameters(schemeRegistrarParams);
  await schemeRegistrar.setParameters(
    schemeRegistrarParamsHash,
    schemeRegistrarParamsHash,
    genesisProtocol.address
  );
  const schemeRegistrarVotingMachineParamsHash = await schemeRegistrar.getParametersHash(
    schemeRegistrarParamsHash,
    schemeRegistrarParamsHash,
    genesisProtocol.address
  );

  // set DXdao initial schmes:
  await dxController.registerScheme(
    masterWalletScheme.address,
    masterWalletSchemeParamsHash,
    encodePermission({
      canGenericCall: true,
      canUpgrade: true,
      canChangeConstraints: true,
      canRegisterSchemes: true
    }),
    dxAvatar.address
  )
  await dxController.registerScheme(
    quickWalletScheme.address,
    quickWalletSchemeParamsHash,
    encodePermission({
      canGenericCall: false,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: false
    }),
    dxAvatar.address
  )
  await dxController.registerScheme(
    schemeRegistrar.address,
    schemeRegistrarVotingMachineParamsHash,
    encodePermission({
      canGenericCall: false,
      canUpgrade: true,
      canChangeConstraints: true,
      canRegisterSchemes: true
    }),
    dxAvatar.address
  )
  await dxController.registerScheme(
    contributionReward.address,
    contributionRewardVotingMachineParamsHash,
    encodePermission({
      canGenericCall: true,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: false
    }),
    dxAvatar.address
  )
  await dxController.unregisterScheme(accounts[0], dxAvatar.address);
};
