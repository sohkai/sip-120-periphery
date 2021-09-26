const { ethers } = require('hardhat')
const { toBytes32 } = require('./bytes')
const { ZERO_ADDRESS } = require('./constants')
const { createContractFactoryWithLinks } = require('./linker')

const precompiledArtifacts = {
  ExchangeRatesWithDexPricing: require('../contracts-precompiled/ExchangeRatesWithDexPricing'),
  SystemSettings: require('../contracts-precompiled/SystemSettings'),
}

class Deployer {
  constructor(accounts, config) {
    this.accounts = accounts
    this.config = config
  }

  async deploy() {
    // Contract factories from in-repo sources
    const OwnedMulticallFactory = await ethers.getContractFactory('OwnedMulticall')
    const overrideableFallbackAddressResolverFactory = await ethers.getContractFactory(
      'OverrideableFallbackAddressResolver'
    )
    const overrideableFallbackFlexibleStorageFactory = await ethers.getContractFactory(
      'OverrideableFallbackFlexibleStorage'
    )
    const synthetixSandboxAmmFactory = await ethers.getContractFactory('SynthetixSandboxAMM', {
      libraries: {
        SafeDecimalMath: this.config.synthetix.safeDecimalMath,
      },
    })

    // Contract factories fetched from pre-compiled artifacts
    const sip120ExchangeRatesWithDexPricingFactory = createContractFactoryWithLinks(
      precompiledArtifacts.ExchangeRatesWithDexPricing,
      {
        libraries: {
          SafeDecimalMath: this.config.synthetix.safeDecimalMath,
        },
        signer: this.accounts.deployer,
      }
    )
    const sip120SystemSettingsFactory = createContractFactoryWithLinks(precompiledArtifacts.SystemSettings, {
      libraries: {
        SafeDecimalMath: this.config.synthetix.safeDecimalMath,
      },
      signer: this.accounts.deployer,
    })

    // Deploy contracts
    const multicall = await OwnedMulticallFactory.deploy(this.config.owner)
    const addressResolver = await overrideableFallbackAddressResolverFactory.deploy(
      multicall.address,
      this.config.synthetix.addressResolver
    )
    await addressResolver.deployed()

    const flexibleStorage = await overrideableFallbackFlexibleStorageFactory.deploy(
      addressResolver.address,
      this.config.synthetix.flexibleStorage
    )
    await flexibleStorage.deployed()

    const systemSettings = await sip120SystemSettingsFactory.deploy(multicall.address, addressResolver.address)
    await systemSettings.deployed()

    const exchangeRates = await sip120ExchangeRatesWithDexPricingFactory.deploy(
      multicall.address, // owner
      ZERO_ADDRESS, // oracle
      addressResolver.address, // address resolver
      [], // currencyKeys
      [] // rates
    )

    const sandboxAmm = await synthetixSandboxAmmFactory.deploy(this.config.depositor, addressResolver.address)
    await sandboxAmm.deployed()

    // Configure for initial settings, batching them through a multicall
    const calls = []
    calls.push({
      target: addressResolver.address,
      callData: addressResolver.interface.encodeFunctionData('overrideAddresses', [
        // FlexibleStorage is used directly from other contracts to fetch settings
        // SystemSettings needs to be set to pass authentication on FlexibleStorage
        [toBytes32('ExchangeRates'), toBytes32('FlexibleStorage'), toBytes32('SystemSettings')],
        [exchangeRates.address, flexibleStorage.address, systemSettings.address],
      ]),
    })
    calls.push({
      target: addressResolver.address,
      callData: addressResolver.interface.encodeFunctionData('rebuildCaches', [
        [exchangeRates.address, sandboxAmm.address, systemSettings.address],
      ]),
    })
    calls.push({
      target: exchangeRates.address,
      callData: exchangeRates.interface.encodeFunctionData('setDexPriceAggregator', [this.config.dexPriceAggregator]),
    })
    for (const [synth, aggregator] of Object.entries(this.config.chainlinkPriceAggregators)) {
      calls.push({
        target: exchangeRates.address,
        callData: exchangeRates.interface.encodeFunctionData('addAggregator', [synth, aggregator]),
      })
    }
    calls.push({
      target: systemSettings.address,
      callData: systemSettings.interface.encodeFunctionData('setAtomicMaxVolumePerBlock', [
        this.config.atomicSettings.maxVolume,
      ]),
    })
    calls.push({
      target: systemSettings.address,
      callData: systemSettings.interface.encodeFunctionData('setAtomicTwapWindow', [
        this.config.atomicSettings.twapWindow,
      ]),
    })
    for (const [synth, equivalent] of Object.entries(this.config.atomicSettings.synthEquivalents)) {
      calls.push({
        target: systemSettings.address,
        callData: systemSettings.interface.encodeFunctionData('setAtomicEquivalentForDexPricing', [synth, equivalent]),
      })
    }
    for (const [synth, fee] of Object.entries(this.config.atomicSettings.exchangeFeeRates)) {
      calls.push({
        target: systemSettings.address,
        callData: systemSettings.interface.encodeFunctionData('setAtomicExchangeFeeRate', [synth, fee]),
      })
    }
    for (const [synth, buffer] of Object.entries(this.config.atomicSettings.priceBuffers)) {
      calls.push({
        target: systemSettings.address,
        callData: systemSettings.interface.encodeFunctionData('setAtomicPriceBuffer', [synth, buffer]),
      })
    }
    for (const [synth, volWindow] of Object.entries(this.config.atomicSettings.volWindows)) {
      calls.push({
        target: systemSettings.address,
        callData: systemSettings.interface.encodeFunctionData('setAtomicVolatilityConsiderationWindow', [
          synth,
          volWindow,
        ]),
      })
    }
    for (const [synth, threshold] of Object.entries(this.config.atomicSettings.volThresholds)) {
      calls.push({
        target: systemSettings.address,
        callData: systemSettings.interface.encodeFunctionData('setAtomicVolatilityUpdateThreshold', [synth, threshold]),
      })
    }

    await multicall.connect(this.accounts.owner).aggregate(calls)

    return {
      addressResolver,
      exchangeRates,
      flexibleStorage,
      multicall,
      sandboxAmm,
      systemSettings,
    }
  }
}

module.exports = Deployer
