require('dotenv').config();
require("babel-polyfill");
require("babel-register")({
  "presets": [ "es2015" ],
  "plugins": [ "syntax-async-functions", "transform-regenerator" ]
});
require('@nomiclabs/hardhat-truffle5');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('@openzeppelin/hardhat-upgrades');
require("@nomiclabs/hardhat-etherscan");
require('hardhat-dependency-compiler');

const INFURA_PROJECT_ID = process.env.KEY_INFURA_API_KEY;
const MNEMONIC = process.env.KEY_MNEMONIC;
const ETHERSCAN_API_KEY = process.env.KEY_ETHERSCAN;

const hardharNetworks = process.env.CI
  ? {
    hardhat: {
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      allowUnlimitedContractSize: true,
      gasLimit: 9000000,
      gasPrice: 10000000000, // 10 gwei
      timeout: 60000
    }
  }
  : {
    hardhat: {
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      allowUnlimitedContractSize: true,
      gasLimit: 9000000,
      gasPrice: 10000000000, // 10 gwei
      timeout: 60000,
      mining: {
        auto: true,
        interval: 10000
      }
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: { mnemonic: MNEMONIC },
      gasLimit: 9000000,
      gasPrice: 100000000000, // 100 gwei
      timeout: 60000
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: { mnemonic: MNEMONIC },
      gasLimit: 9000000,
      gasPrice: 1000000000, // 1 gwei
      timeout: 60000
    },
    xdai: {
      url: `https://rpc.xdaichain.com/`,
      accounts: { mnemonic: MNEMONIC },
      gasLimit: 17000000,
      gasPrice: 2000000000, // 2 gwei
      timeout: 60000
    },
    arbitrum: {
      url: `https://arb1.arbitrum.io/rpc`,
      accounts: { mnemonic: MNEMONIC },
      gasPrice: 1000000000, // 1 gwei
      chainId: 42161,
      timeout: 60000
    },
    arbitrumTestnet: {
      url: 'https://rinkeby.arbitrum.io/rpc',
      accounts: { mnemonic: MNEMONIC },
      chainId: 421611,
      timeout: 60000
    }
  };


module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.5.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        },
      },{
        version: '0.6.8',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        },
      },{
        version: '0.4.25',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },{
        version: '0.7.6',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ],
    overrides: {
      "contracts/utils/GnosisSafe/GnosisProxy.sol": { version: "0.5.14" },
      "contracts/utils/GnosisSafe/GnosisSafe.sol": { version: "0.5.14" },
      "contracts/omen/OMNToken.sol": { version: "0.7.6" },
      "contracts/omen/OMNGuild.sol": {
        version: "0.7.6",
        settings: { optimizer: { enabled: true, runs: 100 } }
      },
      "contracts/dxdao/DXDGuild.sol": {
        version: "0.7.6",
        settings: { optimizer: { enabled: true, runs: 100 } }
      },
      "contracts/erc20guild/ERC20Guild.sol": {
        version: "0.7.6",
        settings: { optimizer: { enabled: true, runs: 100 } }
      },
      "contracts/erc20guild/IERC20Guild.sol": { version: "0.7.6" },
    }
  },
  gasReporter: {
    currency: 'USD',
    enabled: process.env.ENABLE_GAS_REPORTER === 'true'
  },
  networks: hardharNetworks,
  etherscan: { apiKey: ETHERSCAN_API_KEY },
  dependencyCompiler: {
    paths: [
      '@realitio/realitio-contracts/truffle/contracts/Realitio.sol',
    ],
  }
};
