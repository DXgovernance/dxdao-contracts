const fs = require('fs');
require('dotenv').config();
const args = process.argv;
const Web3 = require('web3');
const HDWalletProvider = require('truffle-hdwallet-provider')
var moment = require("moment");
const { setupLoader } = require('@openzeppelin/contract-loader');
const constants = require("../test/helpers/constants");
const { encodePermission } = require("../test/helpers/permissions");
const repHolders = require('../.repHolders.json');

// Get initial REP holders
let founders = [], initialRep = [], initialTokens = [];
for (var address in repHolders.addresses) {
  founders.push(address);
  initialRep.push(repHolders.addresses[address]);
  initialTokens.push(0);
}

// Token Addresses to be used
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const GEN_TOKEN = "0x543Ff227F64Aa17eA132Bf9886cAb5DB55DCAddf";
const DXD_TOKEN = "0xDd25BaE0659fC06a8d00CD06C7f5A98D71bfB715";

// DXdao ORG parameters:
const orgName = "DXdao";
const tokenName = "DXDNative";
const tokenSymbol = "DXDN";

// Get network to use from arguments
let network, mnemonic, httpProviderUrl, web3;
for (var i = 0; i < args.length; i++) {
  if (args[i] == '--network')
    network = args[i+1];
}
if (!network) throw('Not network selected, --network parameter missing');

mnemonic = process.env.KEY_MNEMONIC;
httpProviderUrl = 'http://localhost:8545';

// Get development keys
if (network != 'develop') {
  infuraApiKey = process.env.KEY_INFURA_API_KEY;
  httpProviderUrl = `https://${network}.infura.io/v3/${infuraApiKey }`
} 

console.log('Running deploy on', httpProviderUrl)
const provider = new HDWalletProvider(mnemonic, new Web3.providers.HttpProvider(httpProviderUrl), 0, 10);
web3 = new Web3(provider);

let outputFile = { network };

// Deploy test organization with the following schemes:
// WalletScheme with all permissions that uses DXDVotingMachine
// WalletScheme with no permissions for quick decisions  that uses DXDVotingMachine
// SchemeRegistrar that can register schemes, upgrade controller and set constraints that uses GenesisProtocol
// ContributionReward scheme that can only execute generic calls that uses GenesisProtocol
async function main() {
  
  // Load contracts from artifacts
  const accounts = await web3.eth.getAccounts();
  const contractLoader = setupLoader({
    provider: web3, defaultSender: accounts[0], defaultGas: constants.ARC_GAS_LIMIT
  }).truffle;
  outputFile.deployerAccount = accounts[0];

  var DxToken = contractLoader.fromArtifact("DxToken");
  var DxAvatar = contractLoader.fromArtifact("DxAvatar");
  var DxReputation = contractLoader.fromArtifact("DxReputation");
  var DxController = contractLoader.fromArtifact("DxController");
  var DaoCreator = contractLoader.fromArtifact("DaoCreator");
  var WalletScheme = contractLoader.fromArtifact("WalletScheme");
  var ContributionReward = contractLoader.fromArtifact("ContributionReward");
  var SchemeRegistrar = contractLoader.fromArtifact("SchemeRegistrar");
  var GenesisProtocol = contractLoader.fromArtifact("GenesisProtocol");
  var DXDVotingMachine = contractLoader.fromArtifact("DXDVotingMachine");
  var DxControllerCreator = contractLoader.fromArtifact("DxControllerCreator");

  // Deploy and mint reputation
  console.log('Deploying DxReputation...');
  var dxReputation = await DxReputation.new();
  var addressesMints = [], amountMints = [];  
  while (founders.length > 0){
    addressesMints.push(founders.splice(0, 100));
    amountMints.push(initialRep.splice(0, 100));
  }
  for (var i = 0; i < addressesMints.length; i++){
    console.log('Doint mint '+i+' of '+(addressesMints.length-1)+' of initial REP minting...')
    await dxReputation.mintMultiple(addressesMints[i], amountMints[i]);
  }
  
  // Deploy empty token
  console.log('Deploying DxToken...');
  var dxToken = await DxToken.new(tokenName, tokenSymbol, 0, {gas: constants.ARC_GAS_LIMIT});

  // Deploy Avatar
  console.log('Deploying DxAvatar...');
  var dxAvatar = await DxAvatar.new(orgName, dxReputation.address, dxToken.address, {gas: constants.ARC_GAS_LIMIT});

  // Deploy controller and transfer avatar to controller
  console.log('Deploying DxController...');
  var dxController = await DxController.new(dxAvatar.address,{gas: constants.ARC_GAS_LIMIT});
  await dxAvatar.transferOwnership(dxController.address);
  
  // Deploy GenesisProtocol and DXDVotingMachine:
  console.log('Deploying GenesisProtocol...');
  var genesisProtocol = await GenesisProtocol.new( GEN_TOKEN, {gas: constants.ARC_GAS_LIMIT});
  console.log('Deploying DXDVotingMachine...');
  var dxdVotingMachine = await DXDVotingMachine.new(DXD_TOKEN, {gas: constants.ARC_GAS_LIMIT});
  
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
  console.log('Deploying MasterWalletScheme...');
  var masterWalletScheme = await WalletScheme.new();
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
  console.log('Deploying QuickWalletScheme...');
  var quickWalletScheme = await WalletScheme.new();
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
  console.log('Deploying ContributionReward...');
  const contributionReward = await ContributionReward.new();
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
  console.log('Deploying SchemeRegitrar...');
  var schemeRegistrar = await SchemeRegistrar.new();
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
  console.log('Configurating schemes...');
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
  
  outputFile.addresses = {
    "dxReputation": dxReputation.address,
    "dxController": dxController.address,
    "dxToken": dxToken.address,
    "dxAvatar": dxAvatar.address,
    "dxdVotingMachine": dxdVotingMachine.address,
    "genesisProtocol": genesisProtocol.address,
    "contributionReward": contributionReward.address,
    "schemeRegistrar": schemeRegistrar.address,
    "masterWalletScheme": masterWalletScheme.address,
    "quickWalletScheme": quickWalletScheme.address
  };
  console.log('Contracts deployed:', outputFile.addresses);
  
  fs.writeFileSync('.contracts.json', JSON.stringify(outputFile, null, 2), {encoding:'utf8',flag:'w'})
  console.log('===============================================');
} 

Promise.all([main()]).then(process.exit);
