const hre = require("hardhat");
const fs = require("fs");
const web3 = hre.web3;
let moment = require("moment");
const { encodePermission } = require("../test/helpers/permissions");
const repHolders = require('../.repHolders.json');
const wrapProvider = require('arb-ethers-web3-bridge').wrapProvider;
const HDWalletProvider = require('@truffle/hdwallet-provider');
const { getDeploymentConfig } = require("./deployment-config.js")

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
const ERC20Mock = artifacts.require("ERC20Mock");
const Multicall = artifacts.require("Multicall");
const DXdaoNFT = artifacts.require("DXdaoNFT");
const DXDVestingFactory = artifacts.require("DXDVestingFactory");

async function main() {
  
  const contractsFile = fs.existsSync('.contracts.json') ? JSON.parse(fs.readFileSync('.contracts.json')) : {};
  const networkName = hre.network.name;
  
  function sleep(ms) {
    if (networkName != "hardhat")
      return new Promise(resolve => setTimeout(resolve, ms));
    else return;
  }
  
  function saveContractsFile(contractsFile) {
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
    else return;
  }
  
  const deploymentConfig = getDeploymentConfig(networkName);
  
  // Get initial REP holders
  let founders = [], initialRep = [], initialTokens = [];
  for (let address in deploymentConfig.reputation.addresses) {
    founders.push(address);
    initialRep.push(deploymentConfig.reputation.addresses[address]);
    initialTokens.push(0);
  }
  
  if (!contractsFile[networkName] || networkName == 'hardhat') 
    contractsFile[networkName] = { schemes: {} };
    
  if ((networkName == "arbitrumTestnet") || (networkName == "arbitrum")) {
    hre.network.provider = wrapProvider(new HDWalletProvider(hre.network.config.accounts.mnemonic, hre.network.config.url))
  }

  const accounts = await web3.eth.getAccounts();
  const fromBlock = (await web3.eth.getBlock('latest')).number;

  // Deploy Multicall
  let multicall;
  if (contractsFile[networkName].multicall) {
    console.log('Using Multicall already deployed on', contractsFile[networkName].multicall);
    multicall = await Multicall.at(contractsFile[networkName].multicall);
  } else {
    console.log('Deploying Multicall...');
    multicall = await Multicall.new();
    console.log("Multicall deployed to:", multicall.address);
    contractsFile[networkName].multicall = multicall.address;
    saveContractsFile(contractsFile);
  }
  
  // Deploy and mint reputation
  let dxReputation;
  if (contractsFile[networkName].reputation) {
    console.log('Using DxReputation already deployed on', contractsFile[networkName].reputation);
    dxReputation = await DxReputation.at(contractsFile[networkName].reputation);
  } else {
    console.log('Deploying DxReputation...');
    dxReputation = await DxReputation.new();
    console.log("DX Reputation deployed to:", dxReputation.address);
    await sleep(30000);

    let addressesMints = [], amountMints = []; 
    if (networkName == "arbitrumTestnet" || networkName == "arbitrum" ) {
      console.log('Doing mint of '+(founders.length)+' initial REP holders...')
      await dxReputation.mintMultiple(founders, initialRep);
    } else {
      while (founders.length > 0){
        addressesMints.push(founders.splice(0, 100));
        amountMints.push(initialRep.splice(0, 100));
      }
      for (let i = 0; i < addressesMints.length; i++){
        console.log('Doing mint '+i+' of '+(addressesMints.length-1)+' of initial REP minting...')
        await dxReputation.mintMultiple(addressesMints[i], amountMints[i]);
        await sleep(30000);
      }
    }
    contractsFile[networkName].fromBlock = fromBlock;
    contractsFile[networkName].reputation = dxReputation.address;
    saveContractsFile(contractsFile);
  }
    
  // Deploy DXtoken
  let dxToken;
  if (contractsFile[networkName].token) {
    console.log('Using DXToken already deployed on', contractsFile[networkName].token);
    dxToken = await DxToken.at(contractsFile[networkName].token);
  } else {
    console.log('Deploying DXtoken...');
    dxToken = await DxToken.new("", "", 0);
    console.log("DXToken (useless token just used for deployment) deployed to:", dxToken.address);
    contractsFile[networkName].token = dxToken.address;
    saveContractsFile(contractsFile);
  }
  await sleep(30000);
  
  // Deploy DXAvatar
  let dxAvatar;
  if (contractsFile[networkName].avatar) {
    console.log('Using DxAvatar already deployed on', contractsFile[networkName].avatar);
    dxAvatar = await DxAvatar.at(contractsFile[networkName].avatar);
  } else {
    console.log('Deploying DxAvatar...',dxToken.address, dxReputation.address);
    dxAvatar = await DxAvatar.new("DXdao", dxToken.address, dxReputation.address);
    console.log("DXdao Avatar deployed to:", dxAvatar.address);
    contractsFile[networkName].avatar = dxAvatar.address;
    saveContractsFile(contractsFile);
  }
  await sleep(30000);
  
  // Deploy DXcontroller and transfer avatar to controller
  let dxController;
  if (contractsFile[networkName].controller) {
    console.log('Using DxController already deployed on', contractsFile[networkName].controller);
    dxController = await DxController.at(contractsFile[networkName].controller);
  } else {
    console.log('Deploying DxController...');
    dxController = await DxController.new(dxAvatar.address);
    console.log("DXdao Controller deployed to:", dxController.address);
    await dxAvatar.transferOwnership(dxController.address);
    await dxReputation.transferOwnership(dxController.address);
    contractsFile[networkName].controller = dxController.address;
    saveContractsFile(contractsFile);
  }
  await sleep(30000);
  
  // Deploy DXDVotingMachine
  let votingMachine;
  if (contractsFile[networkName].votingMachine) {
    console.log('Using DXDVotingMachine already deployed on', contractsFile[networkName].votingMachine);
    votingMachine = await DXDVotingMachine.at(contractsFile[networkName].votingMachine);
  } else {
    
    let votingMachineTokenAddress;
    if (!deploymentConfig.votingMachineToken) {
        console.log("Creating new voting machine token...");
        const newVotingMachineToken = await ERC20Mock.new(accounts[0], web3.utils.toWei('101000000'));
        await newVotingMachineToken.transfer(dxAvatar.address, web3.utils.toWei('100000000'));
        votingMachineTokenAddress = newVotingMachineToken.address;
        console.log("Voting machine token deployed to:", votingMachineTokenAddress);
    } else {
      votingMachineTokenAddress = deploymentConfig.votingMachineToken;
      contractsFile[networkName].fromBlock = Math.min(fromBlock, deploymentConfig.votingMachineToken.fromBlock);
      console.log("Using pre configured voting machine token:", votingMachineTokenAddress);
    }
    
    console.log('Deploying DXDVotingMachine...');
    votingMachine = await DXDVotingMachine.new(votingMachineTokenAddress);
    console.log("DXDVotingMachine deployed to:", votingMachine.address);
    contractsFile[networkName].votingMachine = votingMachine.address;
    contractsFile[networkName].votingMachineToken = votingMachineTokenAddress;
    saveContractsFile(contractsFile);
  
  }
  await sleep(30000);
  
  // Deploy PermissionRegistry
  let permissionRegistry;
  if (contractsFile[networkName].permissionRegistry) {
    console.log('Using PermissionRegistry already deployed on', contractsFile[networkName].permissionRegistry);
    permissionRegistry = await PermissionRegistry.at(contractsFile[networkName].permissionRegistry);
  } else {
    console.log('Deploying PermissionRegistry...');
    permissionRegistry = await PermissionRegistry.new(accounts[0], 1);

    // Only allow the functions mintReputation, burnReputation, genericCall, registerScheme and unregisterScheme to be
    // called to in the controller contract from a scheme that calls the controller.
    // This permissions makes the other functions inaccessible
    await Promise.all([
      dxController.contract._jsonInterface.find(method => method.name == 'mintTokens').signature,
      dxController.contract._jsonInterface.find(method => method.name == 'unregisterSelf').signature,
      dxController.contract._jsonInterface.find(method => method.name == 'addGlobalConstraint').signature,
      dxController.contract._jsonInterface.find(method => method.name == 'removeGlobalConstraint').signature,
      dxController.contract._jsonInterface.find(method => method.name == 'upgradeController').signature,
      dxController.contract._jsonInterface.find(method => method.name == 'sendEther').signature,
      dxController.contract._jsonInterface.find(method => method.name == 'externalTokenTransfer').signature,
      dxController.contract._jsonInterface.find(method => method.name == 'externalTokenTransferFrom').signature,
      dxController.contract._jsonInterface.find(method => method.name == 'externalTokenApproval').signature,
      dxController.contract._jsonInterface.find(method => method.name == 'metaData').signature
    ].map(async (funcSignature) => {
      await permissionRegistry.setAdminPermission(
        NULL_ADDRESS, 
        dxAvatar.address, 
        dxController.address, 
        funcSignature,
        MAX_UINT_256, 
        false
      );
    }));
    
    // Set the permission delay in the permission registry
    await permissionRegistry.setTimeDelay(deploymentConfig.permissionRegistryDelay);
    
    console.log("Permission Registry deployed to:", permissionRegistry.address);
    contractsFile[networkName].permissionRegistry = permissionRegistry.address;
    saveContractsFile(contractsFile);
  }
  await sleep(30000);
  
  // Deploy Schemes
  for (var i = 0; i < deploymentConfig.schemes.length; i++) {
    const schemeConfiguration = deploymentConfig.schemes[i];
    
    if (contractsFile[networkName].schemes[schemeConfiguration.name]) {
      console.log(`Using ${schemeConfiguration.name} already deployed on ${contractsFile[networkName].schemes[schemeConfiguration.name].address}`);
      masterWalletScheme = await WalletScheme.at(contractsFile[networkName].schemes[schemeConfiguration.name].address);
    } else {
      
      console.log(`Deploying ${schemeConfiguration.name}...`);
      const newScheme = await WalletScheme.new();
      console.log(`${schemeConfiguration.name} deployed to: ${newScheme.address}`);
      
      await sleep(30000);
      
      const timeNow = moment().unix();
      let schemeParamsHash = await votingMachine.getParametersHash(
        [
          schemeConfiguration.queuedVoteRequiredPercentage,
          schemeConfiguration.queuedVotePeriodLimit,
          schemeConfiguration.boostedVotePeriodLimit,
          schemeConfiguration.preBoostedVotePeriodLimit,
          schemeConfiguration.thresholdConst,
          schemeConfiguration.quietEndingPeriod,
          schemeConfiguration.proposingRepReward,
          schemeConfiguration.votersReputationLossRatio,
          schemeConfiguration.minimumDaoBounty,
          schemeConfiguration.daoBountyConst,
          timeNow,
        ], NULL_ADDRESS
      );

      await votingMachine.setParameters(
        [
          schemeConfiguration.queuedVoteRequiredPercentage,
          schemeConfiguration.queuedVotePeriodLimit,
          schemeConfiguration.boostedVotePeriodLimit,
          schemeConfiguration.preBoostedVotePeriodLimit,
          schemeConfiguration.thresholdConst,
          schemeConfiguration.quietEndingPeriod,
          schemeConfiguration.proposingRepReward,
          schemeConfiguration.votersReputationLossRatio,
          schemeConfiguration.minimumDaoBounty,
          schemeConfiguration.daoBountyConst,
          timeNow,
        ], NULL_ADDRESS
      );
      
      console.log("Initializing scheme...");
      await newScheme.initialize(
        dxAvatar.address,
        votingMachine.address,
        schemeParamsHash,
        schemeConfiguration.callToController ? dxController.address : NULL_ADDRESS,
        permissionRegistry.address,
        schemeConfiguration.name,
        Math.max(86400, schemeConfiguration.maxSecondsForExecution),
        schemeConfiguration.maxRepPercentageToMint
      );
      
      console.log("Setting scheme permissions...");
      await Promise.all(schemeConfiguration.permissions.map(async (permission) => {
        await permissionRegistry.setAdminPermission(
          permission.asset, 
          schemeConfiguration.callToController ? dxController.address : newScheme.address,
          permission.to, 
          permission.functionSignature,
          permission.value,
          permission.allowed
        );
      }))
      
      console.log('Registering scheme in controller...');
      await dxController.registerScheme(
        newScheme.address,
        schemeParamsHash,
        encodePermission(schemeConfiguration.controllerPermissions),
        dxAvatar.address
      );
      
      if (schemeConfiguration.boostedVoteRequiredPercentage > 0){
        console.log('Setting boosted vote required percentage in voting machine...');
        await votingMachine.setBoostedVoteRequiredPercentage(
          newScheme.address, schemeParamsHash, schemeConfiguration.boostedVoteRequiredPercentage
        );
      }
      contractsFile[networkName].schemes[schemeConfiguration.name] = newScheme.address;
      saveContractsFile(contractsFile);
    }
  }
  
  // Deploy dxDaoNFT if it is not set
  let dxDaoNFT;
  if (!deploymentConfig.dxdaoNFT) {
    console.log("Deploying DXdaoNFT...");
    dxDaoNFT = await DXdaoNFT.new();
    contractsFile[networkName].dxDaoNFT = dxDaoNFT.address;
  } else {
    console.log("Using DXdaoNFT deployed on", deploymentConfig.dxDaoNFT);
    contractsFile[networkName].dxDaoNFT = deploymentConfig.dxDaoNFT;
  }
  
  // Deploy DXDVestingFactory if it is not set
  let dxdVestingFactory;
  if (!deploymentConfig.dxdVestingFactory) {
    console.log("Deploying DXDVestingFactory...");
    dxdVestingFactory = await DXDVestingFactory.new(contractsFile[networkName].votingMachineToken);
    contractsFile[networkName].vestingFactory = dxdVestingFactory.address;
  } else {
    console.log("Using DXDVestingFactory deployed on", deploymentConfig.dxdVestingFactory);
    contractsFile[networkName].vestingFactory = deploymentConfig.dxdVestingFactory;
  }
  
  
  // Transfer all ownership and power to the dao
  console.log("Transfering ownership...");
  try {
    await permissionRegistry.transferOwnership(dxAvatar.address);
    await dxDaoNFT.transferOwnership(dxAvatar.address);
    await dxController.unregisterScheme(accounts[0], dxAvatar.address);
  } catch (e) {
    console.error("Error transfering ownership", e);
    contractsFile[networkName] = {}
    saveContractsFile(contractsFile);
  }
  
  // Deployment Finished
  console.log('Contracts deployed:', contractsFile);
  
  // Verifying smart contracts if possible
  console.log("Verifying contracts...");
  try {
    await hre.run("verify:verify", {
      address: dxReputation.address,
      contract: `${DxReputation._hArtifact.sourceName}:${DxReputation._hArtifact.contractName}`,
      constructorArguments: [],
    });
    console.error("DxReputation verified", dxReputation.address);
  } catch (e) {
    console.error("Couldnt verify DxReputation", dxReputation.address);
  }
  try {
    await hre.run("verify:verify", {
      address: dxToken.address,
      contract: `${DxToken._hArtifact.sourceName}:${DxToken._hArtifact.contractName}`,
      constructorArguments: ["", "", 0],
    });
    console.error("DxToken verified", dxToken.address);
  } catch(e) {
    console.error("Couldnt verify DxToken", dxToken.address);
  }
  try {
    await hre.run("verify:verify", {
      address: dxAvatar.address,
      contract: `${DxAvatar._hArtifact.sourceName}:${DxAvatar._hArtifact.contractName}`,
      constructorArguments: ["DXdao", dxReputation.address, dxToken.address],
    });
    console.error("DxAvatar verified", dxAvatar.address);
  } catch(e) {
    console.error("Couldnt verify DxAvatar", dxAvatar.address);
  }
  try {
    await hre.run("verify:verify", {
      address: dxController.address,
      contract: `${DxController._hArtifact.sourceName}:${DxController._hArtifact.contractName}`,
      constructorArguments: [dxAvatar.address],
    });
    console.error("DxController verified", dxController.address);
  } catch(e) {
    console.error("Couldnt verify DxController", dxController.address);
  }
  try {
    await hre.run("verify:verify", {
      address: votingMachine.address,
      contract: `${DXDVotingMachine._hArtifact.sourceName}:${DXDVotingMachine._hArtifact.contractName}`,
      constructorArguments: [DXD_TOKEN],
    });
    console.error("DXDVotingMachine verified", votingMachine.address);
  } catch(e) {
    console.error("Couldnt verify DXDVotingMachine", votingMachine.address);
  }
  try {
    await hre.run("verify:verify", {
      address: permissionRegistry.address,
      contract: `${PermissionRegistry._hArtifact.sourceName}:${PermissionRegistry._hArtifact.contractName}`,
      constructorArguments: [accounts[0], moment.duration(1, 'hours').asSeconds()],
    });
    console.error("PermissionRegistry verified", permissionRegistry.address);
  } catch(e) {
    console.error("Couldnt verify PermissionRegistry", permissionRegistry.address);
  }
  await Promise.all(Object.keys(contractsFile[networkName].schemes).map(async (schemeAddress) => {
    try {
      await hre.run("verify:verify", {
        address: schemeAddress,
        contract: `${WalletScheme._hArtifact.sourceName}:${WalletScheme._hArtifact.contractName}`,
        constructorArguments: [],
      });
      console.error("WalletScheme verified", schemeAddress);
    } catch(e) {
      console.error("Couldnt verify WalletScheme", schemeAddress);
    }
  }));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
