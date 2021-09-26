const mainnetConfig = require('./mainnet')
const { units } = require('../lib/math')
const { susdBytes, sbtcBytes, sethBytes } = require('../lib/synths')

const { usdc, wbtc, weth } = mainnetConfig

module.exports = {
  ...mainnetConfig,

  // Ensures test reliability for system state and price queries (25-09-2021)
  forkBlockNumber: 13293250,

  // Owner and depositor will be configured in e2e test
  owner: undefined,
  depositor: undefined,

  atomicSettings: {
    maxVolume: units.oneInEighteen.mul('1000000'), // 1 million
    twapWindow: 60 * 30, // 30min
    synthEquivalents: {
      [susdBytes]: usdc,
      [sbtcBytes]: wbtc,
      [sethBytes]: weth,
    },
    exchangeFeeRates: {
      [sbtcBytes]: units.bpsInEighteen.mul('30'), // 30bps
      [sethBytes]: units.bpsInEighteen.mul('30'), // 30bps
    },
    priceBuffers: {
      [sbtcBytes]: units.bpsInEighteen.mul('15'), // 15bps
      [sethBytes]: units.bpsInEighteen.mul('15'), // 15bps
    },
    volWindows: {
      [sbtcBytes]: 60 * 20, // 20min
      [sethBytes]: 60 * 20, // 20min
    },
    volThresholds: {
      [sbtcBytes]: 2, // 2 updates
      [sethBytes]: 2, // 2 updates
    },
  },
}
