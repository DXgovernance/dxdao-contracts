const HDWalletProvider = require('truffle-hdwallet-provider')	
require("babel-polyfill");
require("babel-register")({
  "presets": [ "es2015" ],
  "plugins": [ "syntax-async-functions", "transform-regenerator" ]
});
require('dotenv').config();

mnemonic = process.env.KEY_MNEMONIC;
infuraApiKey = process.env.KEY_INFURA_API_KEY;

module.exports = {
  networks: {
    mainnet: {	
      provider: function () {	
        return new HDWalletProvider(mnemonic, `https://mainnet.infura.io/v3/${infuraApiKey}`)	
      },	
      network_id: '1',	
      gas: 9000000,	
      gasPrice: 10000000000 //10 Gwei	
    },	
    rinkeby: {	
      provider: function () {	
        return new HDWalletProvider(mnemonic, `https://rinkeby.infura.io/v3/${infuraApiKey}`)	
      },	
      network_id: '4',	
      gas: 9000000,	
      gasPrice: 10000000000 //10 Gwei	
    },	
    ropsten: {	
      provider: function () {	
        return new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/${infuraApiKey}`)	
      },	
      network_id: '3',	
      gas: 9000000,	
      gasPrice: 10000000000 //10 Gwei	
    },	
    kovan: {	
      provider: function () {	
        return new HDWalletProvider(mnemonic, `https://kovan.infura.io/v3/${infuraApiKey}`)	
      },	
      network_id: '42',	
      gas: 9000000,	
      gasPrice: 10000000000 //10 Gwei	
    },
    test: {
      network_id: "*",
      host: "localhost",
      port: 8545,
      gas: 9000000,
      gasPrice: 10000000000 //10 Gwei	
    },
    soliditycoverage: {
      host: "localhost",
      network_id: "*", // eslint-disable-line camelcase
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01,
    }
  },
  rpc: {
    host: "localhost",
    port: 8545
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  compilers: {
    solc: {
      version: "0.5.17",    // Fetch exact version from solc-bin (default: truffle's version)
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  plugins: [ "solidity-coverage" ]
};
