// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.8;

import "@openzeppelin-contracts-upgradeable/contracts/access/OwnableUpgradeable.sol";
import "@openzeppelin-contracts-upgradeable/contracts/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "@openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol";

/**
 * @title Reputation system
 * @dev A DAO has Reputation System which allows peers to rate other peers in order to build trust .
 * A reputation is use to assign influence measure to a DAO'S peers.
 * Reputation is similar to regular tokens but with one crucial difference: It is non-transferable.
 * The Reputation contract maintain a map of address to reputation value.
 * It provides an onlyOwner functions to mint and burn reputation _to (or _from) a specific address.
 */
contract Reputation is Initializable, OwnableUpgradeable, ERC20SnapshotUpgradeable {
    event Mint(address indexed _to, uint256 _amount);
    event Burn(address indexed _from, uint256 _amount);

    function initialize(string memory name, string memory symbol) public initializer {
        __ERC20_init(name, symbol);
        __Ownable_init();
    }

    // @notice Generates `_amount` reputation that are assigned to `_user`
    // @param _user The address that will be assigned the new reputation
    // @param _amount The quantity of reputation generated
    // @return True if the reputation are generated correctly
    function mint(address _user, uint256 _amount) public onlyOwner returns (bool) {
        _mint(_user, _amount);
        _snapshot();
        emit Mint(_user, _amount);
        return true;
    }

    function mintMultiple(address[] memory _user, uint256[] memory _amount) public onlyOwner returns (bool) {
        for (uint256 i = 0; i < _user.length; i++) {
            _mint(_user[i], _amount[i]);
            _snapshot();
            emit Mint(_user[i], _amount[i]);
        }
        return true;
    }

    // @notice Burns `_amount` reputation from `_user`
    // @param _user The address that will lose the reputation
    // @param _amount The quantity of reputation to burn
    // @return True if the reputation are burned correctly
    function burn(address _user, uint256 _amount) public onlyOwner returns (bool) {
        _burn(_user, _amount);
        _snapshot();
        emit Burn(_user, _amount);
        return true;
    }

    function burnMultiple(address[] memory _user, uint256 _amount) public onlyOwner returns (bool) {
        for (uint256 i = 0; i < _user.length; i++) {
            _burn(_user[i], _amount);
            _snapshot();
            emit Burn(_user[i], _amount);
        }
        return true;
    }
}
