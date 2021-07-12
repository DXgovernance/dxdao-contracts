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
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async function waitBlocks(blocks) {
    const toBlock = (await web3.eth.getBlock('latest')).number + blocks;
    while ((await web3.eth.getBlock('latest')).number < toBlock){
      console.log("Waiting to block", toBlock, "...")
      await sleep(3000);
    }
    return;
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
    contractsFile[networkName] = { 
      fromBlock: 0,
      avatar: null,
      reputation: null,
      token: null,
      controller: null,
      permissionRegistry: null,
      schemes: {},
      utils: {},
      votingMachines: {
        dxd: {}
      }
    };
    
  if ((networkName == "arbitrumTestnet") || (networkName == "arbitrum")) {
    hre.network.provider = wrapProvider(new HDWalletProvider(hre.network.config.accounts.mnemonic, hre.network.config.url))
  }

  const accounts = await web3.eth.getAccounts();
  const fromBlock = (await web3.eth.getBlock('latest')).number;

  // Deploy Multicall
  let multicall;
  if (contractsFile[networkName].utils.multicall) {
    console.log('Using Multicall already deployed on', contractsFile[networkName].utils.multicall);
    multicall = await Multicall.at(contractsFile[networkName].utils.multicall);
  } else {
    console.log('Deploying Multicall...');
    multicall = await Multicall.new();
    console.log("Multicall deployed to:", multicall.address);
    await waitBlocks(1);
  }
  contractsFile[networkName].utils.multicall = multicall.address;
  saveContractsFile(contractsFile);
  

  // Deploy and mint reputation
  let dxReputation;
  if (contractsFile[networkName].reputation) {
    console.log('Using DxReputation already deployed on', contractsFile[networkName].reputation);
    dxReputation = await DxReputation.at(contractsFile[networkName].reputation);
  } else {
    console.log('Deploying DxReputation...');
    dxReputation = await DxReputation.new();
    console.log("DX Reputation deployed to:", dxReputation.address);
    await waitBlocks(1);

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
        await waitBlocks(1);
      }
    }
    contractsFile[networkName].fromBlock = fromBlock;
    contractsFile[networkName].reputation = dxReputation.address;
    saveContractsFile(contractsFile);
  }
  
  // Deploy DXD
  let votingMachineToken;
  if (!deploymentConfig.votingMachineToken) {
      console.log("Creating new voting machine token...");
      votingMachineToken = await ERC20Mock.new(accounts[0], web3.utils.toWei('101000000'));
      console.log("Voting machine token deployed to:", votingMachineToken.address);
  } else {
    votingMachineToken = await ERC20Mock.at(deploymentConfig.votingMachineToken.address);
    contractsFile[networkName].fromBlock = Math.min(fromBlock, deploymentConfig.votingMachineToken.fromBlock);
    console.log("Using pre configured voting machine token:", votingMachineToken.address);
  }
  contractsFile[networkName].votingMachines.dxd.token = votingMachineToken.address;
  saveContractsFile(contractsFile);
  
  // Deploy DXAvatar
  let dxAvatar;
  if (contractsFile[networkName].avatar) {
    console.log('Using DxAvatar already deployed on', contractsFile[networkName].avatar);
    dxAvatar = await DxAvatar.at(contractsFile[networkName].avatar);
  } else {
    console.log('Deploying DxAvatar...',votingMachineToken.address, dxReputation.address);
    dxAvatar = await DxAvatar.new("DXdao", votingMachineToken.address, dxReputation.address);
    if (await votingMachineToken.balanceOf(accounts[0]) > web3.utils.toWei('100000000'))
      await votingMachineToken.transfer(dxAvatar.address, web3.utils.toWei('100000000'));
    console.log("DXdao Avatar deployed to:", dxAvatar.address);
    contractsFile[networkName].avatar = dxAvatar.address;
    contractsFile[networkName].token = votingMachineToken.address;
    saveContractsFile(contractsFile);
    await waitBlocks(1);
  }
  
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
    await waitBlocks(1);
  }
  
  // Deploy DXDVotingMachine
  let votingMachine;
  if (contractsFile[networkName].votingMachines.dxd.address) {
    console.log('Using DXDVotingMachine already deployed on', contractsFile[networkName].votingMachines.dxd.address);
    votingMachine = await DXDVotingMachine.at(contractsFile[networkName].votingMachines.dxd.address);
  } else {
    console.log('Deploying DXDVotingMachine...');
    votingMachine = await DXDVotingMachine.new(votingMachineToken.address);
    console.log("DXDVotingMachine deployed to:", votingMachine.address);
    contractsFile[networkName].votingMachines.dxd.address = votingMachine.address;
    contractsFile[networkName].votingMachines.dxd.token = votingMachineToken.address;
    saveContractsFile(contractsFile);
  }
  await waitBlocks(1);
  
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
    const notAllowedControllerFunctions = [
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
    ];
    for (var i = 0; i < notAllowedControllerFunctions.length; i++) {
      await permissionRegistry.setAdminPermission(
        NULL_ADDRESS, 
        dxAvatar.address, 
        dxController.address, 
        notAllowedControllerFunctions[i],
        MAX_UINT_256, 
        false
      );
    }
    
    await permissionRegistry.setAdminPermission(
      NULL_ADDRESS,
      dxAvatar.address,
      dxController.address,
      ANY_FUNC_SIGNATURE,
      0,
      true
    );
    
    console.log("Permission Registry deployed to:", permissionRegistry.address);
    contractsFile[networkName].permissionRegistry = permissionRegistry.address;
    saveContractsFile(contractsFile);
  }
  await waitBlocks(1);
  
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
      
      await waitBlocks(1);
      
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
        schemeConfiguration.maxRepPercentageChange
      );
      
      console.log("Setting scheme permissions...");
      await Promise.all(schemeConfiguration.permissions.map(async (permission) => {
        await permissionRegistry.setAdminPermission(
          permission.asset, 
          schemeConfiguration.callToController ? dxController.address : newScheme.address,
          permission.to == "SCHEME" ? newScheme.address : permission.to,
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
  if (!contractsFile[networkName].utils.dxdaoNFT) {
    console.log("Deploying DXdaoNFT...");
    dxDaoNFT = await DXdaoNFT.new();
    contractsFile[networkName].utils.dxDaoNFT = dxDaoNFT.address;
  } else {
    console.log("Using DXdaoNFT deployed on", contractsFile[networkName].utils.dxDaoNFT);
  }
  saveContractsFile(contractsFile);

  // Deploy DXDVestingFactory if it is not set
  let dxdVestingFactory;
  if (!contractsFile[networkName].utils.dxdVestingFactory) {
    console.log("Deploying DXDVestingFactory...");
    dxdVestingFactory = await DXDVestingFactory.new(contractsFile[networkName].votingMachines.dxd.token);
    contractsFile[networkName].utils.dxdVestingFactory = dxdVestingFactory.address;
  } else {
    console.log("Using DXDVestingFactory deployed on", contractsFile[networkName].utils.dxdVestingFactory);
  }
  saveContractsFile(contractsFile);
  

  // Transfer all ownership and power to the dao
  console.log("Transfering ownership...");
  try {
    // Set the permission delay in the permission registry
    await permissionRegistry.setTimeDelay(deploymentConfig.permissionRegistryDelay);
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
      address: votingMachineToken.address,
      contract: `${ERC20Mock._hArtifact.sourceName}:${ERC20Mock._hArtifact.contractName}`,
      constructorArguments: ["DXD", "DXdao", 18],
    });
    console.error("DxToken verified", votingMachineToken.address);
  } catch(e) {
    console.error("Couldnt verify DxToken", votingMachineToken.address);
  }
  try {
    await hre.run("verify:verify", {
      address: dxAvatar.address,
      contract: `${DxAvatar._hArtifact.sourceName}:${DxAvatar._hArtifact.contractName}`,
      constructorArguments: ["DXdao", dxReputation.address, votingMachineToken.address],
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
      constructorArguments: [contractsFile[networkName].votingMachines.dxd.token],
    });
    console.error("DXDVotingMachine verified", votingMachine.address);
  } catch(e) {
    console.error("Couldnt verify DXDVotingMachine", votingMachine.address);
  }
  try {
    await hre.run("verify:verify", {
      address: permissionRegistry.address,
      contract: `${PermissionRegistry._hArtifact.sourceName}:${PermissionRegistry._hArtifact.contractName}`,
      constructorArguments: [accounts[0], 1],
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
  
  try {
    await hre.run("verify:verify", {
      address: contractsFile[networkName].utils.dxDaoNFT,
      contract: `${DXdaoNFT._hArtifact.sourceName}:${DXdaoNFT._hArtifact.contractName}`,
      constructorArguments: [],
    });
    console.error("DXdaoNFT verified", contractsFile[networkName].utils.dxDaoNFT);
  } catch(e) {
    console.error("Couldnt verify DXdaoNFT", contractsFile[networkName].utils.dxDaoNFT);
  }
  
  try {
    await hre.run("verify:verify", {
      address: contractsFile[networkName].utils.dxdVestingFactory,
      contract: `${DXDVestingFactory._hArtifact.sourceName}:${DXDVestingFactory._hArtifact.contractName}`,
      constructorArguments: [contractsFile[networkName].votingMachines.dxd.token],
    });
    console.error("DXDVestingFactory verified", contractsFile[networkName].utils.dxdVestingFactory);
  } catch(e) {
    console.error("Couldnt verify DXDVestingFactory", contractsFile[networkName].utils.dxdVestingFactory);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
