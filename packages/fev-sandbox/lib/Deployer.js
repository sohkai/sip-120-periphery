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
    if (!accounts.deployer || !accounts.owner) {
      throw new Error('Deployer requires unlocked deployer and owner accounts')
    }

    this.accounts = accounts
    this.config = config
    this.deployedContracts = {}
  }

  async deploy({ verbose } = {}) {
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
    if (verbose) {
      console.log('Deploying sandbox with configuration:')
      console.log(`  - deployer: ${this.accounts.deployer.address}`)
      console.log(`  - owner: ${this.config.owner}`)
      console.log(`  - multicall:`)
      console.log(`    - owner: ${this.config.owner}`)
      console.log(`  - addressResolver:`)
      console.log(`    - owner: multicall`)
      console.log(`    - fallback: ${this.config.synthetix.addressResolver}`)
      console.log(`  - flexibleStorage:`)
      console.log(`    - resolver: addressResolver`)
      console.log(`    - fallback: ${this.config.synthetix.flexibleStorage}`)
      console.log(`  - systemSettings:`)
      console.log(`    - owner: multicall`)
      console.log(`    - resolver: addressResolver`)
      console.log(`  - exchangeRates:`)
      console.log(`    - owner: multicall`)
      console.log(`    - oracle: address(0)`)
      console.log(`    - resolver: addressResolver`)
      console.log(`  - sandboxAmm:`)
      console.log(`    - owner: ${this.config.depositor}`)
      console.log(`    - resolver: addressResolver`)
      console.log()
    }

    const multicall = await OwnedMulticallFactory.deploy(this.config.owner)
    if (verbose) {
      console.log(`Deploying multicall with tx: ${multicall.deployTransaction.hash}`)
    }

    const addressResolver = await overrideableFallbackAddressResolverFactory.deploy(
      multicall.address,
      this.config.synthetix.addressResolver
    )
    if (verbose) {
      console.log(`Deploying addressResolver with tx: ${addressResolver.deployTransaction.hash}`)
    }

    const flexibleStorage = await overrideableFallbackFlexibleStorageFactory.deploy(
      addressResolver.address,
      this.config.synthetix.flexibleStorage
    )
    if (verbose) {
      console.log(`Deploying flexibleStorage with tx: ${flexibleStorage.deployTransaction.hash}`)
    }
    await flexibleStorage.deployed()

    const systemSettings = await sip120SystemSettingsFactory.deploy(multicall.address, addressResolver.address)
    if (verbose) {
      console.log(`Deploying systemSettings with tx: ${systemSettings.deployTransaction.hash}`)
    }

    const exchangeRates = await sip120ExchangeRatesWithDexPricingFactory.deploy(
      multicall.address, // owner
      ZERO_ADDRESS, // oracle
      addressResolver.address, // address resolver
      [], // currencyKeys
      [] // rates
    )
    if (verbose) {
      console.log(`Deploying exchangeRates with tx: ${exchangeRates.deployTransaction.hash}`)
    }
    await exchangeRates.deployed()

    const sandboxAmm = await synthetixSandboxAmmFactory.deploy(this.config.depositor, addressResolver.address)
    if (verbose) {
      console.log(`Deploying sandboxAmm with tx: ${sandboxAmm.deployTransaction.hash}`)
    }

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

    await multicall.deployed()
    await addressResolver.deployed()
    await systemSettings.deployed()
    await sandboxAmm.deployed()
    const callsTx = await multicall.connect(this.accounts.owner).aggregate(calls)
    if (verbose) {
      console.log(`Setting configuration with multicall tx: ${callsTx.hash}`)
    }

    this.deployedContracts = {
      addressResolver,
      exchangeRates,
      flexibleStorage,
      multicall,
      sandboxAmm,
      systemSettings,
    }
    if (verbose) {
      console.log()
      console.log('Deployed contracts to:')
      console.log(`  - multicall: ${multicall.address}`)
      console.log(`  - addressResolver: ${addressResolver.address}`)
      console.log(`  - flexibleStorage: ${flexibleStorage.address}`)
      console.log(`  - systemSettings: ${systemSettings.address}`)
      console.log(`  - exchangeRates: ${exchangeRates.address}`)
      console.log(`  - sandboxAmm: ${sandboxAmm.address}`)
    }
    return this.deployedContracts
  }

  async verify() {
    console.log('Verifying deployed contracts on Etherscan...')
    console.log('  verifying addressResolver...')
    await hre.run('verify:verify', {
      address: this.deployedContracts.addressResolver.address,
      constructorArguments: [this.deployedContracts.multicall.address, this.config.synthetix.addressResolver],
    })
    console.log('  verifying flexibleStorage...')
    await hre.run('verify:verify', {
      address: this.deployedContracts.flexibleStorage.address,
      constructorArguments: [this.deployedContracts.addressResolver.address, this.config.synthetix.flexibleStorage],
    })
    console.log('  verifying multicall...')
    await hre.run('verify:verify', {
      address: this.deployedContracts.multicall.address,
      constructorArguments: [this.config.owner],
    })
    console.log('  verifying sandboxAmm...')
    await hre.run('verify:verify', {
      address: this.deployedContracts.sandboxAmm.address,
      constructorArguments: [this.config.depositor, this.deployedContracts.addressResolver.address],
    })

    console.log(
      'Verification complete. Some contracts require manual verification: ExchangeRatesWithDexPricing, SystemSettings'
    )
  }
}

module.exports = Deployer
