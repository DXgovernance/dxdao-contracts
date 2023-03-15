// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol";

// mock class using ERC20
contract ERC20Mock is ERC20PresetFixedSupply {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialBalance,
        address initialAccount
    ) ERC20PresetFixedSupply(name, symbol, initialBalance, initialAccount) {}

    function nonStandardTransfer(address recipient, uint256 amount) public returns (bool success) {
        return transfer(recipient, amount);
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
