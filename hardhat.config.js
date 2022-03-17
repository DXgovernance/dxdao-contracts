require("dotenv").config();
require("babel-polyfill");
require("babel-register")({
  presets: ["es2015"],
  plugins: ["syntax-async-functions", "transform-regenerator"],
});
require("@nomiclabs/hardhat-truffle5");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-dependency-compiler");

require("./scripts/create2");
require("./scripts/deploy-dxvote");
require("./scripts/deploy-dxvote-develop");

const moment = require("moment");

// MNEMONIC KEY = "dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao"
// # Account #0: 0x79706c8e413cdaee9e63f282507287b9ea9c0928 (10000 ETH)
// # Private Key: 0xe408e147b1335674887c1ac7dc3c45de9762aa824cf6255fd8bd61fecf15f021
// #
// # Account #1: 0xc73480525e9d1198d448ece4a01daea851f72a9d (10000 ETH)
// # Private Key: 0x6c8a6a9a7dbad13d6b41089648ae4b7971116611e4acd8f052c478dd8c62673e
// #
// # Account #2: 0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351 (10000 ETH)
// # Private Key: 0x0054b824c2083e7db09f36edb2ab24eb31f8276fa6cd62e30b42e3a185b37179
// #
// # Account #3: 0xaf1a6415202453d79b84d8a9d055b8f9141f696b (10000 ETH)
// # Private Key: 0x3688ff0d0a95dd8b90bc68739505b488ff4908291eeb36380a94227d22653ce3
// #
// # Account #4: 0x02803e2cdff171d1910d178dac948c711937bd3f (10000 ETH)
// # Private Key: 0x530caa05cf058253ed14a2e6ccc5dcb952f09c7bcdcfb4be37e572e85dcafd1e
// #
// # Account #5: 0x797c62953ef866a1ece855c4033cc5dc3c11290b (10000 ETH)
// # Private Key: 0x88ae5259286213d051e99da743d79be5d69dc75ee317bc887f5996ff004b83a6
// #
// # Account #6: 0x016f70459e4ba98e0d60a5f5855e117e8ff39cae (10000 ETH)
// # Private Key: 0x68f5bc4b52a67b3d800d0d8832ae3b89067a3bbee68c66544147e312d996d994
// #
// # Account #7: 0x073f4fdc12f805b8d98e58551fc10d0a71bbc7db (10000 ETH)
// # Private Key: 0x9adc9dfdce8383a1634716bf7a2e317a145f37a176a7b42538ace5ac20e223a1
// #
// # Account #8: 0x6829556f30899d70403947590ffe8900e8c0d0d7 (10000 ETH)
// # Private Key: 0x13436bc37e24487c2f1739d1ce6b8271a8465fee93aa3685ce543e56a50e1692
// #
// # Account #9: 0x2b410bcb3b8096164fa8c6a06220a66bfb77058d (10000 ETH)
// # Private Key: 0x4fe097bbfe75d9531d253b7f917f89dcee6664d832e40a8d82d717602dfeeb6c
// #
// # Account #10: 0x309f75c54a57937a7a0c6eb9b36eb1dbca82407e (10000 ETH)
// # Private Key: 0xb10da35e4abe181d1143aa28a7da6c5f303660b954cf283accfeba2dfb56ab51
// #
// # Account #11: 0xec9d2d34ad6acda19ab8afe71595051b206e3e4d (10000 ETH)
// # Private Key: 0xfdf0c66289fafea1803c64522d073d6cc9ec71ba76e945a7c207f1f5ebb8e3b1
// #
// # Account #12: 0x40c23c536bad1fe206ce911114f2c70309a7e487 (10000 ETH)
// # Private Key: 0x97c63b257e8f86e05ae5a7bbb025b02d179b8d00fb9fbcdbfcdf04dcf9173cf2
// #
// # Account #13: 0x28d254f2ddb522c43a21d338e337fd8d2f820db2 (10000 ETH)
// # Private Key: 0xcdef57c095755d77bbbb327a187e67039c62fe39425e29b3646d334f54d28808
// #
// # Account #14: 0xaf7386ce842cc0cffef91361059b0ca9ae48d6a0 (10000 ETH)
// # Private Key: 0x4739bf3390cd5be10d0f58d2c1e887a186b544af563fa62717a6c324b36fed59
// #
// # Account #15: 0x46c18451aaead6a2cb888b5bd6193c0f2c402329 (10000 ETH)
// # Private Key: 0xc6b5889c8fbd0f3304ddd53b85f056a32b8338f99e5b8877ecb1d1c5543c8d6a
// #
// # Account #16: 0xc707c8143a6e1274ae7f637946f685870925261f (10000 ETH)
// # Private Key: 0x4b00e0c8e17e88d588b204121594f14d20d1abe50e280d599ff39d6b35c44533
// #
// # Account #17: 0x5b14a88dbbb04abcb6e5bf6384491be8d939cf57 (10000 ETH)
// # Private Key: 0x18eecce45e3211ce6ce967f66c404798e36e8298b4b5222ebf597b841ebd868a
// #
// # Account #18: 0x92d356240dda25d050aa441690b92b2fa0011b84 (10000 ETH)
// # Private Key: 0xe53525f97971b006e14820a8a7b74f8aae375b6635735d89b4db2e4cbdf0e8e0
// #
// # Account #19: 0x5a485c203d9537095a6be2acc5a7ad83805d301d (10000 ETH)
// # Private Key: 0xb86f3287c11a77c7317c2484be2bd386816876ead8ceaf86971b7b7c1afbb12b

