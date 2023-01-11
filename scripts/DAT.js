const zeroAddress = "0x0000000000000000000000000000000000000000";

async function deployDAT(hre, options = {}, useProxy, network) {
  const accounts = await hre.getUnnamedAccounts();

  const DATContract = await hre.artifacts.require(
    "DecentralizedAutonomousTrust"
  );
  const ProxyContract = await hre.artifacts.require("AdminUpgradeabilityProxy");
  const ProxyAdminContract = await hre.artifacts.require(
    "@openzeppelin/upgrades/contracts/upgradeability/ProxyAdmin.sol:ProxyAdmin"
  );
  const Multicall = await hre.artifacts.require("Multicall");

  const contracts = {};
  const callOptions = Object.assign(
    {
      initReserve: web3.utils.toWei("42", "ether"),
      currency: zeroAddress,
      initGoal: "0",
      buySlopeNum: "1",
      buySlopeDen: "100000000000000000000",
      investmentReserveBasisPoints: "1000",
      revenueCommitmentBasisPoints: "1000",
      control: accounts[1],
      beneficiary: accounts[5],
      feeCollector: accounts[6],
      minInvestment: web3.utils.toWei("0.0001", "ether"),
      name: "Test org",
      symbol: "TFO",
    },
    options
  );
  if (options.log)
    console.log(
      `Deploy DAT with config: ${JSON.stringify(callOptions, null, 2)}`,
      " \n"
    );
  const ProxyAdminFactory = await hre.ethers.getContractFactory(
    "@openzeppelin/upgrades/contracts/upgradeability/ProxyAdmin.sol:ProxyAdmin"
  );

  const proxyAdmin = await ProxyAdminFactory.deploy();

  await proxyAdmin.deployed({
    from: callOptions.control,
  });

  contracts.proxyAdmin = await ProxyAdminContract.at(proxyAdmin.address);

  if (options.log)
    console.log(`ProxyAdmin deployed ${contracts.proxyAdmin.address}`);

  const datContract = await DATContract.new({
    from: callOptions.control,
    gas: 9000000,
  });

  if (options.log) console.log(`DAT template deployed ${datContract.address}`);

  const datProxy = await ProxyContract.new(
    datContract.address, // logic
    contracts.proxyAdmin.address, // admin
    [], // data
    {
      from: callOptions.control,
      gas: 9000000,
    }
  );
  if (options.log) console.log(`DAT proxy deployed ${datProxy.address}`);

  contracts.dat = await DATContract.at(datProxy.address);
  contracts.dat.implementation = datContract.address;

  const initializeCall = new web3.eth.Contract(DATContract.abi).methods
    .initialize(
      callOptions.initReserve,
      callOptions.currency,
      callOptions.initGoal,
      callOptions.buySlopeNum,
      callOptions.buySlopeDen,
      callOptions.investmentReserveBasisPoints,
      callOptions.name,
      callOptions.symbol
    )
    .encodeABI();

  await web3.eth.sendTransaction({
    to: contracts.dat.address,
    data: initializeCall,
    from: callOptions.control,
  });

  await updateDAT(contracts, web3, callOptions);

  const MulticallFactory = await hre.ethers.getContractFactory("Multicall");
  const multicall = await MulticallFactory.deploy();
  await multicall.deployed({
    from: callOptions.control,
  });

  contracts.multicall = await Multicall.at(multicall.address);

  if (options.log) {
    console.log("DAT control accounts:", callOptions.control);
    console.log("DAT beneficiary accounts:", callOptions.beneficiary);
    console.log("DAT feeCollector accounts:", callOptions.feeCollector, " \n");
    console.log("Recommended testing accounts:", accounts[4]);
    console.log("Get your provate keys in https://iancoleman.io/bip39/ \n");
  }

  return contracts;
}

async function updateDAT(contracts, web3, options) {
  const DATContract = await hre.artifacts.require(
    "DecentralizedAutonomousTrust"
  );

  const datContract = contracts.dat;

  const callOptions = Object.assign(
    {
      beneficiary: await datContract.beneficiary(),
      control: await datContract.control(),
      feeCollector: await datContract.feeCollector(),
      feeBasisPoints: await datContract.feeBasisPoints(),
      autoBurn: await datContract.autoBurn(),
      revenueCommitmentBasisPoints:
        await datContract.revenueCommitmentBasisPoints(),
      minInvestment: await datContract.minInvestment(),
      openUntilAtLeast: await datContract.openUntilAtLeast(),
    },
    options
  );

  const controller = await contracts.dat.control();
  const updateCall = new web3.eth.Contract(DATContract.abi).methods
    .updateConfig(
      "0x0000000000000000000000000000000000000000",
      callOptions.beneficiary,
      callOptions.control,
      callOptions.feeCollector,
      callOptions.feeBasisPoints,
      callOptions.autoBurn,
      callOptions.revenueCommitmentBasisPoints,
      callOptions.minInvestment,
      callOptions.openUntilAtLeast
    )
    .encodeABI();

  return await web3.eth.sendTransaction({
    to: contracts.dat.address,
    data: updateCall,
    from: controller,
  });
}

module.exports = { deployDAT, updateDAT };

