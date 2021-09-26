const ethers = require('ethers')
const linker = require('solc/linker')

function createContractFactoryWithLinks(compilerOutput, { libraries, signer }) {
  const { linkReferences } = compilerOutput.evm.bytecode
  let { object: bytecode } = compilerOutput.evm.bytecode

  Object.keys(linkReferences).forEach((fileName) => {
    Object.keys(linkReferences[fileName]).forEach((contractName) => {
      if (!libraries.hasOwnProperty(contractName)) {
        throw new Error(`Missing link library name ${contractName}`)
      }
      bytecode = linker.linkBytecode(bytecode, {
        [fileName]: {
          [contractName]: libraries[contractName].toLowerCase(),
        },
      })
    })
  })

  return new ethers.ContractFactory(compilerOutput.abi, bytecode, signer)
}

module.exports = {
  createContractFactoryWithLinks,
}
