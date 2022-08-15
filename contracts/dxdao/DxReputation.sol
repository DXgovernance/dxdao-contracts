pragma solidity 0.8.8;

import "@openzeppelin/contracts-upgradeable/ownership/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/contracts/token/ERC20/extensions/ERC29SnapshotUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title Reputation system
 * @dev A DAO has Reputation System which allows peers to rate other peers in order to build trust .
 * A reputation is use to assign influence measure to a DAO'S peers.
 * Reputation is similar to regular tokens but with one crucial difference: It is non-transferable.
 * The Reputation contract maintain a map of address to reputation value.
 * It provides an onlyOwner functions to mint and burn reputation _to (or _from) a specific address.
 */
contract Reputation is Ownable, Initializable, ERC20SnapshotUpgradeable {
    function initialize(string memory name, string memory symbol) public initializer {
        _ERC20_init(name, symbol);
        _Ownable_init();
    }

    function mint (address memory  _user, uint256 memory _amount) public onlyOwner {
        require(token.balanceOf(msg.sender) >= _amount);
        token.transfer(msg.sender, _amount);
        token.transfer(_to, _amount);
        emit Mint(_to, _amount);
    }

    // @notice Generates `_amount` reputation that are assigned to `_owner`
    // @param _user The address that will be assigned the new reputation
    // @param _amount The quantity of reputation generated
    // @return True if the reputation are generated correctly
    function mintMultiple(address[] memory _user, uint256[] memory _amount) public onlyOwner returns (bool) {
        for (uint256 i = 0; i < _user.length; i++) {
            uint256 curTotalSupply = totalSupply();
            require(curTotalSupply + _amount[i] >= curTotalSupply); // Check for overflow
            uint256 previousBalanceTo = balanceOf(_user[i]);
            require(previousBalanceTo + _amount[i] >= previousBalanceTo); // Check for overflow
            updateValueAtNow(totalSupplyHistory, curTotalSupply + _amount[i]);
            updateValueAtNow(balances[_user[i]], previousBalanceTo + _amount[i]);
            emit Mint(_user[i], _amount[i]);
        }
        return true;
    }

    // @notice Burns `_amount` reputation from `_owner`
    // @param _user The address that will lose the reputation
    // @param _amount The quantity of reputation to burn
    // @return True if the reputation are burned correctly
    function burn(address _user, uint256 _amount) public onlyOwner returns (bool) {
        uint256 curTotalSupply = totalSupply();
        uint256 amountBurned = _amount;
        uint256 previousBalanceFrom = balanceOf(_user);
        if (previousBalanceFrom < amountBurned) {
            amountBurned = previousBalanceFrom;
        }
        updateValueAtNow(totalSupplyHistory, curTotalSupply - amountBurned);
        updateValueAtNow(balances[_user], previousBalanceFrom - amountBurned);
        emit Burn(_user, amountBurned);
        return true;
    }

    function burnMultiplie(address[] memory _user, uint256 _amount) public onlyOwner returns (bool) {
        for (uint256 i = 0; i < _user.length; i++) {
            uint256 curTotalSupply = totalSupply();
            uint256 amountBurned = _amount;
            uint256 previousBalanceFrom = balanceOf(_user[i]);
            if (previousBalanceFrom < amountBurned) {
                amountBurned = previousBalanceFrom;
            }
            updateValueAtNow(totalSupplyHistory, curTotalSupply - amountBurned);
            updateValueAtNow(balances[_user[i]], previousBalanceFrom - amountBurned);
            emit Burn(_user[i], amountBurned);
        }
        return true;
    }
}
