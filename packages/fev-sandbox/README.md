# FEV Sandbox

Limited sandbox environment closely mirroring production Synthetix via `AddressResolver` and `SystemSettings` overloads.

## Deployment

- Mainnet:
  - [SandboxAmm: `0xACd76794a430E337958F332562ecC6575a164fEE`](https://etherscan.io/address/0xacd76794a430e337958f332562ecc6575a164fee#code)
    - [Owner (Multicall): `0x386d4369003dBD3aa0B35345303D1fA28f3054d6`](https://etherscan.io/address/0x386d4369003dbd3aa0b35345303d1fa28f3054d6#code)
    - [AddressResolver: `0x33A0eEfaB850A842d3C203751fC287d6d402B0D7`](https://etherscan.io/address/0x33a0eefab850a842d3c203751fc287d6d402b0d7#code)
    - [FlexibleStorage: `0x7c8A9AecfCF1072E3306B332298F358fDc0Ae88e`](https://etherscan.io/address/0x7c8a9aecfcf1072e3306b332298f358fdc0ae88e#code)
    - [SystemSettings: `0xAf9fDA30febf5f9cF2B3D7F9A66bfD4862B87D48`](https://etherscan.io/address/0xaf9fda30febf5f9cf2b3d7f9a66bfd4862b87d48#code)
    - [ExchangeRates: `0x3442D4bD7550eB9934b823D21d78005F883e9De5`](https://etherscan.io/address/0x3442d4bd7550eb9934b823d21d78005f883e9de5#code)

For the available synths and current configuration, see the [mainnet configuration file](./config/mainnet.js).

## Usage

### `SynthetixSandboxAmm#exchangeAtomically()`

Atomically exchange one synth for another via [SIP-120 mechanism](https://sips.synthetix.io/sips/sip-120).

Arguments:

- `sourceCurrencyKey`: input synth to trade in
- `sourceAmount`: input synth amount
- `destinationCurrencyKey`: output synth to receive

#### Flow:

1. Ensure enough output synths are available in [`SynthetixSandboxAmm`](https://etherscan.io/address/0xacd76794a430e337958f332562ecc6575a164fee#code) (or deposit some)
1. Approve synths from account for [`SynthetixSandboxAmm`](https://etherscan.io/address/0xacd76794a430e337958f332562ecc6575a164fee#code)
1. Execute order through `SynthetixSandboxAmm#exchangeAtomically()`

[An example of the flow can be see in the mainnet E2E tests](./test/mainnet-e2e.js#L302-L352).

### `SynthetixSandboxAmm#getAmountsForAtomicExchange()`

Fetch the amount to receive, fee taken, and fee rate applied for a desired atomic exchange.

Arguments:

- `sourceCurrencyKey`: input synth to trade in
- `sourceAmount`: input synth amount
- `destinationCurrencyKey`: output synth to receive

Returns:

- `amountReceived`: output synth amount
- `fee`: fee taken (denominated in output synth)
- `exchangeFeeRate`: fee rate for exchange

### `ExchangeRatesWithDexPricing#synthTooVolatileForAtomicExchange()`

Whether the given synth's price is too volatile to atomically exchange at the moment.

Arguments:

- `currencyKey`: synth to check

Returns:

- `tooVolatile`: whether the synth's price is deemed too volatile
