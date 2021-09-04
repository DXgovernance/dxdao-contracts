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
    arbitrumTestnet: {
      address: "0x5d47100B0854525685907D5D773b92c22c0c745e",
      fromBlock: 87284
    },
    arbitrum: {
      address: "0xC3Ae0333F0F34aa734D5493276223d95B8F9Cb37",
      fromBlock: 100
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
    arbitrumTestnet: moment.duration(1, 'days').asSeconds(),
    arbitrum: moment.duration(1, 'days').asSeconds(),
    xdai: moment.duration(3, 'days').asSeconds(),
    mainnet: moment.duration(7, 'days').asSeconds()
  }
};

const TOKENS = {
  arbitrumTestnet : {
    DXD: "0x5d47100B0854525685907D5D773b92c22c0c745e",
    SWPR: "0xFe45504a21EA46C194000403B43f6DDBA2DCcC80",
    WETH: "0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681"
  }
}

const schemesConfig = {
  hardhat: [{
    name: "RegistrarWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(24, 'hours').asSeconds(),
    maxRepPercentageChange: 0,
    controllerPermissions: {
      canGenericCall: true,
      canUpgrade: true,
      canChangeConstraints: true,
      canRegisterSchemes: true
    },
    permissions: [],
    queuedVoteRequiredPercentage: 75,
    boostedVoteRequiredPercentage: 500,
    queuedVotePeriodLimit: moment.duration(2, 'hours').asSeconds(),
    boostedVotePeriodLimit: moment.duration(45, 'minutes').asSeconds(),
    preBoostedVotePeriodLimit: moment.duration(15, 'minutes').asSeconds(),
    thresholdConst: 2000,
    quietEndingPeriod: moment.duration(15, 'minutes').asSeconds(),
    proposingRepReward: 0,
    votersReputationLossRatio: 100,
    minimumDaoBounty: web3.utils.toWei("100"),
    daoBountyConst: 100,
  },{
    name: "MasterWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(12, 'hours').asSeconds(),
    maxRepPercentageChange: 5,
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
    boostedVoteRequiredPercentage: 100,
    queuedVotePeriodLimit: moment.duration(1, 'hours').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(20, 'minutes').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(10, 'minutes').asSeconds(), 
    thresholdConst: 1500, 
    quietEndingPeriod: moment.duration(10, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 10, 
    minimumDaoBounty: web3.utils.toWei("10"),
    daoBountyConst: 50
  },{
    name: "QuickWalletScheme",
    callToController: false,
    maxSecondsForExecution: moment.duration(12, 'hours').asSeconds(),
    maxRepPercentageChange: 1,
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
    boostedVoteRequiredPercentage: 10,
    queuedVotePeriodLimit: moment.duration(1, 'hours').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(20, 'minutes').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(10, 'minutes').asSeconds(), 
    thresholdConst: 1100, 
    quietEndingPeriod: moment.duration(10, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 1, 
    minimumDaoBounty: web3.utils.toWei("1"),
    daoBountyConst: 25
  }],
  
  rinkeby: [{
    name: "RegistrarWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(24, 'hours').asSeconds(),
    maxRepPercentageChange: 0,
    controllerPermissions: {
      canGenericCall: true,
      canUpgrade: true,
      canChangeConstraints: true,
      canRegisterSchemes: true
    },
    permissions: [],
    queuedVoteRequiredPercentage: 75,
    boostedVoteRequiredPercentage: 500,
    queuedVotePeriodLimit: moment.duration(2, 'hours').asSeconds(),
    boostedVotePeriodLimit: moment.duration(45, 'minutes').asSeconds(),
    preBoostedVotePeriodLimit: moment.duration(15, 'minutes').asSeconds(),
    thresholdConst: 2000,
    quietEndingPeriod: moment.duration(15, 'minutes').asSeconds(),
    proposingRepReward: 0,
    votersReputationLossRatio: 100,
    minimumDaoBounty: web3.utils.toWei("100"),
    daoBountyConst: 100,
  },{
    name: "MasterWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(12, 'hours').asSeconds(),
    maxRepPercentageChange: 5,
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
    boostedVoteRequiredPercentage: 100,
    queuedVotePeriodLimit: moment.duration(1, 'hours').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(20, 'minutes').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(10, 'minutes').asSeconds(), 
    thresholdConst: 1500, 
    quietEndingPeriod: moment.duration(10, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 10, 
    minimumDaoBounty: web3.utils.toWei("10"),
    daoBountyConst: 50
  },{
    name: "QuickWalletScheme",
    callToController: false,
    maxSecondsForExecution: moment.duration(12, 'hours').asSeconds(),
    maxRepPercentageChange: 1,
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
    boostedVoteRequiredPercentage: 10,
    queuedVotePeriodLimit: moment.duration(1, 'hours').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(20, 'minutes').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(10, 'minutes').asSeconds(), 
    thresholdConst: 1100, 
    quietEndingPeriod: moment.duration(10, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 1, 
    minimumDaoBounty: web3.utils.toWei("1"),
    daoBountyConst: 25
  }],
  
  arbitrum: [{
    name: "RegistrarWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(24, 'hours').asSeconds(),
    maxRepPercentageChange: 0,
    controllerPermissions: {
      canGenericCall: true,
      canUpgrade: true,
      canChangeConstraints: true,
      canRegisterSchemes: true
    },
    permissions: [],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 500,
    queuedVotePeriodLimit: moment.duration(14, 'days').asSeconds(),
    boostedVotePeriodLimit: moment.duration(5, 'days').asSeconds(),
    preBoostedVotePeriodLimit: moment.duration(2, 'days').asSeconds(),
    thresholdConst: 2000,
    quietEndingPeriod: moment.duration(1, 'days').asSeconds(),
    proposingRepReward: 0,
    votersReputationLossRatio: 50,
    minimumDaoBounty: web3.utils.toWei("5"),
    daoBountyConst: 10,
  },{
    name: "MasterWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(24, 'hours').asSeconds(),
    maxRepPercentageChange: 5,
    controllerPermissions: {
      canGenericCall: true,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: false
    },
    permissions: [],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 100,
    queuedVotePeriodLimit: moment.duration(14, 'days').asSeconds(),
    boostedVotePeriodLimit: moment.duration(5, 'days').asSeconds(),
    preBoostedVotePeriodLimit: moment.duration(2, 'days').asSeconds(), 
    thresholdConst: 1500, 
    quietEndingPeriod: moment.duration(1, 'days').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 25, 
    minimumDaoBounty: web3.utils.toWei("1"),
    daoBountyConst: 10
  },{
    name: "QuickWalletScheme",
    callToController: false,
    maxSecondsForExecution: moment.duration(24, 'hours').asSeconds(),
    maxRepPercentageChange: 0,
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
    boostedVoteRequiredPercentage: 10,
    queuedVotePeriodLimit: moment.duration(7, 'days').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(3, 'days').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(1, 'days').asSeconds(), 
    thresholdConst: 1100, 
    quietEndingPeriod: moment.duration(12, 'hours').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 10, 
    minimumDaoBounty: web3.utils.toWei("0.1"),
    daoBountyConst: 10
  },{
    name: "SWPRWalletScheme",
    callToController: false,
    maxSecondsForExecution: moment.duration(24, 'hours').asSeconds(),
    maxRepPercentageChange: 0,
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
    boostedVoteRequiredPercentage: 700,
    queuedVotePeriodLimit: moment.duration(7, 'days').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(1, 'days').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(12, 'hours').asSeconds(), 
    thresholdConst: 1300, 
    quietEndingPeriod: moment.duration(12, 'hours').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 10, 
    minimumDaoBounty: web3.utils.toWei("1"),
    daoBountyConst: 10
  }],
  
  arbitrumTestnet: [{
    name: "RegistrarWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(1, 'days').asSeconds(),
    maxRepPercentageChange: 0,
    controllerPermissions: {
      canGenericCall: true,
      canUpgrade: true,
      canChangeConstraints: true,
      canRegisterSchemes: true
    },
    permissions: [],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 10*100,
    queuedVotePeriodLimit: moment.duration(3, 'hours').asSeconds(),
    boostedVotePeriodLimit: moment.duration(2, 'hours').asSeconds(),
    preBoostedVotePeriodLimit: moment.duration(30, 'minutes').asSeconds(),
    thresholdConst: 2000,
    quietEndingPeriod: moment.duration(30, 'minutes').asSeconds(),
    proposingRepReward: 0,
    votersReputationLossRatio: 10,
    minimumDaoBounty: web3.utils.toWei("1"),
    daoBountyConst: 10,
  },{
    name: "QuickWalletScheme",
    callToController: false,
    maxSecondsForExecution: moment.duration(1, 'days').asSeconds(),
    maxRepPercentageChange: 0,
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
    },{
      asset: TOKENS.arbitrumTestnet.DXD,
      to: ANY_ADDRESS,
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.WETH,
      to: ANY_ADDRESS,
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.SWPR,
      to: ANY_ADDRESS,
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    }],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 100,
    queuedVotePeriodLimit: moment.duration(2, 'hours').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(1, 'hours').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(30, 'minutes').asSeconds(), 
    thresholdConst: 1100, 
    quietEndingPeriod: moment.duration(30, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 10, 
    minimumDaoBounty: web3.utils.toWei("0.05"),
    daoBountyConst: 10
  },{
    name: "SWPRWalletScheme",
    callToController: false,
    maxSecondsForExecution: moment.duration(1, 'days').asSeconds(),
    maxRepPercentageChange: 0,
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
    },{
      asset: TOKENS.arbitrumTestnet.DXD,
      to: ANY_ADDRESS,
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.WETH,
      to: ANY_ADDRESS,
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.SWPR,
      to: ANY_ADDRESS,
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    }],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 1000,
    queuedVotePeriodLimit: moment.duration(2, 'hours').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(30, 'hours').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(30, 'minutes').asSeconds(), 
    thresholdConst: 1300, 
    quietEndingPeriod: moment.duration(30, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 10, 
    minimumDaoBounty: web3.utils.toWei("0.1"),
    daoBountyConst: 10
  },{
    name: "MasterWalletScheme",
    callToController: true,
    maxSecondsForExecution: moment.duration(1, 'days').asSeconds(),
    maxRepPercentageChange: 40,
    controllerPermissions: {
      canGenericCall: true,
      canUpgrade: false,
      canChangeConstraints: false,
      canRegisterSchemes: false
    },
    permissions: [{
      asset: NULL_ADDRESS,
      to: "DXDVotingMachine",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: NULL_ADDRESS,
      to: "RegistrarWalletScheme",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: NULL_ADDRESS,
      to: "QuickWalletScheme",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: NULL_ADDRESS,
      to: "SWPRWalletScheme",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.DXD,
      to: "QuickWalletScheme",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.DXD,
      to: "SWPRWalletScheme",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.WETH,
      to: "QuickWalletScheme",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.WETH,
      to: "SWPRWalletScheme",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.SWPR,
      to: "QuickWalletScheme",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    },{
      asset: TOKENS.arbitrumTestnet.SWPR,
      to: "SWPRWalletScheme",
      functionSignature: ANY_FUNC_SIGNATURE,
      value: MAX_UINT_256,
      allowed: true
    }],
    queuedVoteRequiredPercentage: 50,
    boostedVoteRequiredPercentage: 200,
    queuedVotePeriodLimit: moment.duration(3, 'hours').asSeconds(),
    boostedVotePeriodLimit: moment.duration(2, 'hours').asSeconds(),
    preBoostedVotePeriodLimit: moment.duration(30, 'minutes').asSeconds(),
    thresholdConst: 1500,
    quietEndingPeriod: moment.duration(30, 'minutes').asSeconds(),
    proposingRepReward: 0, 
    votersReputationLossRatio: 5, 
    minimumDaoBounty: web3.utils.toWei("0.1"),
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
