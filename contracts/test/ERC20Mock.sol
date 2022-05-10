pragma solidity 0.5.17;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

// mock class using ERC20
contract ERC20Mock is ERC20, ERC20Detailed {
    constructor(
        address initialAccount,
        uint256 initialBalance,
        string memory symbol,
        string memory name,
        uint8 decimals
    ) public ERC20Detailed(symbol, name, decimals) {
        _mint(initialAccount, initialBalance);
    }
}
