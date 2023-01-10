// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.0;

import "./../utils/IPermissionRegistry.sol";
import "./../erc20guild/implementations/ZodiacERC20Guild.sol";

contract TestAvatar {
    address public module;

    error NotAuthorized(address unacceptedAddress);

    receive() external payable {}

    function enableModule(address _module) external {
        module = _module;
    }

    function initPermissions(IPermissionRegistry _permissionRegistry) external {
        _permissionRegistry.setETHPermission(address(this), module, ZodiacERC20Guild.setAvatar.selector, 0, true);
        _permissionRegistry.setETHPermission(address(this), module, ZodiacERC20Guild.setMultisend.selector, 0, true);
        _permissionRegistry.setETHPermission(address(this), module, ZodiacERC20Guild.setConfig.selector, 0, true);
        _permissionRegistry.setETHPermission(address(this), module, ZodiacERC20Guild.transferETH.selector, 0, true);
    }

    function exec(
        address payable to,
        uint256 value,
        bytes calldata data
    ) external {
        bool success;
        bytes memory response;
        (success, response) = to.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(response, 0x20), mload(response))
            }
        }
    }

    function execTransactionFromModule(
        address payable to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external returns (bool success) {
        if (msg.sender != module) revert NotAuthorized(msg.sender);
        if (operation == 1) (success, ) = to.delegatecall(data);
        else (success, ) = to.call{value: value}(data);
    }
}
