require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-etherscan')
require('hardhat-local-networks-config-plugin')

const mainnetE2eConfiguration = require('./config/mainnet-e2e')

const config = {
  solidity: {
    version: '0.5.16',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // mimic synthetix
      },
    },
  },
  networks: {
    hardhat: {},
    mainnet: {
      url: process.env.MAINNET_NODE || '',
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
}

const forkingEnabled = !!process.env.FORK_NODE
if (forkingEnabled) {
  config.networks.hardhat.forking = {
    url: process.env.FORK_NODE,
    blockNumber: mainnetE2eConfiguration.forkBlockNumber,
    enabled: true,
  }
}

module.exports = config