const INFURA_PROJECT_ID = process.env.KEY_INFURA_API_KEY;
const MNEMONIC =
  process.env.KEY_MNEMONIC ||
  "dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao dxdao";
const ETHERSCAN_API_KEY = process.env.KEY_ETHERSCAN;

const hardharNetworks = process.env.CI
  ? {
      hardhat: {
        accounts: { mnemonic: MNEMONIC },
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
        accounts: { mnemonic: MNEMONIC },
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
        url: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
        accounts: { mnemonic: MNEMONIC },
        gasLimit: 9000000,
        gasPrice: 100000000000, // 100 gwei
        timeout: 60000,
      },
      rinkeby: {
        url: `https://rinkeby.infura.io/v3/${INFURA_PROJECT_ID}`,
        accounts: { mnemonic: MNEMONIC },
        gasLimit: 10000000,
        gasPrice: 1000000000, // 1 gwei
        timeout: 60000,
      },
      xdai: {
        url: "https://rpc.xdaichain.com/",
        accounts: { mnemonic: MNEMONIC },
        gasLimit: 17000000,
        gasPrice: 2000000000, // 2 gwei
        timeout: 60000,
      },
      arbitrum: {
        url: "https://arb1.arbitrum.io/rpc",
        accounts: { mnemonic: MNEMONIC },
        gasPrice: 1000000000, // 1 gwei
        chainId: 42161,
        timeout: 600000, // 10 minutes
      },
      arbitrumTestnet: {
        url: "https://rinkeby.arbitrum.io/rpc",
        accounts: { mnemonic: MNEMONIC },
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
        version: "0.8.8",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
    overrides: {
      "contracts/utils/GnosisSafe/GnosisProxy.sol": { version: "0.5.14" },
      "contracts/utils/GnosisSafe/GnosisSafe.sol": { version: "0.5.14" },
      "contracts/utils/Create2Deployer.sol": {
        version: "0.5.17",
        evmVersion: "istanbul",
        optimizer: { enabled: false, runs: 200 },
      },
      "contracts/omen/OMNToken.sol": { version: "0.8.8" },
      "contracts/erc20guild/IERC20Guild.sol": { version: "0.8.8" },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
  },
  networks: hardharNetworks,
  etherscan: { apiKey: ETHERSCAN_API_KEY },
  dependencyCompiler: {
    keep: true,
    paths: [
      "@realitio/realitio-contracts/truffle/contracts/Realitio.sol",
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
    ],
  },
};
