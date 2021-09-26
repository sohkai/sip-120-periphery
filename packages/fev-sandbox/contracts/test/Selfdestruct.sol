pragma solidity ^0.5.16;

contract Selfdestruct {
    function() external payable {}

    function destruct(address payable payee) external {
        selfdestruct(payee);
    }
}
