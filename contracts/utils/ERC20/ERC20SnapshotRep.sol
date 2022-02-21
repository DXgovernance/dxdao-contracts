// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title ERC20SnapshotRep
 */
contract ERC20SnapshotRep is
    Initializable,
    OwnableUpgradeable,
    ERC20SnapshotUpgradeable
{
    function initialize(string memory name, string memory symbol)
        public
        initializer
    {
        __ERC20_init(name, symbol);
        __Ownable_init();
    }

    function snapshot() public {
        _snapshot();
    }

    function getCurrentSnapshotId() public view virtual returns (uint256) {
        return _getCurrentSnapshotId();
    }

    function mint(address to, uint256 amount) public virtual onlyOwner {
        _snapshot();
        _mint(to, amount);
    }

    function burn(address to, uint256 amount) public virtual onlyOwner {
        _snapshot();
        _burn(to, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override onlyOwner {}
}
