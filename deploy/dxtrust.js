const moment = require("moment");

// *** Constants
const pricePerETHUSD = 200;
const initGoalUSD = 200;
const initGoalETH = initGoalUSD / pricePerETHUSD;
const buySlopePointUSD = 300000;
const buySlopePointDXD = 12000;
const buySlopePointETH = buySlopePointUSD / pricePerETHUSD;

// Calculates buy slope from an specific point
const buySlope = parseFloat(
  (2 * buySlopePointETH) / (buySlopePointDXD * buySlopePointDXD)
).toFixed(18);

// Calculates the buy slope denominator from the slope
const buySlopeDen = parseFloat(1 / buySlope).toFixed();

// Calculates init goal DXD from the initial goal ETH and the slope
const initGoalDXD = Math.sqrt((2 * initGoalETH) / buySlope);

const deployExtraSalt = "dxtrust";

// *** Util functions
async function _displayTokenVestingInfo(contracts) {
  // Display Token Vetsing values
  console.log("\n");
  console.group("Displaying Token Vesting Info:::");
  console.log(
    "Token vesting contract address:",
    contracts.tokenVesting.address
  );
  console.log(
    "Token vesting contract owner:",
    await contracts.tokenVesting.owner()
  );
  console.log(
    "Token vesting contract beneficiary:",
    await contracts.tokenVesting.beneficiary()
  );
  console.log(
    "Token vesting contract balance:",
    (await contracts.dat.balanceOf(contracts.tokenVesting.address)).toString()
  );
  console.log(
    "Token vesting contract cliff:",
    (await contracts.tokenVesting.cliff()).toString()
  );
  console.log(
    "Token vesting contract start:",
    (await contracts.tokenVesting.start()).toString()
  );
  console.log(
    "Token vesting contract duration:",
    (await contracts.tokenVesting.duration()).toString()
  );
  console.log(
    "Token vesting contract revocable:",
    await contracts.tokenVesting.revocable()
  );
  console.groupEnd();
}

async function _displayDatInfo(contracts) {
  // Display DAT values
  console.log("\n");
  console.group("Displaying DAT contract Info:::");
  console.log("DAT contract address:", contracts.dat.address);
  console.log("DAT contract controller:", await contracts.dat.control());
  console.log("DAT contract beneficiary:", await contracts.dat.beneficiary());
  console.log("DAT contract feeCollector:", await contracts.dat.feeCollector());
  console.log("DAT contract whitelist:", await contracts.dat.whitelist());
  console.log("DAT contract currency:", await contracts.dat.currency());
  console.log(
    "DAT contract totalSupply:",
    (await contracts.dat.totalSupply()).toString()
  );
  console.log(
    "DAT contract initReserve:",
    (await contracts.dat.initReserve()).toString()
  );
  console.log(
    "DAT contract initGoal:",
    (await contracts.dat.initGoal()).toString()
  );
  console.log(
    "DAT contract minInvestment:",
    (await contracts.dat.minInvestment()).toString()
  );
  console.log(
    "DAT contract revenueCommitmentBasisPoints:",
    (await contracts.dat.revenueCommitmentBasisPoints()).toString()
  );
  console.log(
    "DAT contract investmentReserveBasisPoints:",
    (await contracts.dat.investmentReserveBasisPoints()).toString()
  );
  console.log(
    "DAT contract openUntilAtLeast:",
    (await contracts.dat.openUntilAtLeast()).toString()
  );
  console.log("DAT contract autoBurn:", await contracts.dat.autoBurn());
  console.log(
    "DAT contract buySlopeNum:",
    (await contracts.dat.buySlopeNum()).toString()
  );
  console.log(
    "DAT contract buySlopeDen:",
    (await contracts.dat.buySlopeDen()).toString()
  );
  console.log(
    "DAT contract feeBasisPoints:",
    (await contracts.dat.feeBasisPoints()).toString()
  );
  console.groupEnd();
}

