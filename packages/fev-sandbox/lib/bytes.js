const ethers = require('ethers')

function toBytes32(str) {
  return ethers.utils.hexlify(ethers.utils.toUtf8Bytes(str)).padEnd(66, '0')
}

module.exports = {
  toBytes32,
}
