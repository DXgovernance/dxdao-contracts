// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title GlobalPermissionRegistry.
 * @dev A registry of smart contracts functions and ERC20 transfers that are allowed to be called between contracts.
 * A time delay in seconds over the permissions can be set form any contract, this delay would be added to any new
 * permissions sent by that address.
 * The registry allows setting "wildcard" permissions for recipients and functions, this means that permissions like
 * this contract can call any contract, this contract can call this function to any contract or this contract call
 * call any function in this contract can be set.
 * The smart contracts permissions are stored  using the asset 0x0 and stores the `from` address, `to` address,
 *   `value` uint256 and `fromTime` uint256, if `fromTime` is zero it means the function is not allowed.
 * The ERC20 transfer permissions are stored using the asset of the ERC20 and stores the `from` address, `to` address,
 *   `value` uint256 and `fromTime` uint256, if `fromTime` is zero it means the function is not allowed.
 */

contract GlobalPermissionRegistry {
    using SafeMath for uint256;

    mapping(address => uint256) public permissionDelay;
    address public constant ANY_ADDRESS =
        address(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa);
    bytes4 public constant ANY_SIGNATURE = bytes4(0xaaaaaaaa);

    event PermissionSet(
        address asset,
        address from,
        address to,
        bytes4 functionSignature,
        uint256 fromTime,
        uint256 value
    );

    struct Permission {
        uint256 valueAllowed;
        uint256 fromTime;
        bool isSet;
    }

    // asset address => from address => to address => function call signature allowed => Permission
    mapping(address => mapping(address => mapping(address => mapping(bytes4 => Permission))))
        public permissions;


    /**
     * @dev Set the time delay for a call to show as allowed
     * @param _timeDelay The amount of time that has to pass after permission addition to allow execution
     */
    function setPermissionDelay(uint256 _timeDelay) public {
        permissionDelay[msg.sender] = _timeDelay;
    }

    /**
     * @dev Sets the time from which the function can be executed from a contract to another a with which value.
     * @param asset The asset to be used for the permission address(0) for ETH and other address for ERC20
     * @param to The address that will be called
     * @param functionSignature The signature of the function to be executed
     * @param valueAllowed The amount of value allowed of the asset to be sent
     * @param allowed If the function is allowed or not.
     */
    function setPermission(
        address asset,
        address to,
        bytes4 functionSignature,
        uint256 valueAllowed,
        bool allowed
    ) public {
        require(
            to != address(this),
            "GlobalPermissionRegistry: Cant set permissions to GlobalPermissionRegistry"
        );
        if (allowed) {
            permissions[asset][msg.sender][to][functionSignature].fromTime = block.timestamp
                .add(permissionDelay[msg.sender]);
            permissions[asset][msg.sender][to][functionSignature]
                .valueAllowed = valueAllowed;
        } else {
            permissions[asset][msg.sender][to][functionSignature].fromTime = 0;
            permissions[asset][msg.sender][to][functionSignature]
                .valueAllowed = 0;
        }
        permissions[asset][msg.sender][to][functionSignature].isSet = true;
        emit PermissionSet(
            asset,
            msg.sender,
            to,
            functionSignature,
            permissions[asset][msg.sender][to][functionSignature].fromTime,
            permissions[asset][msg.sender][to][functionSignature].valueAllowed
        );
    }

    /**
     * @dev Get the time delay to be used for an address
     * @param fromAddress The address that will set the permission
     */
    function getPermissionDelay(address fromAddress) public view returns(uint256) {
        return permissionDelay[fromAddress];
    }

    /**
     * @dev Gets the time from which the function can be executed from a contract to another and with which value.
     * In case of now being allowed to do the call it returns zero in both values
     * @param asset The asset to be used for the permission address(0) for ETH and other address for ERC20
     * @param from The address from which the call will be executed
     * @param to The address that will be called
     * @param functionSignature The signature of the function to be executed
     */
    function getPermission(
        address asset,
        address from,
        address to,
        bytes4 functionSignature
    ) public view returns (uint256 valueAllowed, uint256 fromTime) {
        Permission memory permission;

        // If the asset is an ERC20 token check the value allowed to be transferred
        if (asset != address(0)) {
            // Check if there is a value allowed specifically to the `to` address
            if (permissions[asset][from][to][ANY_SIGNATURE].isSet) {
                permission = permissions[asset][from][to][ANY_SIGNATURE];
            }
            // Check if there is a value allowed to any address
            else if (
                permissions[asset][from][ANY_ADDRESS][ANY_SIGNATURE].isSet
            ) {
                permission = permissions[asset][from][ANY_ADDRESS][
                    ANY_SIGNATURE
                ];
            }

            // If the asset is ETH check if there is an allowance to any address and function signature
        } else {
            // Check is there an allowance to the implementation address with the function signature
            if (permissions[asset][from][to][functionSignature].isSet) {
                permission = permissions[asset][from][to][functionSignature];
            }
            // Check is there an allowance to the implementation address for any function signature
            else if (permissions[asset][from][to][ANY_SIGNATURE].isSet) {
                permission = permissions[asset][from][to][ANY_SIGNATURE];
            }
            // Check if there is there is an allowance to any address with the function signature
            else if (
                permissions[asset][from][ANY_ADDRESS][functionSignature].isSet
            ) {
                permission = permissions[asset][from][ANY_ADDRESS][
                    functionSignature
                ];
            }
            // Check if there is there is an allowance to any address and any function
            else if (
                permissions[asset][from][ANY_ADDRESS][ANY_SIGNATURE].isSet
            ) {
                permission = permissions[asset][from][ANY_ADDRESS][
                    ANY_SIGNATURE
                ];
            }
        }
        return (permission.valueAllowed, permission.fromTime);
    }

    /**
     * @dev Gets the time from which the function can be executed from a contract to another.
     * In case of now being allowed to do the call it returns zero in both values
     * @param asset The asset to be used for the permission address(0) for ETH and other address for ERC20
     * @param from The address from which the call will be executed
     * @param to The address that will be called
     * @param functionSignature The signature of the function to be executed
     */
    function getPermissionTime(
        address asset,
        address from,
        address to,
        bytes4 functionSignature
    ) public view returns (uint256) {
        (,uint256 fromTime) = getPermission(asset, from, to, functionSignature);
        return fromTime;
    }

    /**
     * @dev Gets the value allowed from which the function can be executed from a contract to another.
     * In case of now being allowed to do the call it returns zero in both values
     * @param asset The asset to be used for the permission address(0) for ETH and other address for ERC20
     * @param from The address from which the call will be executed
     * @param to The address that will be called
     * @param functionSignature The signature of the function to be executed
     */
    function getPermissionValue(
        address asset,
        address from,
        address to,
        bytes4 functionSignature
    ) public view returns (uint256) {
        (uint256 valueAllowed,) = getPermission(asset, from, to, functionSignature);
        return valueAllowed;
    }
}
