// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ERC721Token
 */
contract ERC721Token is Initializable, ERC721Upgradeable {
    function initialize(string memory name, string memory symbol) public initializer {
        __ERC721_init(name, symbol);
    }
}
