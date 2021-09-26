const { units } = require('../lib/math')
const { susdBytes, sbtcBytes, sethBytes } = require('../lib/synths')

const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const wbtc = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

module.exports = {
  owner: '0xAA8FB2F69B0eb88dfA9690B79e766A7e05D2Abc5',
  depositor: '0x298EcCfb4317E66c7EE6a7D0CB5cbedB85A30205',

  usdc,
  wbtc,
  weth,

  dexPriceAggregator: '0x074Fe031AD93e6a2f6037EB1fAa0BDc424DCe79d',
  chainlinkPriceAggregators: {
    [sbtcBytes]: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    [sethBytes]: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  },
  synthetix: {
    addressResolver: '0x823bE81bbF96BEc0e25CA13170F5AaCb5B79ba83',
    flexibleStorage: '0xc757aCBa3c0506218b3022266a9DC7F3612d85f5',
    issuer: '0x922C84B3894298296C34842D866BfC0d36C54778',
    safeDecimalMath: '0x84D626B2BB4D0F064067e4BF80FCe7055d8F3E7B',
  },

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
