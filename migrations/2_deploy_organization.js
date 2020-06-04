//this migration file is used only for testing purpose
var constants = require('../test/constants');
var DxAvatar = artifacts.require('./DxAvatar.sol');
var DxController = artifacts.require('./DxController.sol');
var DaoCreator = artifacts.require('./DaoCreator.sol');
var WalletScheme = artifacts.require('./WalletScheme.sol');
var AbsoluteVote = artifacts.require('AbsoluteVote.sol');
var DxControllerCreator = artifacts.require('./DxControllerCreator.sol');
var DAOTracker = artifacts.require('./DAOTracker.sol');
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';


// TEST_ORGANIZATION ORG parameters:
const orgName = "TEST_ORGANIZATION";
const tokenName = "TestToken";
const tokenSymbol = "TST";
const founders = [];
const initRep = web3.utils.toWei("10");
const initRepInWei = [initRep];
const initToken = web3.utils.toWei("1000");
const initTokenInWei = [initToken];
const cap = web3.utils.toWei("100000000", "ether");

// DAOstack parameters for universal schemes:

const votePrec = 50;

var accounts;

//Deploy test organization with the following schemes:
//WalletScheme.
module.exports = async function(deployer) {
  deployer.deploy(DxControllerCreator, {gas: constants.ARC_GAS_LIMIT}).then(async function(){
    await deployer.deploy(DAOTracker, {gas: constants.ARC_GAS_LIMIT});
    var daoTracker = await DAOTracker.deployed();
    var controllerCreator = await DxControllerCreator.deployed();
    await deployer.deploy(DaoCreator, controllerCreator.address, daoTracker.address, {gas: constants.ARC_GAS_LIMIT});
    var daoCreatorInst = await DaoCreator.deployed(controllerCreator.address, {gas: constants.ARC_GAS_LIMIT});
      
    // Create DAOstack:
    await web3.eth.getAccounts(function(err, res) {
      accounts = res; 
    });
    founders[0] = accounts[0];
    var returnedParams = await daoCreatorInst.forgeOrg(orgName, tokenName, tokenSymbol, founders,
      initTokenInWei, initRepInWei, cap, {gas: constants.ARC_GAS_LIMIT});
    var DxAvatarInst = await DxAvatar.at(returnedParams.logs[0].args._avatar);
    var ContollerInst = await DxController.at(await DxAvatarInst.owner());
    await deployer.deploy(AbsoluteVote, {gas: constants.ARC_GAS_LIMIT});
    // Deploy AbsoluteVote:
    var AbsoluteVoteInst = await AbsoluteVote.deployed();
    // Deploy WalletScheme:
    await deployer.deploy(WalletScheme);
    var walletScheme = await WalletScheme.deployed();
    
    // Voting parameters and schemes params:
    var voteParametersHash = await AbsoluteVoteInst.getParametersHash(votePrec, NULL_ADDRESS);

    await walletScheme.initialize(DxAvatarInst.address, ContollerInst.address, AbsoluteVoteInst.address, voteParametersHash);
      
    var schemesArray = [walletScheme.address];
    const paramsArray = ['0x0'];
    const permissionArray = ['0x0000001F'];

    // set DAOstack initial schmes:
    await daoCreatorInst.setSchemes(
      DxAvatarInst.address,
      schemesArray,
      paramsArray,
      permissionArray,
      "metaData"
    );
  });
};
