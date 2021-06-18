const hre = require("hardhat");
const web3 = hre.web3;
let moment = require("moment");
const { encodePermission } = require("../test/helpers/permissions");
const repHolders = require('../.repHolders.json');

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT_256 = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ANY_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

const networksConfig = {
  dxdToken: {
    rinkeby: {
      address: "0x417A288152A5a13b843135Db5Dc72Ea007a9EB8d",
      fromBlock: 8569799
    },
    xdai: {
      address: "0xb90D6bec20993Be5d72A5ab353343f7a0281f158",
      fromBlock: 15040609 
    },
    mainnet: {
      address: "0xa1d65E8fB6e87b60FECCBc582F7f97804B725521",
      fromBlock: 10012634 
    }
  },
  permissionRegistryDelay: {
    hardhat: moment.duration(1, 'hours').asSeconds(),
    rinkeby: moment.duration(1, 'days').asSeconds(),
    xdai: moment.duration(2, 'days').asSeconds(),
    mainnet: moment.duration(3, 'days').asSeconds()
  }
};

const schemesConfig = {
  hardhat: [{
    name: "RegistrarWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(21, 'days').asSeconds(),
    maxRepPercentageToMint: 0,
    controllerPermissions: {
      canGenericCall: false,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: true
    },
    permissions: [],
    queuedVoteRequiredPercentage: 75,
    boostedVoteRequiredPercentage: 2500,
    queuedVotePeriodLimit: moment.duration(14, 'days').asSeconds(),
    boostedVotePeriodLimit: moment.duration(5, 'days').asSeconds(),
    preBoostedVotePeriodLimit: moment.duration(2, 'days').asSeconds(),
    thresholdConst: 2000,
    quietEndingPeriod: moment.duration(12, 'hours').asSeconds(),
    proposingRepReward: 0,
    votersReputationLossRatio: 100,
    minimumDaoBounty: web3.utils.toWei("100"),
    daoBountyConst: 2,
  },{
    name: "MasterWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(21, 'days').asSeconds(),
    maxRepPercentageToMint: 5,
    controllerPermissions: {
      canGenericCall: true,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: false
    },
    permissions: [{
      asset: NULL_ADDRESS,
      to: "SCHEME",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: web3.utils.toWei("100"),
      allowed: true
    }],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 5,
    queuedVotePeriodLimit: moment.duration(14, 'days').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(5, 'days').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(2, 'days').asSeconds(), 
    thresholdConst: 1500, 
    quietEndingPeriod: moment.duration(6, 'hours').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 10, 
    minimumDaoBounty: web3.utils.toWei("10"),
    daoBountyConst: 2
  },{
    name: "QuickWalletScheme",
    callToController: false,
    maxSecondsForExecution: moment.duration(14, 'days').asSeconds(),
    maxRepPercentageToMint: 1,
    controllerPermissions: {
      canGenericCall: false,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: false
    },
    permissions: [{
      asset: NULL_ADDRESS,
      to: ANY_ADDRESS,
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    }],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 1,
    queuedVotePeriodLimit: moment.duration(7, 'days').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(3, 'days').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(0.5, 'days').asSeconds(), 
    thresholdConst: 1500, 
    quietEndingPeriod: moment.duration(3, 'hours').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 1, 
    minimumDaoBounty: web3.utils.toWei("1"),
    daoBountyConst: 2
  }],
  
  rinkeby: [{
    name: "RegistrarWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(2, 'days').asSeconds(),
    maxRepPercentageToMint: 0,
    controllerPermissions: {
      canGenericCall: false,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: true
    },
    permissions: [],
    queuedVoteRequiredPercentage: 75,
    boostedVoteRequiredPercentage: 2500,
    queuedVotePeriodLimit: moment.duration(1, 'days').asSeconds(),
    boostedVotePeriodLimit: moment.duration(12, 'hours').asSeconds(),
    preBoostedVotePeriodLimit: moment.duration(2, 'hours').asSeconds(),
    thresholdConst: 2000,
    quietEndingPeriod: moment.duration(30, 'minuets').asSeconds(),
    proposingRepReward: 0,
    votersReputationLossRatio: 100,
    minimumDaoBounty: web3.utils.toWei("100"),
    daoBountyConst: 50,
  },{
    name: "MasterWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(24, 'hours').asSeconds(),
    maxRepPercentageToMint: 5,
    controllerPermissions: {
      canGenericCall: true,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: false
    },
    permissions: [{
      asset: NULL_ADDRESS,
      to: "SCHEME",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: web3.utils.toWei("10"),
      allowed: true
    }],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 5,
    queuedVotePeriodLimit: moment.duration(12, 'hours').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(4, 'hours').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(1, 'hours').asSeconds(), 
    thresholdConst: 1500, 
    quietEndingPeriod: moment.duration(15, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 10, 
    minimumDaoBounty: web3.utils.toWei("10"),
    daoBountyConst: 10
  },{
    name: "QuickWalletScheme",
    callToController: false,
    maxSecondsForExecution: moment.duration(6, 'hours').asSeconds(),
    maxRepPercentageToMint: 1,
    controllerPermissions: {
      canGenericCall: false,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: false
    },
    permissions: [{
      asset: NULL_ADDRESS,
      to: ANY_ADDRESS,
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    }],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 1,
    queuedVotePeriodLimit: moment.duration(3, 'hours').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(1, 'hours').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(30, 'minutes').asSeconds(), 
    thresholdConst: 1100, 
    quietEndingPeriod: moment.duration(10, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 1, 
    minimumDaoBounty: web3.utils.toWei("1"),
    daoBountyConst: 10
  }]
};

export const getDeploymentConfig = function(network) {
  return {
    votingMachineToken: networksConfig.dxdToken[network],
    schemes: schemesConfig[network],
    reputation: repHolders,
    permissionRegistryDelay: networksConfig.permissionRegistryDelay[network]
  };
}
