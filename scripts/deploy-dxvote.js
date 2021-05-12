const hre = require("hardhat");
const fs = require("fs");
const web3 = hre.web3;
let moment = require("moment");
const { encodePermission } = require("../test/helpers/permissions");
const repHolders = require('../.repHolders.json');
const wrapProvider = require('arb-ethers-web3-bridge').wrapProvider;
const HDWalletProvider = require('@truffle/hdwallet-provider');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get initial REP holders
let founders = [], initialRep = [], initialTokens = [];
for (let address in repHolders.addresses) {
  founders.push(address);
  initialRep.push(repHolders.addresses[address]);
  initialTokens.push(0);
}

const DXD_TOKEN = {
  rinkeby: "0x417A288152A5a13b843135Db5Dc72Ea007a9EB8d",
  xdai: "0xb90D6bec20993Be5d72A5ab353343f7a0281f158",
  mainnet: "0xa1d65E8fB6e87b60FECCBc582F7f97804B725521"
};

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT_256 = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ANY_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

const MASTER_WALLET_SCHEME_PARAMS = {
  queuedVoteRequiredPercentage: 50, 
  queuedVotePeriodLimit: moment.duration(48, 'hours').asSeconds(), 
  boostedVotePeriodLimit: moment.duration(18, 'hours').asSeconds(), 
  preBoostedVotePeriodLimit: moment.duration(6, 'hours').asSeconds(), 
  thresholdConst: 1500, 
  quietEndingPeriod: moment.duration(1, 'hours').asSeconds(), 
  proposingRepReward: 0, 
  votersReputationLossRatio: 0, 
  minimumDaoBounty: web3.utils.toWei("0.1"),
  daoBountyConst: 2, 
  activationTime: moment().unix(),
  voteOnBehalf: NULL_ADDRESS
}

const QUICK_WALLET_SCHEME_PARAMS = {
  queuedVoteRequiredPercentage: 50, 
  queuedVotePeriodLimit: moment.duration(24, 'hours').asSeconds(), 
  boostedVotePeriodLimit: moment.duration(9, 'hours').asSeconds(), 
  preBoostedVotePeriodLimit: moment.duration(3, 'hours').asSeconds(), 
  thresholdConst: 1100, 
  quietEndingPeriod: moment.duration(0.5, 'hours').asSeconds(), 
  proposingRepReward: 0, 
  votersReputationLossRatio: 0, 
  minimumDaoBounty: web3.utils.toWei("0.05"),
  daoBountyConst: 2, 
  activationTime: moment().unix(),
  voteOnBehalf: NULL_ADDRESS
};

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

