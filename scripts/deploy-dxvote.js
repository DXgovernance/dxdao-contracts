const hre = require("hardhat");
const fs = require("fs");
const web3 = hre.web3;
var moment = require("moment");
const { encodePermission } = require("../test/helpers/permissions");
const repHolders = require('../.repHolders.json');

// Get initial REP holders
let founders = [], initialRep = [], initialTokens = [];
for (var address in repHolders.addresses) {
  founders.push(address);
  initialRep.push(repHolders.addresses[address]);
  initialTokens.push(0);
}

const DXD_TOKEN = "0xa700BdAba48A3D96219247111B0b708Dc0b51033";

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT_256 = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ANY_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

// Import Contracts
const DxToken = artifacts.require("DxToken");
const DxAvatar = artifacts.require("DxAvatar");
const DxReputation = artifacts.require("DxReputation");
const DxController = artifacts.require("DxController");
const WalletScheme = artifacts.require("WalletScheme");
const PermissionRegistry = artifacts.require("PermissionRegistry");
const DXDVotingMachine = artifacts.require("DXDVotingMachine");

async function main() {

  const accounts = await web3.eth.getAccounts();
  
  // Deploy and mint reputation
  console.log(`${DxReputation._hArtifact.sourceName}:${DxReputation._hArtifact.contractName}`)
  console.log('Deploying DxReputation...');
  var dxReputation = await DxReputation.new();
  console.log("DX Reputation deployed to:", dxReputation.address);

  var addressesMints = [], amountMints = [];  
  while (founders.length > 0){
    addressesMints.push(founders.splice(0, 100));
    amountMints.push(initialRep.splice(0, 100));
  }
  for (var i = 0; i < addressesMints.length; i++){
    console.log('Doint mint '+i+' of '+(addressesMints.length-1)+' of initial REP minting...')
    await dxReputation.mintMultiple(addressesMints[i], amountMints[i], { gas: 9000000 });
  }
    
  // Deploy DXtoken
  console.log('Deploying DXtoken...');
  var dxToken = await DxToken.new("", "", 0);
  console.log("DX Token (useless token just used for deployment) deployed to:", dxToken.address);

  
  // Deploy DXAvatar
  console.log('Deploying DxAvatar...');
  var dxAvatar = await DxAvatar.new("DXdao", dxReputation.address, dxToken.address);
  console.log("DXdao Avatar deployed to:", dxAvatar.address);

  
  // Deploy DXcontroller and transfer avatar to controller
  console.log('Deploying DxController...');
  var dxController = await DxController.new(dxAvatar.address);
  console.log("DXdao Controller deployed to:", dxController.address);
  await dxAvatar.transferOwnership(dxController.address);
  await dxReputation.transferOwnership(dxController.address);

  
  // Deploy DXDVotingMachine
  console.log('Deploying DXDVotingMachine...');
  var dxdVotingMachine = await DXDVotingMachine.new(DXD_TOKEN);
  console.log("DXDVotingMachine deployed to:", dxdVotingMachine.address);

  
  async function encodeParameters(parameters) {
    return await dxdVotingMachine.getParametersHash(
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
  
  async function setDXDVotingMachineParameters(parameters) {
    return await dxdVotingMachine.setParameters(
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
  
  // Deploy PermissionRegistry
  console.log('Deploying PermissionRegistry...');
  var permissionRegistry = await PermissionRegistry.new(
    accounts[0], moment.duration(1, 'hours').asSeconds(), { gas: 1000000 }
  );
  console.log("Permission Registry deployed to:", permissionRegistry.address);

  
  // Deploy MasterWalletScheme:
  console.log('Deploying MasterWalletScheme...');
  var masterWalletScheme = await WalletScheme.new();
  console.log("WalletScheme deployed to:", masterWalletScheme.address);

  
  const masterWalletSchemeParams = {
    queuedVoteRequiredPercentage: 50, 
    queuedVotePeriodLimit: moment.duration(1, 'hours').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(15, 'minutes').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(15, 'minutes').asSeconds(), 
    thresholdConst: 1500, 
    quietEndingPeriod: moment.duration(10, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 0, 
    minimumDaoBounty: web3.utils.toWei("0.1"),
    daoBountyConst: 2, 
    activationTime: moment().unix(),
    voteOnBehalf: NULL_ADDRESS
  }
  var masterWalletSchemeParamsHash = await encodeParameters(masterWalletSchemeParams);
  await setDXDVotingMachineParameters(masterWalletSchemeParams)
  await masterWalletScheme.initialize(
    dxAvatar.address,
    dxdVotingMachine.address,
    masterWalletSchemeParamsHash,
    dxController.address,
    permissionRegistry.address
  );
  
  // Deploy QuickWalletScheme:
  console.log('Deploying QuickWalletScheme...');
  var quickWalletScheme = await WalletScheme.new();
  console.log("QuickWalletScheme deployed to:", quickWalletScheme.address);

  const quickWalletSchemeParams = {
    queuedVoteRequiredPercentage: 50, 
    queuedVotePeriodLimit: moment.duration(30, 'minutes').asSeconds(), 
    boostedVotePeriodLimit: moment.duration(10, 'minutes').asSeconds(), 
    preBoostedVotePeriodLimit: moment.duration(5, 'minutes').asSeconds(), 
    thresholdConst: 1100, 
    quietEndingPeriod: moment.duration(5, 'minutes').asSeconds(), 
    proposingRepReward: 0, 
    votersReputationLossRatio: 0, 
    minimumDaoBounty: web3.utils.toWei("0.05"),
    daoBountyConst: 2, 
    activationTime: moment().unix(),
    voteOnBehalf: NULL_ADDRESS
  };
  var quickWalletSchemeParamsHash = await encodeParameters(quickWalletSchemeParams);
  await setDXDVotingMachineParameters(quickWalletSchemeParams)
  await quickWalletScheme.initialize(
    dxAvatar.address,
    dxdVotingMachine.address,
    quickWalletSchemeParamsHash,
    NULL_ADDRESS,
    permissionRegistry.address
  );
  
  console.log("Setting permissions...");
  // Allows any function to be executed from the dxdao to any address with a max value of 5 ETH
  await permissionRegistry.setAdminPermission(
    NULL_ADDRESS, 
    dxAvatar.address, 
    ANY_ADDRESS, 
    ANY_FUNC_SIGNATURE,
    web3.utils.toWei("5"),
    true
  );
  
  // Allows the avatar to send any amount of funds to the quick wallet
  await permissionRegistry.setAdminPermission(
    NULL_ADDRESS, 
    dxAvatar.address, 
    quickWalletScheme.address, 
    ANY_FUNC_SIGNATURE,
    MAX_UINT_256,
    true
  );

  // Allows any function to be executed from quick wallet scheme
  await permissionRegistry.setAdminPermission(
    NULL_ADDRESS, 
    quickWalletScheme.address, 
    ANY_ADDRESS, 
    ANY_FUNC_SIGNATURE,
    MAX_UINT_256,
    true
  );
  
  console.log("Transfering ownership...");
  // Transfer permission registry ownership to dxdao
  await permissionRegistry.transferOwnership(dxAvatar.address);
  
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

  await dxController.unregisterScheme(accounts[0], dxAvatar.address);
  
  const outputFile = JSON.parse(fs.readFileSync('.contracts.json'));
  
  outputFile[hre.network.name] = {
    "dxReputation": dxReputation.address,
    "dxController": dxController.address,
    "dxToken": dxToken.address,
    "dxAvatar": dxAvatar.address,
    "DXDVotingMachine": dxdVotingMachine.address,
    "masterWalletScheme": masterWalletScheme.address,
    "quickWalletScheme": quickWalletScheme.address,
    "permissionRegistry": permissionRegistry.address
  };
  console.log('Contracts deployed:', outputFile);
  
  fs.writeFileSync('.contracts.json', JSON.stringify(outputFile, null, 2), {encoding:'utf8',flag:'w'});
  
  console.log("Verifying contracts...");
  await hre.run("verify:verify", {
    address: dxReputation.address,
    contract: `${DxReputation._hArtifact.sourceName}:${DxReputation._hArtifact.contractName}`,
    constructorArguments: [],
  })
  await hre.run("verify:verify", {
    address: dxToken.address,
    contract: `${DxToken._hArtifact.sourceName}:${DxToken._hArtifact.contractName}`,
    constructorArguments: ["", "", 0],
  })
  await hre.run("verify:verify", {
    address: dxAvatar.address,
    contract: `${DxAvatar._hArtifact.sourceName}:${DxAvatar._hArtifact.contractName}`,
    constructorArguments: ["DXdao", dxReputation.address, dxToken.address],
  })
  await hre.run("verify:verify", {
    address: dxController.address,
    contract: `${DxController._hArtifact.sourceName}:${DxController._hArtifact.contractName}`,
    constructorArguments: [dxAvatar.address],
  })
  await hre.run("verify:verify", {
    address: dxdVotingMachine.address,
    contract: `${DXDVotingMachine._hArtifact.sourceName}:${DXDVotingMachine._hArtifact.contractName}`,
    constructorArguments: [DXD_TOKEN],
  })
  await hre.run("verify:verify", {
    address: permissionRegistry.address,
    contract: `${PermissionRegistry._hArtifact.sourceName}:${PermissionRegistry._hArtifact.contractName}`,
    constructorArguments: [accounts[0], moment.duration(1, 'hours').asSeconds()],
  })
  await hre.run("verify:verify", {
    address: masterWalletScheme.address,
    contract: `${WalletScheme._hArtifact.sourceName}:${WalletScheme._hArtifact.contractName}`,
    constructorArguments: [],
  })
  await hre.run("verify:verify", {
    address: quickWalletScheme.address,
    contract: `${WalletScheme._hArtifact.sourceName}:${WalletScheme._hArtifact.contractName}`,
    constructorArguments: [],
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
