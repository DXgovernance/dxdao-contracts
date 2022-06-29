// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PermissionRegistry.
 * @dev A registry of smart contracts functions and ERC20 transfers that are allowed to be called between contracts.
 * A time delay in seconds over the permissions can be set form any contract, this delay would be added to any new
 * permissions sent by that address.
 * The PermissionRegistry owner (if there is an owner and owner address is not 0x0) can overwrite/set any permission.
 * The registry allows setting ERC20 limits, the limit needs to be set at the beggining of the block and then it can be checked at any time
 * The smart contracts permissions are compound by the `from` address, `to` address, `value` uint256 and `fromTime` uint256,
 * if `fromTime` is zero it means the function is not allowed.
 */

contract PermissionRegistry is OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

    mapping(address => uint256) public permissionDelay;

    event PermissionSet(address from, address to, bytes4 functionSignature, uint256 fromTime, uint256 value);

    struct ETHPermission {
        uint256 valueTransferred;
        uint256 valueTransferedOnBlock;
        uint256 valueAllowed;
        uint256 fromTime;
    }

    struct ERC20Permission {
        address token;
        uint256 initialValueOnBlock;
        uint256 valueAllowed;
    }

    // from address => to address => function call signature allowed => Permission
    mapping(address => mapping(address => mapping(bytes4 => ETHPermission))) public ethPermissions;

    // from address => array of tokens allowed and the max value ot be transferred per block
    mapping(address => ERC20Permission[]) erc20Permissions;

    // mapping of the last block number used for the initial balance
    mapping(address => uint256) erc20PermissionsOnBlock;

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
    function setETHPermissionDelay(address from, uint256 _timeDelay) public {
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
     * @param valueAllowed The amount of value allowed of the token to be sent
     * @param allowed If the function is allowed or not.
     */
    function setETHPermission(
        address from,
        address to,
        bytes4 functionSignature,
        uint256 valueAllowed,
        bool allowed
    ) public {
        if (msg.sender != owner()) {
            require(from == msg.sender, "PermissionRegistry: Only owner can specify from value");
        }
        require(to != address(this), "PermissionRegistry: Cant set ethPermissions to PermissionRegistry");
        if (allowed) {
            ethPermissions[from][to][functionSignature].fromTime = block.timestamp.add(permissionDelay[from]);
            ethPermissions[from][to][functionSignature].valueAllowed = valueAllowed;
        } else {
            ethPermissions[from][to][functionSignature].fromTime = 0;
            ethPermissions[from][to][functionSignature].valueAllowed = 0;
        }
        emit PermissionSet(
            from,
            to,
            functionSignature,
            ethPermissions[from][to][functionSignature].fromTime,
            ethPermissions[from][to][functionSignature].valueAllowed
        );
    }

    /**
     * @dev Sets the time from which the function can be executed from a contract to another a with which value.
     * @param from The address that will execute the call
     * @param token The erc20 token to set the limit
     * @param valueAllowed The amount of value allowed of the token to be sent
     * @param index The index of the token permission in the erco limits
     */
    function setERC20Limit(
        address from,
        address token,
        uint256 valueAllowed,
        uint256 index
    ) public {
        if (msg.sender != owner()) {
            require(from == msg.sender, "PermissionRegistry: Only owner can specify from value");
        }
        require(index <= erc20Permissions[from].length, "PermissionRegistry: Index out of bounds");

        // set uint256(1e18) as initialvalue to not allow any balance change for this token on this block
        if (index == erc20Permissions[from].length) {
            erc20Permissions[from].push(ERC20Permission(token, uint256(1e18), valueAllowed));
        } else {
            erc20Permissions[from][index].initialValueOnBlock = uint256(1e18);
            erc20Permissions[from][index].token = token;
            erc20Permissions[from][index].valueAllowed = valueAllowed;
        }
    }

    /**
     * @dev Sets the value transferred in a permission on the actual block and checks the allowed timestamp.
     *      It also checks that the value does not go over the permission other global limits.
     * @param from The address from which the call will be executed
     * @param to The address that will be called
     * @param functionSignature The signature of the function to be executed
     * @param valueTransferred The value to be transferred
     */
    function setETHPermissionUsed(
        address from,
        address to,
        bytes4 functionSignature,
        uint256 valueTransferred
    ) public {
        if (valueTransferred > 0) {
            _setValueTransferred(ethPermissions[from][address(0)][bytes4(0)], valueTransferred);
        }

        if (ethPermissions[from][to][functionSignature].fromTime > 0) {
            require(
                ethPermissions[from][to][functionSignature].fromTime < block.timestamp,
                "PermissionRegistry: Call not allowed yet"
            );
            _setValueTransferred(ethPermissions[from][to][functionSignature], valueTransferred);
        } else if (functionSignature != bytes4(0)) {
            revert("PermissionRegistry: Permission not set");
        }
    }

    /**
     * @dev Sets the value transferred in a a permission on the actual block.
     * @param permission The permission to add the value transferred
     * @param valueTransferred The value to be transferred
     */
    function _setValueTransferred(ETHPermission storage permission, uint256 valueTransferred) internal {
        if (permission.valueTransferedOnBlock < block.number) {
            permission.valueTransferedOnBlock = block.number;
            permission.valueTransferred = valueTransferred;
        } else {
            permission.valueTransferred = permission.valueTransferred.add(valueTransferred);
        }
        require(permission.valueTransferred <= permission.valueAllowed, "PermissionRegistry: Value limit reached");
    }

    /**
     * @dev Sets the initial balances for ERC20 tokens in the current block
     */
    function setERC20Balances() public {
        if (erc20PermissionsOnBlock[msg.sender] < block.number) {
            erc20PermissionsOnBlock[msg.sender] = block.number;
            for (uint256 i = 0; i < erc20Permissions[msg.sender].length; i++) {
                erc20Permissions[msg.sender][i].initialValueOnBlock = IERC20(erc20Permissions[msg.sender][i].token)
                    .balanceOf(msg.sender);
            }
        }
    }

    /**
     * @dev Checks the value transferred in block for all registered ERC20 limits.
     * @param from The address from which ERC20 tokens limits will be checked
     */
    function checkERC20Limits(address from) public {
        require(erc20PermissionsOnBlock[from] == block.number, "PermissionRegistry: ERC20 initialValues not set");
        for (uint256 i = 0; i < erc20Permissions[from].length; i++) {
            require(
                erc20Permissions[from][i].initialValueOnBlock.sub(
                    IERC20(erc20Permissions[from][i].token).balanceOf(from)
                ) <= erc20Permissions[from][i].valueAllowed,
                "PermissionRegistry: Value limit reached"
            );
        }
    }

    /**
     * @dev Get the time delay to be used for an address
     * @param from The address to get the permission delay from
     */
    function getETHPermissionDelay(address from) public view returns (uint256) {
        return permissionDelay[from];
    }

    /**
     * @dev Gets the time from which the function can be executed from a contract to another and with which value.
     * In case of now being allowed to do the call it returns zero in both values
     * @param from The address from which the call will be executed
     * @param to The address that will be called
     * @param functionSignature The signature of the function to be executed
     */
    function getETHPermission(
        address from,
        address to,
        bytes4 functionSignature
    ) public view returns (uint256 valueAllowed, uint256 fromTime) {
        // Allow by default internal contract calls but with no value
        if (from == to) {
            return (0, 1);

            // Allow by default calls to this contract but with no value
        }
        if (to == address(this)) {
            return (0, 1);
        } else {
            return (
                ethPermissions[from][to][functionSignature].valueAllowed,
                ethPermissions[from][to][functionSignature].fromTime
            );
        }
    }
}