async function main() {
  
  const contractsFile = JSON.parse(fs.readFileSync('.contracts.json'));
  const networkName = hre.network.name;
  if (!contractsFile[networkName] || networkName == 'hardhat') 
    contractsFile[networkName] = { schemes: {} };
    
  if (networkName == "arbitrum") {
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
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
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

    let addressesMints = [], amountMints = []; 
    if (networkName == "arbitrum") {
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
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
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
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
  }
  
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
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
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
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
  }
  
  // Deploy DXDVotingMachine
  let dxdVotingMachine;
  if (contractsFile[networkName].votingMachine) {
    console.log('Using DXDVotingMachine already deployed on', contractsFile[networkName].votingMachine);
    dxdVotingMachine = await DXDVotingMachine.at(contractsFile[networkName].votingMachine);
  } else {
    
    let votingMachineTokenAddress;
    if (!DXD_TOKEN[network]) {
        console.log("Creating new voting machine token...");
        const newVotingMachineToken = await ERC20Mock.new(accounts[0], web3.utils.toWei('10000'))
        votingMachineTokenAddress = newVotingMachineToken.address;
        console.log("Voting machine token deployed to:", votingMachineTokenAddress);
    } else {
      votingMachineTokenAddress = DXD_TOKEN[network];
      console.log("Using pre configured voting machine token:", votingMachineTokenAddress);
    }
    
    console.log('Deploying DXDVotingMachine...');
    dxdVotingMachine = await DXDVotingMachine.new(votingMachineTokenAddress);
    console.log("DXDVotingMachine deployed to:", dxdVotingMachine.address);
    contractsFile[networkName].votingMachine = dxdVotingMachine.address;
    contractsFile[networkName].votingMachineToken = votingMachineTokenAddress;
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
  
  }
  
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
  let permissionRegistry;
  if (contractsFile[networkName].permissionRegistry) {
    console.log('Using PermissionRegistry already deployed on', contractsFile[networkName].permissionRegistry);
    permissionRegistry = await PermissionRegistry.at(contractsFile[networkName].permissionRegistry);
  } else {
    console.log('Deploying PermissionRegistry...');
    permissionRegistry = await PermissionRegistry.new(
      accounts[0], moment.duration(1, 'hours').asSeconds(), { gas: 1000000 }
    );
    console.log("Permission Registry deployed to:", permissionRegistry.address);
    contractsFile[networkName].permissionRegistry = permissionRegistry.address;
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
  }
  
  // Deploy MasterWalletScheme
  let masterWalletScheme;
  if (contractsFile[networkName].schemes.masterWallet) {
    console.log('Using Master WalletScheme already deployed on', contractsFile[networkName].schemes.masterWallet);
    masterWalletScheme = await WalletScheme.at(contractsFile[networkName].schemes.masterWallet);
  } else {
    console.log('Deploying MasterWalletScheme...');
    masterWalletScheme = await WalletScheme.new();
    console.log("Master WalletScheme deployed to:", masterWalletScheme.address);
    
    let masterWalletSchemeParamsHash = await encodeParameters(MASTER_WALLET_SCHEME_PARAMS);
    await setDXDVotingMachineParameters(MASTER_WALLET_SCHEME_PARAMS)
    await masterWalletScheme.initialize(
      dxAvatar.address,
      dxdVotingMachine.address,
      masterWalletSchemeParamsHash,
      dxController.address,
      permissionRegistry.address,
      "Master Wallet",
      86400
    );
    
    console.log("Setting avatar permissions...");
    // Allows any function to be executed from the dxdao to any address with a max value of 5 ETH
    await permissionRegistry.setAdminPermission(
      NULL_ADDRESS, 
      dxAvatar.address, 
      ANY_ADDRESS, 
      ANY_FUNC_SIGNATURE,
      web3.utils.toWei("5"),
      true
    );
    
    console.log('Registering Master WalletScheme...');
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
    contractsFile[networkName].schemes.masterWallet = masterWalletScheme.address;
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
  }
  
  // Deploy QuickWalletScheme:
  let quickWalletScheme;
  if (contractsFile[networkName].schemes.quickWallet) {
    console.log('Using Quick WalletScheme already deployed on', contractsFile[networkName].schemes.quickWallet);
    quickWalletScheme = await WalletScheme.at(contractsFile[networkName].schemes.quickWallet);
  } else {
    console.log('Deploying MasterWalletScheme...');
    quickWalletScheme = await WalletScheme.new();
    console.log("Quick WalletScheme deployed to:", quickWalletScheme.address);
    
    let quickWalletSchemeParamsHash = await encodeParameters(QUICK_WALLET_SCHEME_PARAMS);
    await setDXDVotingMachineParameters(QUICK_WALLET_SCHEME_PARAMS)
    await quickWalletScheme.initialize(
      dxAvatar.address,
      dxdVotingMachine.address,
      quickWalletSchemeParamsHash,
      NULL_ADDRESS,
      permissionRegistry.address,
      "Quick Wallet",
      86400
    );
    
    console.log("Setting avatar and quick wallet scheme permissions...");
    await permissionRegistry.setAdminPermission(
      NULL_ADDRESS, 
      dxAvatar.address, 
      quickWalletScheme.address, 
      ANY_FUNC_SIGNATURE,
      MAX_UINT_256,
      true
    );    
    await permissionRegistry.setAdminPermission(
      NULL_ADDRESS, 
      quickWalletScheme.address, 
      ANY_ADDRESS, 
      ANY_FUNC_SIGNATURE,
      MAX_UINT_256,
      true
    );
    
    console.log('Registering Quick WalletScheme...');
    contractsFile[networkName].schemes.quickWallet = quickWalletScheme.address;
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
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
    );
    
  }

  console.log("Transfering ownership...");
  // Transfer permission registry ownership to dxdao
  try {
    await permissionRegistry.transferOwnership(dxAvatar.address);
    await dxController.unregisterScheme(accounts[0], dxAvatar.address);
  } catch (e) {
    contractsFile[networkName] = {}
    if (networkName != "hardhat")
      fs.writeFileSync('.contracts.json', JSON.stringify(contractsFile, null, 2), {encoding:'utf8',flag:'w'});
  }

  console.log('Contracts deployed:', contractsFile);
  
  console.log("Verifying contracts...");
  try {
    await hre.run("verify:verify", {
      address: dxReputation.address,
      contract: `${DxReputation._hArtifact.sourceName}:${DxReputation._hArtifact.contractName}`,
      constructorArguments: [],
    })
  } catch (e) {}
  try {
    await hre.run("verify:verify", {
      address: dxToken.address,
      contract: `${DxToken._hArtifact.sourceName}:${DxToken._hArtifact.contractName}`,
      constructorArguments: ["", "", 0],
    })
  } catch(e) {}
  try {
    await hre.run("verify:verify", {
      address: dxAvatar.address,
      contract: `${DxAvatar._hArtifact.sourceName}:${DxAvatar._hArtifact.contractName}`,
      constructorArguments: ["DXdao", dxReputation.address, dxToken.address],
    })
  } catch(e) {}
  try {
    await hre.run("verify:verify", {
      address: dxController.address,
      contract: `${DxController._hArtifact.sourceName}:${DxController._hArtifact.contractName}`,
      constructorArguments: [dxAvatar.address],
    })
  } catch(e) {}
  try {
    await hre.run("verify:verify", {
      address: dxdVotingMachine.address,
      contract: `${DXDVotingMachine._hArtifact.sourceName}:${DXDVotingMachine._hArtifact.contractName}`,
      constructorArguments: [DXD_TOKEN],
    })
  } catch(e) {}
  try {
    await hre.run("verify:verify", {
      address: permissionRegistry.address,
      contract: `${PermissionRegistry._hArtifact.sourceName}:${PermissionRegistry._hArtifact.contractName}`,
      constructorArguments: [accounts[0], moment.duration(1, 'hours').asSeconds()],
    })
  } catch(e) {}
  try {
    await hre.run("verify:verify", {
      address: masterWalletScheme.address,
      contract: `${WalletScheme._hArtifact.sourceName}:${WalletScheme._hArtifact.contractName}`,
      constructorArguments: [],
    })
  } catch(e) {}
  try {
    await hre.run("verify:verify", {
      address: quickWalletScheme.address,
      contract: `${WalletScheme._hArtifact.sourceName}:${WalletScheme._hArtifact.contractName}`,
      constructorArguments: [],
    })
  } catch(e) {}
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
