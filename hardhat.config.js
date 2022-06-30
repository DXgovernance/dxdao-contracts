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
require("hardhat-contract-sizer");

require("./scripts/create2");
require("./scripts/actions-dxdao-contracts");
require("./scripts/deploy-dxdao-contracts");
require("./scripts/deploymentTemplates/dxvote-develop");
require("./scripts/deploymentTemplates/guilds-goerli");

const moment = require("moment");

const MNEMONIC_KEY =
  "cream core pear sure dinner indoor citizen divorce sudden captain subject remember";

// # Accounts
// # ========
// # Account #0: 0x9578e973bba0cc33bdbc93c7f77bb3fe6d47d68a (10000 ETH)
// # Private Key #0: 0x2edaf5755c340d57c68ab5c084a0afd867caafcbcf556838f404468e2ad0ea94

// # Account #1: 0xc5b20ade9c9cd5e0cc087c62b26b815a4bc1881f (10000 ETH)
// # Private Key #1: 0x40126ad770c1ff59937436ddab2872193c01d5353213d297fdb0ea2c13b5981e

// # Account #2: 0xaf8eb8c3a5d9d900aa0b98e3df0bcc17d3c5f698 (10000 ETH)
// # Private Key #2: 0x4db6b61624bd4a9bf87ff59e7fca0991b02ff605664a3ad97dc237c84ba0e013

// # Account #3: 0x84eeb305da0a4309a696d43de9f79f04e66eb4f8 (10000 ETH)
// # Private Key #3: 0x6d8b1b46346a00fec52fd0e2edba75592e8814b11aec5815ec0f6b882e072131

// # Account #4: 0x1b929bdde0fb3b7b759696f23d6cac0963d326e6 (10000 ETH)
// # Private Key #4: 0x19ea21f217094f12da6bab83fe697f902caea0dcf5a2914d7c000b73938f7d85

// # Account #5: 0xd507743abcdb265f5fcef125e3f6cf7250cfe9da (10000 ETH)
// # Private Key #5: 0x6a944885ff4551fd546c59a2322a967af9906f596f60ecd110505c278f464f6e

// # Account #6: 0x9af7a0d34fcf09a735ddaa03adc825398a6557ae (10000 ETH)
// # Private Key #6: 0x4299ee99407089bfc51e829734c0f6c1b366f515d5ddb5ece4f880a2f8fd430c

// # Account #7: 0x2154cdc3632db21a2635819afa450f2dda08aebd (10000 ETH)
// # Private Key #7: 0x0e7ee7881e497062427ed392d310f09ca993fa964040c751cc383c10f55efc7c

// # Account #8: 0x73c8825893ba6b197f883f60a20b4926c0f32a2c (10000 ETH)
// # Private Key #8: 0xd84954f2cea66fd01a872496f25ddb86db79ee81366609fbcff8087c9739b63a

// # Account #9: 0x73d2888f96bc0eb530490ca5342d0c274d95654d (10000 ETH)
// # Private Key #9: 0xd20a2f6a6656d291ca4c4e6121b479db81b3b281e64707ff4a068acf549dc03c

// # Account #10: 0xf8a3681248934f1139be67e0c22a6af450eb9d7c (10000 ETH)
// # Private Key #10: 0x8188d555d06262bfa3a343fa809b59b6368f02aa5a1ac5a3d2cb24e18e2b556e

const INFURA_PROJECT_ID = "5730f284ad6741b183c921ebb0509880";
const MNEMONIC = process.env.KEY_MNEMONIC || MNEMONIC_KEY;
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
      chainId: 1,
      gasLimit: 9000000,
      gasPrice: 100000000000, // 100 gwei
      timeout: 60000,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: { mnemonic: MNEMONIC },
      chainId: 5,
      gasMultiplier: 10,
      timeout: 600000, // 10 minutes
    },
    xdai: {
      url: "https://rpc.xdaichain.com/",
      accounts: { mnemonic: MNEMONIC },
      chainId: 100,
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
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
    ],
  },
};
