const hre = require('hardhat')
const inquirer = require('inquirer')
const Deployer = require('../lib/Deployer')

const mainnetConfig = require('../config/mainnet')

async function sleep(ms) {
  return new Promise(r => {
    setTimeout(r, ms)
  })
}

async function sanity(config) {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== 1) {
    console.log(`Wrong chain id! Expected 1 (mainnet), got: ${network.chainId}`)
    throw new Error('Wrong chain id')
  }

  if (!hre.config.etherscan.apiKey) {
    console.log('Missing Etherscan API key!')
    throw new Error('Missing Etherscan API key')
  }

  const accounts = await hre.ethers.getSigners()
  if (accounts[0].address !== ethers.utils.getAddress(config.owner)) {
    console.log(`Account mismatch! Expected ${config.owner} to be unlocked, got: ${accounts[0].address}`)
    throw new Error('Account mismatch')
  }
}

async function confirm(config) {
  console.log('Will deploy sandbox environment with the following config:')
  for (const name of ['owner', 'depositor', 'dexPriceAggregator']) {
    console.log(`  - ${name}: ${config[name]}`)
  }
  console.log('  - synthetix prod:')
  Object.entries(config.synthetix).forEach(([k, v]) => {
    console.log(`    - ${k}: ${v}`)
  })
  console.log('  - sip-120 settings:')
  Object.entries(config.atomicSettings).forEach(([k, v]) => {
    if (typeof v === 'object' && !hre.ethers.BigNumber.isBigNumber(v)) {
      console.log(`    - ${k}:`)
      Object.entries(v).forEach(([k, v]) => {
        console.log(`      - ${k}: ${v.toString()}`)
      })
    } else {
      console.log(`    - ${k}: ${v.toString()}`)
    }
  })
  console.log()

  const accounts = await hre.ethers.getSigners()
  console.log(`From address: ${accounts[0].address}`)
  console.log()

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Proceed?',
      default: false,
    },
  ])

  return confirmed
}

async function deploy(config) {
  const connectedAccounts = await hre.ethers.getSigners()
  const accounts = {
    deployer: connectedAccounts[0],
    owner: connectedAccounts[0],
  }

  const deployer = new Deployer(accounts, config)
  const deployedContracts = await deployer.deploy({ verbose: true })
  return deployer
}

async function verify(deployer) {
  await deployer.verify()
  await verify(deployedContracts)
}

async function main() {
  console.log(`Connecting to ${hre.network.name}...`)
  console.log()

  await sanity(mainnetConfig)
  if (!(await confirm(mainnetConfig))) {
    console.log('Aborting...')
    return
  }
  console.log()

  // Ok, go ahead and deploy
  const deployer = await deploy(mainnetConfig)
  console.log()
  await sleep(20000) // Give etherscan some buffer time to reduce chances of verification failing
  await deployer.verify()

  console.log()
  console.log('All done :)')
}

// Recommended pattern
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
