// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title PermissionRegistry.
 * @dev A registry of smart contracts functions and ERC20 transfers that are allowed to be called between contracts.
 * A time delay in seconds over the permissions can be set form any contract, this delay would be added to any new
 * permissions sent by that address.
 * The PermissionRegistry owner (if there is an owner and owner address is not 0x0) can overwrite/set any permission.
 * The registry allows setting "wildcard" permissions for recipients and functions, this means that permissions like
 * this contract can call any contract, this contract can call this function to any contract or this contract call
 * call any function in this contract can be set.
 * The smart contracts permissions are stored using the asset 0x0 and stores the `from` address, `to` address,
 *   `value` uint256 and `fromTime` uint256, if `fromTime` is zero it means the function is not allowed.
 * The ERC20 transfer permissions are stored using the asset of the ERC20 and stores the `from` address, `to` address,
 *   `value` uint256 and `fromTime` uint256, if `fromTime` is zero it means the function is not allowed.
 * The registry also allows the contracts to keep track on how much value was transferred for every asset in the actual
 * block, it adds the value transferred in all permissions used, this means that if a wildcard value limit is set and
 * a function limit is set it will add the value transferred in both of them.
 */

contract PermissionRegistry is OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

    mapping(address => uint256) public permissionDelay;

    event PermissionSet(
        address from,
        address to,
        bytes4 functionSignature,
        uint256 fromTime,
        uint256 value,
        bool removed
    );

    struct Permission {
        uint256 valueTransferred;
        uint256 valueTransferedOnBlock;
        uint256 valueAllowed;
        uint256 fromTime;
        bool isSet;
    }

    // from address => to address => function call signature allowed => Permission
    mapping(address => mapping(address => mapping(bytes4 => Permission))) public ethPermissions;

    Permission emptyPermission = Permission(0, 0, 0, 0, false);

    /**
     * @dev initializer
     */
    function initialize() public initializer {
        __Ownable_init();
    }

    /**
     * @dev Set the time delay for a call to show as allowed
     * @param _timeDelay The amount of time that has to pass after permission addition to allow execution
     */
    function setPermissionDelay(address from, uint256 _timeDelay) public {
        if (msg.sender != owner()) {
            require(from == msg.sender, "PermissionRegistry: Only owner can specify from value");
        }
        permissionDelay[from] = _timeDelay;
    }

    /**
     * @dev Sets the time from which the function can be executed from a contract to another a with which value.
     * @param from The address that will execute the call
     * @param to The address that will be called
     * @param functionSignature The signature of the function to be executed
     * @param valueAllowed The amount of value allowed of the asset to be sent
     * @param allowed If the function is allowed or not.
     * @param remove If the permission should be removed
     */
    function setPermission(
        address from,
        address to,
        bytes4 functionSignature,
        uint256 valueAllowed,
        bool allowed,
        bool remove
    ) public {
        if (msg.sender != owner()) {
            require(from == msg.sender, "PermissionRegistry: Only owner can specify from value");
        }
        require(to != address(this), "PermissionRegistry: Cant set ethPermissions to PermissionRegistry");
        if (remove) {
            ethPermissions[from][to][functionSignature].fromTime = 0;
            ethPermissions[from][to][functionSignature].valueAllowed = 0;
            ethPermissions[from][to][functionSignature].isSet = false;
        } else if (allowed) {
            ethPermissions[from][to][functionSignature].fromTime = block.timestamp.add(permissionDelay[from]);
            ethPermissions[from][to][functionSignature].valueAllowed = valueAllowed;
        } else {
            ethPermissions[from][to][functionSignature].fromTime = 0;
            ethPermissions[from][to][functionSignature].valueAllowed = 0;
        }
        ethPermissions[from][to][functionSignature].isSet = true;
        emit PermissionSet(
            from,
            to,
            functionSignature,
            ethPermissions[from][to][functionSignature].fromTime,
            ethPermissions[from][to][functionSignature].valueAllowed,
            remove
        );
    }

    /**
     * @dev Get the time delay to be used for an address
     * @param fromAddress The address that will set the permission
     */
    function getPermissionDelay(address fromAddress) public view returns (uint256) {
        return permissionDelay[fromAddress];
    }

    /**
     * @dev Gets the time from which the function can be executed from a contract to another and with which value.
     * In case of now being allowed to do the call it returns zero in both values
     * @param from The address from which the call will be executed
     * @param to The address that will be called
     * @param functionSignature The signature of the function to be executed
     */
    function getPermission(
        address from,
        address to,
        bytes4 functionSignature
    )
        public
        view
        returns (
            uint256 valueAllowed,
            uint256 fromTime,
            bool isSet
        )
    {
        return (
            ethPermissions[from][to][functionSignature].valueAllowed,
            ethPermissions[from][to][functionSignature].fromTime,
            ethPermissions[from][to][functionSignature].isSet
        );
    }

    /**
     * @dev Sets the value transferred in a permission on the actual block and checks the allowed timestamp.
     *      It also checks that the value does not go over the permission other global limits.
     * @param from The address from which the call will be executed
     * @param to The address that will be called
     * @param functionSignature The signature of the function to be executed
     * @param valueTransferred The value to be transferred
     */
    function setPermissionUsed(
        address from,
        address to,
        bytes4 functionSignature,
        uint256 valueTransferred
    ) public {
        // If the asset is an ERC20 token check the value allowed to be transferred, no signature used
        if (ethPermissions[from][to][functionSignature].isSet) {
            _setValueTransferred(ethPermissions[from][to][functionSignature], valueTransferred);
            require(
                ethPermissions[from][to][functionSignature].fromTime > 0 &&
                    ethPermissions[from][to][functionSignature].fromTime < block.timestamp,
                "PermissionRegistry: Call not allowed"
            );
        } else {
            revert("PermissionRegistry: Permission not set");
        }
    }

    /**
     * @dev Sets the value transferred in a a permission on the actual block.
     * @param permission The permission to add the value transferred
     * @param valueTransferred The value to be transferred
     */
    function _setValueTransferred(Permission storage permission, uint256 valueTransferred) internal {
        if (permission.valueTransferedOnBlock < block.number) {
            permission.valueTransferedOnBlock = block.number;
            permission.valueTransferred = valueTransferred;
        } else {
            permission.valueTransferred = permission.valueTransferred.add(valueTransferred);
        }
        require(permission.valueTransferred <= permission.valueAllowed, "PermissionRegistry: Value limit reached");
    }
}
