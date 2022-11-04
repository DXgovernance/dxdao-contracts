require("dotenv").config();
require("babel-polyfill");
require("babel-register")({
  presets: ["es2015"],
  plugins: ["syntax-async-functions", "transform-regenerator"],
});
require("@nomiclabs/hardhat-truffle5");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-dependency-compiler");
require("hardhat-contract-sizer");
require("hardhat-deploy");

require("./scripts/nanoUniversalDeployerDeploy");
require("./scripts/keylessDeploy");
require("./scripts/create2");
require("./scripts/actions-dxdao-contracts");
require("./scripts/deploy-dxdao-contracts");
require("./scripts/deploymentTemplates/dxvote-develop");
require("./scripts/deploymentTemplates/guilds-goerli");

const moment = require("moment");

const MNEMONIC_PHRASE = process.env.MNEMONIC_PHRASE;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const INFURA_API_KEY = process.env.INFURA_API_KEY;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

const hardharNetworks = process.env.CI
  ? {
      hardhat: {
        throwOnTransactionFailures: true,
        throwOnCallFailures: true,
        allowUnlimitedContractSize: true,
        gasLimit: 9000000,
        gasPrice: 10000000000, // 10 gwei
        timeout: 60000,
      },
    }
  : {
      hardhat: {
        accounts: { mnemonic: MNEMONIC_PHRASE },
        throwOnTransactionFailures: true,
        throwOnCallFailures: true,
        allowUnlimitedContractSize: true,
        gasLimit: 9000000,
        gasPrice: 10000000000, // 10 gwei
        timeout: 60000,
        initialDate: moment.unix(0).toDate().toString(),
        mining: {
          auto: true,
          interval: 1000,
        },
      },
      mainnet: {
        url: ALCHEMY_API_KEY
          ? `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`
          : `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
        accounts: { mnemonic: MNEMONIC_PHRASE },
        chainId: 1,
        gasLimit: 9000000,
        gasPrice: 100000000000, // 100 gwei
        timeout: 60000,
      },
      goerli: {
        url: ALCHEMY_API_KEY
          ? `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_API_KEY}`
          : `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
        accounts: { mnemonic: MNEMONIC_PHRASE },
        chainId: 5,
        gasLimit: 9000000,
        gasPrice: 100000000000, // 100 gwei
        timeout: 600000, // 10 minutes
      },
      xdai: {
        url: "https://poa-xdai-archival.gateway.pokt.network/v1/lb/61d897d4a065f5003a113d9a",
        accounts: { mnemonic: MNEMONIC_PHRASE },
        chainId: 100,
        gasLimit: 17000000,
        gasPrice: 2000000000, // 2 gwei
        timeout: 60000,
      },
      arbitrum: {
        url: "https://arb1.arbitrum.io/rpc",
        accounts: { mnemonic: MNEMONIC_PHRASE },
        gasPrice: 1000000000, // 1 gwei
        chainId: 42161,
        timeout: 600000, // 10 minutes
      },
      arbitrumTestnet: {
        url: "https://rinkeby.arbitrum.io/rpc",
        accounts: { mnemonic: MNEMONIC_PHRASE },
        chainId: 421611,
        timeout: 60000,
      },
    };

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.4.25",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.5.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.8",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
  },
  networks: hardharNetworks,
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "xdai",
        chainId: 100,
        urls: {
          apiURL: "https://api.gnosisscan.io/api",
          browserURL: "https://gnosisscan.io",
        },
      },
    ],
  },
  dependencyCompiler: {
    keep: true,
    paths: [
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
    ],
  },
  namedAccounts: {
    deployer: 0,
    tokenHolder: 1,
  },
  deterministicDeployment: {
    1337: {
      factory: "0x4e59b44847b379578588920ca78fbf26c0b4956c",
      deployer: "0x3fab184622dc19b6109349b94811493bf2a45362",
      funding: "1000000000000000000000",
      signedTx:
        "0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222",
    },
  },
};
