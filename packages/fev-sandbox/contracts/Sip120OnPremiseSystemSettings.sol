pragma solidity ^0.5.16;

import "./synthetix/interfaces/ISystemSettings.sol";
import "./synthetix/Owned.sol";

contract Sip120OnPremiseSystemSettings is Owned {
    ISystemSettings public fallbackSettings;

    uint public atomicMaxVolumePerBlock;
    uint public atomicTwapWindow;
    mapping(bytes32 => address) atomicEquivalentForDexPricing;
    mapping(bytes32 => uint) atomicExchangeFeeRate;
    mapping(bytes32 => uint) atomicPriceBuffer;
    mapping(bytes32 => uint) atomicVolatilityConsiderationWindow;
    mapping(bytes32 => uint) atomicVolatilityUpdateThreshold;

    constructor(address _owner, ISystemSettings _fallbackSettings) public Owned(_owner) {
        fallbackSettings = _fallbackSettings;
    }

    /// @dev Fallback to the "real" SystemSettings contract for any unknown calls
    function() external {
        assembly {
            let free_ptr := mload(0x40)
            calldatacopy(free_ptr, 0, calldatasize)

            /* We must explicitly forward ether to the underlying contract as well. */
            let result := call(gas, sload(fallbackSettings_slot), callvalue, free_ptr, calldatasize, 0, 0)
            returndatacopy(free_ptr, 0, returndatasize)

            if iszero(result) {
                revert(free_ptr, returndatasize)
            }
            return(free_ptr, returndatasize)
        }
    }

    // ========== RESTRICTED ==========

    function setAtomicMaxVolumePerBlock(uint _maxVolume) external onlyOwner {
        atomicMaxVolumePerBlock = _maxVolume;
    }

    function setAtomicTwapWindow(uint _window) external onlyOwner {
        atomicTwapWindow = _window;
    }

    function setAtomicEquivalentForDexPricing(bytes32 _currencyKey, address _equivalent) external onlyOwner {
        atomicEquivalentForDexPricing[_currencyKey] = _equivalent;
    }

    function setAtomicExchangeFeeRate(bytes32 _currencyKey, uint256 _exchangeFeeRate) external onlyOwner {
        atomicExchangeFeeRate[_currencyKey] = _exchangeFeeRate;
    }

    function setAtomicPriceBuffer(bytes32 _currencyKey, uint _buffer) external onlyOwner {
        atomicPriceBuffer[_currencyKey] = _buffer;
    }

    function setAtomicVolatilityConsiderationWindow(bytes32 _currencyKey, uint _window) external onlyOwner {
        atomicVolatilityConsiderationWindow[_currencyKey] = _window;
    }

    function setAtomicVolatilityUpdateThreshold(bytes32 _currencyKey, uint _threshold) external onlyOwner {
        atomicVolatilityUpdateThreshold[_currencyKey] = _threshold;
    }
}
