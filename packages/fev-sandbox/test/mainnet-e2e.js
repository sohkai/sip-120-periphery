const { ethers, network } = require('hardhat')
const { expect } = require('chai')
const { toBytes32 } = require('../lib/bytes')
const { ZERO_ADDRESS } = require('../lib/constants')
const Deployer = require('../lib/Deployer')
const { toBn, units } = require('../lib/math')
const { susdBytes, sbtcBytes, sethBytes } = require('../lib/synths')

const config = require('../config/mainnet-e2e')

describe('Mainnet E2E smoke', function () {
  let accounts
  let multicall
  const mirror = {
    addressResolver: undefined,
    exchangeRates: undefined,
    flexibleStorage: undefined,
    sandboxAmm: undefined,
    systemSettings: undefined,
  }

  before('ensure fork node', async () => {
    expect(network.config, 'specified fork node').to.have.nested.property('forking.url').that.exists
    expect(network.config, 'enabled fork').to.have.nested.property('forking.enabled').that.exists

    const connectedBlockNumber = await ethers.provider.getBlockNumber()
    expect(connectedBlockNumber).to.equal(config.forkBlockNumber)
  })

  before('ensure configuration', async () => {
    const expectedContracts = [
      config.usdc,
      config.weth,
      config.wbtc,
      config.synthetix.addressResolver,
      config.synthetix.flexibleStorage,
      config.synthetix.issuer,
      config.synthetix.safeDecimalMath,
      config.dexPriceAggregator,
    ]
    for (const contract of expectedContracts) {
      expect(
        await ethers.provider.getCode(contract),
        `expected contract at ${contract} is indeed contract`
      ).to.not.equal('0x')
    }
    const issuer = await ethers.getContractAt('IIssuer', config.synthetix.issuer)
    for (const synthBytes of [susdBytes, sbtcBytes, sethBytes]) {
      expect(await issuer.synths(synthBytes), `expected synth ${synthBytes} to exist in Issuer`).to.not.addressEqual(
        ZERO_ADDRESS
      )
    }
  })

  before('set owner, depositor', async () => {
    const connectedAccounts = await ethers.getSigners()
    accounts = {
      deployer: connectedAccounts[0],
      owner: connectedAccounts[1],
      depositor: connectedAccounts[2],
    }
    config.owner = accounts.owner.address
    config.depositor = accounts.depositor.address
  })

  before('deploy sandbox', async () => {
    const deployer = new Deployer(accounts, config)
    const deployedContracts = await deployer.deploy()

    for (const [name, contract] of Object.entries(deployedContracts)) {
      expect(
        await ethers.provider.getCode(contract.address),
        `expected contract (${name}) is indeed contract`
      ).to.not.equal('0x')
    }

    for (const name of ['addressResolver', 'exchangeRates', 'flexibleStorage', 'sandboxAmm', 'systemSettings']) {
      mirror[name] = deployedContracts[name]
    }
    multicall = deployedContracts.multicall
  })

  context('OverrideableFallbackAddressResolver', () => {
    it('was set with overrides', async () => {
      const resolvedExchangeRates = await mirror.addressResolver.getAddress(toBytes32('ExchangeRates'))
      const resolvedFlexibleStorage = await mirror.addressResolver.getAddress(toBytes32('FlexibleStorage'))
      expect(resolvedExchangeRates).to.addressEqual(mirror.exchangeRates.address)
      expect(resolvedFlexibleStorage).to.addressEqual(mirror.flexibleStorage.address)
    })

    it('fallbacks to production address resolver', async () => {
      const resolvedIssuer = await mirror.addressResolver.getAddress(toBytes32('Issuer'))
      expect(resolvedIssuer).to.addressEqual(config.synthetix.issuer)
    })
  })

  context('SystemSettings (SIP-120)', () => {
    it('reads SIP-120 configuration', async () => {
      const configuredMaxVolume = await mirror.systemSettings.atomicMaxVolumePerBlock()
      const configuredTwapWindow = await mirror.systemSettings.atomicTwapWindow()
      const configuredEquivalentSusd = await mirror.systemSettings.atomicEquivalentForDexPricing(susdBytes)
      const configuredEquivalentSbtc = await mirror.systemSettings.atomicEquivalentForDexPricing(sbtcBytes)
      const configuredEquivalentSeth = await mirror.systemSettings.atomicEquivalentForDexPricing(sethBytes)
      const configuredFeeSbtc = await mirror.systemSettings.atomicExchangeFeeRate(sbtcBytes)
      const configuredFeeSeth = await mirror.systemSettings.atomicExchangeFeeRate(sethBytes)
      const configuredBufferSbtc = await mirror.systemSettings.atomicPriceBuffer(sbtcBytes)
      const configuredBufferSeth = await mirror.systemSettings.atomicPriceBuffer(sethBytes)
      const configuredVolWindowSbtc = await mirror.systemSettings.atomicVolatilityConsiderationWindow(sbtcBytes)
      const configuredVolWindowSeth = await mirror.systemSettings.atomicVolatilityConsiderationWindow(sethBytes)
      const configuredVolThresholdSbtc = await mirror.systemSettings.atomicVolatilityUpdateThreshold(sbtcBytes)
      const configuredVolThresholdSeth = await mirror.systemSettings.atomicVolatilityUpdateThreshold(sethBytes)

      expect(configuredMaxVolume).to.equal(toBn(config.atomicSettings.maxVolume))
      expect(configuredTwapWindow).to.equal(toBn(config.atomicSettings.twapWindow))
      expect(configuredEquivalentSusd).to.equal(toBn(config.atomicSettings.synthEquivalents[susdBytes]))
      expect(configuredEquivalentSbtc).to.equal(toBn(config.atomicSettings.synthEquivalents[sbtcBytes]))
      expect(configuredEquivalentSeth).to.equal(toBn(config.atomicSettings.synthEquivalents[sethBytes]))
      expect(configuredFeeSbtc).to.equal(toBn(config.atomicSettings.exchangeFeeRates[sbtcBytes]))
      expect(configuredFeeSeth).to.equal(toBn(config.atomicSettings.exchangeFeeRates[sethBytes]))
      expect(configuredBufferSbtc).to.equal(toBn(config.atomicSettings.priceBuffers[sbtcBytes]))
      expect(configuredBufferSeth).to.equal(toBn(config.atomicSettings.priceBuffers[sethBytes]))
      expect(configuredVolWindowSbtc).to.equal(toBn(config.atomicSettings.volWindows[sbtcBytes]))
      expect(configuredVolWindowSeth).to.equal(toBn(config.atomicSettings.volWindows[sethBytes]))
      expect(configuredVolThresholdSbtc).to.equal(toBn(config.atomicSettings.volThresholds[sbtcBytes]))
      expect(configuredVolThresholdSeth).to.equal(toBn(config.atomicSettings.volThresholds[sethBytes]))
    })

    it('can read from production system settings', async () => {
      // Base fee rates set for normal exchanges on production system settings
      const configuredBaseFeeSbtc = await mirror.systemSettings.exchangeFeeRate(sbtcBytes)
      const configuredBaseFeeSeth = await mirror.systemSettings.exchangeFeeRate(sethBytes)

      expect(configuredBaseFeeSbtc).to.equal(units.bpsInEighteen.mul('30'))
      expect(configuredBaseFeeSeth).to.equal(units.bpsInEighteen.mul('25'))
    })
  })

  context('ExchangeRatesWithDexPricing (SIP-120)', () => {
    it('was set with dexPriceAggregator', async () => {
      const configuredDexPriceAggregator = await mirror.exchangeRates.dexPriceAggregator()
      expect(configuredDexPriceAggregator).to.addressEqual(config.dexPriceAggregator)
    })

    it('reads correct SIP-120 configuration', async () => {
      const configuredTwapWindow = await mirror.exchangeRates.atomicTwapWindow()
      const configuredEquivalentSusd = await mirror.exchangeRates.atomicEquivalentForDexPricing(susdBytes)
      const configuredEquivalentSbtc = await mirror.exchangeRates.atomicEquivalentForDexPricing(sbtcBytes)
      const configuredEquivalentSeth = await mirror.exchangeRates.atomicEquivalentForDexPricing(sethBytes)
      const configuredBufferSbtc = await mirror.exchangeRates.atomicPriceBuffer(sbtcBytes)
      const configuredBufferSeth = await mirror.exchangeRates.atomicPriceBuffer(sethBytes)
      const configuredVolWindowSbtc = await mirror.exchangeRates.atomicVolatilityConsiderationWindow(sbtcBytes)
      const configuredVolWindowSeth = await mirror.exchangeRates.atomicVolatilityConsiderationWindow(sethBytes)
      const configuredVolThresholdSbtc = await mirror.exchangeRates.atomicVolatilityUpdateThreshold(sbtcBytes)
      const configuredVolThresholdSeth = await mirror.exchangeRates.atomicVolatilityUpdateThreshold(sethBytes)

      expect(configuredTwapWindow).to.equal(toBn(config.atomicSettings.twapWindow))
      expect(configuredEquivalentSusd).to.equal(toBn(config.atomicSettings.synthEquivalents[susdBytes]))
      expect(configuredEquivalentSbtc).to.equal(toBn(config.atomicSettings.synthEquivalents[sbtcBytes]))
      expect(configuredEquivalentSeth).to.equal(toBn(config.atomicSettings.synthEquivalents[sethBytes]))
      expect(configuredBufferSbtc).to.equal(toBn(config.atomicSettings.priceBuffers[sbtcBytes]))
      expect(configuredBufferSeth).to.equal(toBn(config.atomicSettings.priceBuffers[sethBytes]))
      expect(configuredVolWindowSbtc).to.equal(toBn(config.atomicSettings.volWindows[sbtcBytes]))
      expect(configuredVolWindowSeth).to.equal(toBn(config.atomicSettings.volWindows[sethBytes]))
      expect(configuredVolThresholdSbtc).to.equal(toBn(config.atomicSettings.volThresholds[sbtcBytes]))
      expect(configuredVolThresholdSeth).to.equal(toBn(config.atomicSettings.volThresholds[sethBytes]))
    })

    it('can query price and volatility', async () => {
      const queriedPrice = await mirror.exchangeRates.effectiveAtomicValueAndRates(
        sethBytes,
        units.oneInEighteen,
        susdBytes
      )
      expect(queriedPrice.value).to.be.closeTo(units.oneInEighteen.mul(toBn(2918)), units.oneInEighteen)

      // Note that the fork block (13293100) was chosen such that ETH/USD was in a non-volatile period
      const queriedTooVol = await mirror.exchangeRates.synthTooVolatileForAtomicExchange(sethBytes)
      expect(queriedTooVol).to.be.false
    })
  })

  context('SynthetixSandboxAMM', () => {
    it('was wired correctly with address resolver', async () => {
      const resolvedExchangeRates = await mirror.sandboxAmm.exchangeRates()
      const resolvedFlexibleStorage = await mirror.sandboxAmm.flexibleStoragePublic()
      const resolvedIssuer = await mirror.sandboxAmm.issuer()

      // From overriden address resolver
      expect(resolvedExchangeRates).to.addressEqual(mirror.exchangeRates.address)
      expect(resolvedFlexibleStorage).to.addressEqual(mirror.flexibleStorage.address)

      // From production address resolver
      expect(resolvedIssuer).to.addressEqual(config.synthetix.issuer)
    })

    it('reads correct SIP-120 configuration', async () => {
      const configuredMaxVolume = await mirror.sandboxAmm.atomicMaxVolumePerBlock()
      const configuredTwapWindow = await mirror.sandboxAmm.atomicTwapWindow()
      const configuredEquivalentSusd = await mirror.sandboxAmm.atomicEquivalentForDexPricing(susdBytes)
      const configuredEquivalentSbtc = await mirror.sandboxAmm.atomicEquivalentForDexPricing(sbtcBytes)
      const configuredEquivalentSeth = await mirror.sandboxAmm.atomicEquivalentForDexPricing(sethBytes)
      const configuredFeeSbtc = await mirror.sandboxAmm.atomicExchangeFeeRate(sbtcBytes)
      const configuredFeeSeth = await mirror.sandboxAmm.atomicExchangeFeeRate(sethBytes)
      const configuredBufferSbtc = await mirror.sandboxAmm.atomicPriceBuffer(sbtcBytes)
      const configuredBufferSeth = await mirror.sandboxAmm.atomicPriceBuffer(sethBytes)
      const configuredVolWindowSbtc = await mirror.sandboxAmm.atomicVolatilityConsiderationWindow(sbtcBytes)
      const configuredVolWindowSeth = await mirror.sandboxAmm.atomicVolatilityConsiderationWindow(sethBytes)
      const configuredVolThresholdSbtc = await mirror.sandboxAmm.atomicVolatilityUpdateThreshold(sbtcBytes)
      const configuredVolThresholdSeth = await mirror.sandboxAmm.atomicVolatilityUpdateThreshold(sethBytes)

      expect(configuredMaxVolume).to.equal(toBn(config.atomicSettings.maxVolume))
      expect(configuredTwapWindow).to.equal(toBn(config.atomicSettings.twapWindow))
      expect(configuredEquivalentSusd).to.equal(toBn(config.atomicSettings.synthEquivalents[susdBytes]))
      expect(configuredEquivalentSbtc).to.equal(toBn(config.atomicSettings.synthEquivalents[sbtcBytes]))
      expect(configuredEquivalentSeth).to.equal(toBn(config.atomicSettings.synthEquivalents[sethBytes]))
      expect(configuredFeeSbtc).to.equal(toBn(config.atomicSettings.exchangeFeeRates[sbtcBytes]))
      expect(configuredFeeSeth).to.equal(toBn(config.atomicSettings.exchangeFeeRates[sethBytes]))
      expect(configuredBufferSbtc).to.equal(toBn(config.atomicSettings.priceBuffers[sbtcBytes]))
      expect(configuredBufferSeth).to.equal(toBn(config.atomicSettings.priceBuffers[sethBytes]))
      expect(configuredVolWindowSbtc).to.equal(toBn(config.atomicSettings.volWindows[sbtcBytes]))
      expect(configuredVolWindowSeth).to.equal(toBn(config.atomicSettings.volWindows[sethBytes]))
      expect(configuredVolThresholdSbtc).to.equal(toBn(config.atomicSettings.volThresholds[sbtcBytes]))
      expect(configuredVolThresholdSeth).to.equal(toBn(config.atomicSettings.volThresholds[sethBytes]))
    })

    it('can sweep tokens', async () => {
      // Deploy token
      const mockTokenFactory = await ethers.getContractFactory('MockToken')
      const mockToken = await mockTokenFactory.deploy('Mock', 'MOCK', '18')
      await mockToken.deployed()

      // Deposit
      const tokenAmount = units.oneInEighteen
      await mockToken.transfer(mirror.sandboxAmm.address, tokenAmount)

      // Sweep
      await mirror.sandboxAmm.connect(accounts.depositor).sweepAll([mockToken.address])
      const depositorNowBal = await mockToken.balanceOf(config.depositor)
      const sandboxAmmNowBal = await mockToken.balanceOf(mirror.sandboxAmm.address)

      expect(depositorNowBal).to.equal(tokenAmount)
      expect(sandboxAmmNowBal).to.equal(toBn('0'))
    })

    it('can sweep eth', async () => {
      const depositorPrevBal = await ethers.provider.getBalance(config.depositor)

      // Deploy force send contract
      const selfdestructFactory = await ethers.getContractFactory('Selfdestruct')
      const selfdestruct = await selfdestructFactory.deploy()
      await selfdestruct.deployed()

      // Deposit
      const ethAmount = units.oneInEighteen
      await accounts.owner.sendTransaction({
        to: selfdestruct.address,
        value: ethAmount,
      })

      // Force send eth
      await selfdestruct.destruct(mirror.sandboxAmm.address)

      // Sweep
      await mirror.sandboxAmm.connect(accounts.depositor).sweepEth()
      const depositorNowBal = await ethers.provider.getBalance(config.depositor)
      const sandboxAmmNowBal = await ethers.provider.getBalance(mirror.sandboxAmm.address)

      expect(depositorNowBal).to.be.closeTo(
        depositorPrevBal.add(ethAmount),
        units.oneInEighteen.div(toBn('1000')) // factor in gas cost of sweep
      )
      expect(sandboxAmmNowBal).to.equal(toBn('0'))
    })
  })

  // These tests must go last--they change global state that earlier tests may be dependent on
  context('Mutations', async () => {
    it('can change SIP-120 configuration', async () => {
      const newMaxVolume = config.atomicSettings.maxVolume.add(units.oneInEighteen.mul('1000'))
      const newTwapWindow = toBn(config.atomicSettings.twapWindow).add(toBn('60'))

      // Set
      const calls = []
      calls.push({
        target: mirror.systemSettings.address,
        callData: mirror.systemSettings.interface.encodeFunctionData('setAtomicMaxVolumePerBlock', [newMaxVolume]),
      })
      calls.push({
        target: mirror.systemSettings.address,
        callData: mirror.systemSettings.interface.encodeFunctionData('setAtomicTwapWindow', [newTwapWindow]),
      })

      await multicall.connect(accounts.owner).aggregate(calls)

      // Read
      const configuredMaxVolume = await mirror.systemSettings.atomicMaxVolumePerBlock()
      const configuredTwapWindow = await mirror.systemSettings.atomicTwapWindow()
      expect(configuredMaxVolume).to.equal(newMaxVolume)
      expect(configuredTwapWindow).to.equal(newTwapWindow)
    })

    it('can atomically exchange', async () => {
      // Impersonate account with synth balance
      const addressWithSynths = '0x298EcCfb4317E66c7EE6a7D0CB5cbedB85A30205'
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [addressWithSynths],
      })

      const accountWithSynths = await ethers.getSigner(addressWithSynths)

      // Fetch sUSD, sETH
      const issuer = await ethers.getContractAt('IIssuer', config.synthetix.issuer)
      const sethAddress = await issuer.synths(sethBytes)
      const susdAddress = await issuer.synths(susdBytes)
      const seth = await ethers.getContractAt('ERC20', sethAddress)
      const susd = await ethers.getContractAt('ERC20', susdAddress)

      const sethBal = await seth.balanceOf(addressWithSynths)
      const susdBal = await susd.balanceOf(addressWithSynths)

      expect(sethBal).to.be.closeTo(units.oneInEighteen.div(toBn('10')), units.oneInEighteen.div(toBn('100'))) // ~0.1 sETH
      expect(susdBal).to.be.closeTo(units.oneInEighteen.mul(toBn('220')), units.oneInEighteen) // ~220 sUSD

      // Transfer sETH into sandbox
      await seth.connect(accountWithSynths).transfer(mirror.sandboxAmm.address, sethBal)
      const sandboxSethBal = await seth.balanceOf(mirror.sandboxAmm.address)
      expect(sandboxSethBal).to.not.equal(toBn('0'))

      // Approve and atomically exchange sUSD -> sETH
      await susd.connect(accountWithSynths).approve(mirror.sandboxAmm.address, susdBal)
      await mirror.sandboxAmm.connect(accountWithSynths).exchangeAtomically(
        susdBytes, // source
        susdBal, // amount
        sethBytes // dest
      )

      // Get balances after exchange
      const newSethBal = await seth.balanceOf(addressWithSynths)
      const newSusdBal = await susd.balanceOf(addressWithSynths)
      const newSandboxSethBal = await seth.balanceOf(mirror.sandboxAmm.address)
      const newSandboxSusdBal = await susd.balanceOf(mirror.sandboxAmm.address)

      // sETH now split between sandbox and user
      expect(newSethBal).to.be.gt(toBn('0'))
      expect(newSandboxSethBal).to.be.lt(sandboxSethBal)
      expect(newSethBal.add(newSandboxSethBal)).to.equal(sethBal)

      // User's entire sUSD balance was traded into sandbox
      expect(newSusdBal).to.equal(toBn('0'))
      expect(newSandboxSusdBal).to.equal(susdBal)
    })
  })
})
