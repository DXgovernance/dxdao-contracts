// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;


import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC20SnapshotRep
*/
contract ERC20SnapshotRep is ERC20Snapshot, Ownable {
  
  constructor(
      string memory name,
      string memory symbol
  ) ERC20(name, symbol) {}

  function snapshot() public {
      _snapshot();
  }

  function getCurrentSnapshotId() public view virtual returns (uint256) {
      return _getCurrentSnapshotId();
  }
  
  function mint(address to, uint256 amount) onlyOwner public virtual {
      _mint(to, amount);
  }
  
  function burn(address to, uint256 amount) onlyOwner public virtual {
      _burn(to, amount);
  }
  
  function _beforeTokenTransfer(
      address from,
      address to,
      uint256 amount
  ) internal virtual override {
      revert("ERC20SnapshotRep: token transfers disabled");
  }
  
}