// *** Deployer
module.exports = async hre => {
  const { getNamedAccounts, deployments, web3 } = hre;
  console.log(
    " \n",
    "*** Init DecentralizedAutonomousTrust deployment ***",
    " \n"
  );
  const { deployer: deployerAddress } = await getNamedAccounts();
  const { deploy } = deployments;
  const momentNow = moment.utc(new Date().toUTCString());
  const network = hre.network.name;
  const deploySalt = web3.utils.sha3(process.env.DEPLOY_SALT + deployExtraSalt);

  // TODO: get controller acc from script, not hardcoded.
  let controllerAccount = "0xC5B20AdE9c9Cd5e0CC087C62b26B815A4bc1881f";

  const deployOptions = {
    collateralType: "ETH",
    name: "DXdao",
    symbol: "DXD",
    currency: "0x0000000000000000000000000000000000000000", // Using ETH
    whitelist: "0x0000000000000000000000000000000000000000", // No Whitelist
    initReserve: "100000",
    initGoal: web3.utils.toWei(initGoalDXD.toString()),
    buySlopeNum: "1",
    buySlopeDen: web3.utils.toWei(buySlopeDen.toString()),
    investmentReserveBasisPoints: "1000", // 10 %
    revenueCommitmentBasisPoints: "1000", // 10 %
    minInvestment: "1000000000000000", // 0.001 ETH
    feeBasisPoints: "0", // No fee for operations
    autoBurn: true, // Burn when org sell and pay
    openUntilAtLeast: momentNow.add(5, "years").unix(), // Open for 5 years
    control: controllerAccount,
    beneficiary: controllerAccount,
    feeCollector: controllerAccount,
    vestingCliff: "0",
    vestingDuration: Math.trunc(moment.duration(3, "years").as("seconds")),
  };
  console.log(
    `Deploy DAT with config: ${JSON.stringify(deployOptions, null, 2)}`,
    " \n"
  );

  console.log("Running deploy on network", network);
  console.log(`Using deployerAddress: ${deployerAddress}`, " \n");

  // ********************************************      Artifacts   *************************************************
  const DecentralizedAutonomousTrust = await hre.artifacts.require(
    "DecentralizedAutonomousTrust"
  );
  const AdminUpgradeabilityProxy = await hre.artifacts.require(
    "AdminUpgradeabilityProxy"
  );
  const ProxyAdmin = await hre.artifacts.require(
    "@openzeppelin/upgrades/contracts/upgradeability/ProxyAdmin.sol:ProxyAdmin"
  );
  const TokenVesting = await hre.artifacts.require(
    "@openzeppelin/contracts-ethereum-package/contracts/drafts/TokenVesting.sol:TokenVesting"
  );

  const contracts = {
    proxyAdmin: null,
    datImplementation: null,
    datProxy: null,
    dat: null,
    tokenVesting: null,
  };

  // ********************************************      Deploys   *************************************************
  // Deploy ProxyAdmin
  const ProxyAdminFactory = await hre.ethers.getContractFactory(
    "@openzeppelin/upgrades/contracts/upgradeability/ProxyAdmin.sol:ProxyAdmin"
  );
  const proxyAdmin = await ProxyAdminFactory.deploy();
  await proxyAdmin.deployed();

  contracts.proxyAdmin = await ProxyAdmin.at(proxyAdmin.address);
  console.log(`ProxyAdmin deployed ${contracts.proxyAdmin.address}`);

  // Deploy DAT Implementation
  const datImplementationDeployed = await deploy(
    "DecentralizedAutonomousTrust",
    {
      name: "DecentralizedAutonomousTrust",
      from: deployerAddress,
      args: [],
      deterministicDeployment: deploySalt,
    }
  );
  contracts.datImplementation = await DecentralizedAutonomousTrust.at(
    datImplementationDeployed.address
  );
  console.log(
    "DecentralizedAutonomousTrust implementation deployed: ",
    contracts.datImplementation.address
  );

  //   Deploy AdminUpgradeabilityProxy
  const datProxyDeployed = await deploy("AdminUpgradeabilityProxy", {
    name: "AdminUpgradeabilityProxy",
    from: deployerAddress,
    args: [
      contracts.datImplementation.address, // Logic
      contracts.proxyAdmin.address, // Admin
      [], // Data
    ],
    deterministicDeployment: deploySalt,
  });
  contracts.datProxy = await AdminUpgradeabilityProxy.at(
    datProxyDeployed.address
  );
  contracts.dat = await DecentralizedAutonomousTrust.at(
    contracts.datProxy.address
  );
  console.log(
    `AdminUpgradeabilityProxy deployed: ${contracts.datProxy.address}`
  );

  // Initialize DAT proxy
  // `await contracts.dat.initialize()` was failing catching the initialize method from the
  //  proxy, not from the implementation. Using correct fn signature to execute call
  const initializeCall = new web3.eth.Contract(
    DecentralizedAutonomousTrust.abi
  ).methods
    .initialize(
      deployOptions.initReserve,
      deployOptions.currency,
      deployOptions.initGoal,
      deployOptions.buySlopeNum,
      deployOptions.buySlopeDen,
      deployOptions.investmentReserveBasisPoints,
      deployOptions.name,
      deployOptions.symbol
    )
    .encodeABI();

  await web3.eth.sendTransaction({
    to: contracts.dat.address,
    data: initializeCall,
    from: deployerAddress,
  });

  console.log("ProxyAdmin initialize() done!");

  if (Number(deployOptions.initReserve) > 0) {
    // Deploy TokenVesting
    const TokenVestingFactory = await hre.ethers.getContractFactory(
      "@openzeppelin/contracts-ethereum-package/contracts/drafts/TokenVesting.sol:TokenVesting"
    );
    const tokenVesting = await TokenVestingFactory.deploy();
    await tokenVesting.deployed();

    contracts.tokenVesting = await TokenVesting.at(tokenVesting.address);
    console.log(`TokenVesting deployed: ${contracts.tokenVesting.address}`);

    // Initialize TokenVesting
    await contracts.tokenVesting.initialize(
      deployOptions.control,
      new moment().unix(),
      deployOptions.vestingCliff,
      deployOptions.vestingDuration,
      false,
      deployOptions.control
    );
    console.log("TokenVesting initialize() done!");

    // Transfer initReserve to tokenVesting
    await contracts.dat.transfer(
      contracts.tokenVesting.address,
      deployOptions.initReserve
    );

    console.log(
      `Token vesting funded with initReserve ${deployOptions.initReserve}`
    );
  } else {
    console.log(
      "Skipping TokenVesting deployment. deployOptions.initReserve less or equal 0"
    );
  }
  // Update the DAT stting the right values and beneficiary account
  await contracts.dat.updateConfig(
    deployOptions.whitelist,
    deployOptions.beneficiary,
    deployOptions.control,
    deployOptions.feeCollector,
    deployOptions.feeBasisPoints,
    deployOptions.autoBurn,
    deployOptions.revenueCommitmentBasisPoints,
    deployOptions.minInvestment,
    deployOptions.openUntilAtLeast
  );
  console.log("DAT config updated!");
  await contracts.proxyAdmin.transferOwnership(deployOptions.control);
  console.log(
    "ProxyAdmin transfered ownership to deployOptions.control",
    await contracts.proxyAdmin.owner()
  );
  await _displayTokenVestingInfo(contracts);
  await _displayDatInfo(contracts);
};
module.exports.dependencies = [];
module.exports.tags = ["DecentralizedAutonomousTrust"];

