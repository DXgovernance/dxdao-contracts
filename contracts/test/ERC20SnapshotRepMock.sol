pragma solidity 0.8.8;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "../utils/ERC20/ERC20SnapshotRep.sol";

// mock class using ERC20SnapshotRep
// @dev We want to expose the internal functions and test them
contract ERC20SnapshotRepMock is ERC20SnapshotUpgradeable, ERC20SnapshotRep {
    constructor() {}

    function mint(address to, uint256 amount) public override {
        _mint(to, amount);
    }

    function _addHolders(address account) public returns (bool) {
        return addHolders(account);
    }

    function _removeHolders(address account) public returns (bool) {
        return removeHolders(account);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20SnapshotRep, ERC20SnapshotUpgradeable) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
