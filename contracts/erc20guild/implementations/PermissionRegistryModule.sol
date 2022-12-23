// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@gnosis.pm/zodiac/contracts/interfaces/IAvatar.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol";
import "../ERC20GuildUpgradeable.sol";

interface IPermissionRegistry {
    function setERC20Balances() external;

    function checkERC20Limits(address) external;

    function setETHPermissionUsed(
        address,
        address,
        bytes4,
        uint256
    ) external;
}

/*
  @title ERC20GuildWithERC1271
  @author github:AugustoL
  @dev The guild can sign EIP1271 messages, to do this the guild needs to call itself and allow 
    the signature to be verified with and extra signature of any account with voting power.
*/
contract PermissionRegistryModule {
    bytes constant SET_ERC20_BALANCES_DATA = abi.encodeWithSelector(IPermissionRegistry.setERC20Balances.selector);
    
    /// @dev Address of the permission registry that will regulate this module.
    IPermissionRegistry public permissionRegistry;
    /// @dev Address that will have permission to execute transactions and update settings.
    address public admin;
    /// @dev Address that this module will pass transactions to.
    address public avatar;
    /// @dev Address of the multisend contract that the avatar contract should use to bundle transactions.
    address public multisend;

    bool private isExecutingProposal;

    /// @dev Set the ERC20Guild configuration, can be called only executing a proposal or when it is initialized
    /// @param _avatar Address that this module will pass transactions to.
    /// @param _multisend Address of the multisend contract that the avatar contract should use to bundle transactions.
    /// @param _admin Address that will have permission to execute transactions and update settings.
    /// @param _permissionRegistry Address of the permission registry that will regulate this module.
    function setConfig(
        address _avatar,
        address _multisend,
        address _admin,
        IPermissionRegistry _permissionRegistry
    ) external {
        require(msg.sender == admin, "PRModule: Only callable by admin or when initialized");
        avatar = _avatar;
        multisend = _multisend;
        admin = _admin;
        permissionRegistry = _permissionRegistry;

    }

    /// @dev Set the ERC20Guild module configuration, can be called only executing a proposal or when it is initialized.
    /// @param _avatar Address that this module will pass transactions to.
    function setAvatar(address _avatar) external  {
        require(msg.sender == admin, "PRModule: Only callable by admin or when initialized");
        avatar = _avatar;
    }

    /// @dev Set the ERC20Guild module configuration, can be called only executing a proposal or when it is initialized.
    /// @param _multisend Address of the multisend contract that the avatar contract should use to bundle transactions.
    function setMultisend(address _multisend) external  {
        require(msg.sender == admin, "PRModule: Only callable by admin or when initialized");
        multisend = _multisend;
    }

    /// @dev Set the ERC20Guild module configuration, can be called only executing a proposal or when it is initialized.
    /// @param _admin Address that will have permission to execute transactions and update settings.
    function setAdmin(address _admin) external  {
        require(msg.sender == admin, "PRModule: Only callable by admin or when initialized");
        admin = _admin;
    }

    /// @dev Set the ERC20Guild module configuration, can be called only executing a proposal or when it is initialized.
    /// @param _permissionRegistry Address of the permission registry that will regulate this module.
    function setPermissionRegistry(IPermissionRegistry _permissionRegistry) external  {
        require(msg.sender == admin, "PRModule: Only callable by admin or when initialized");
        permissionRegistry = _permissionRegistry;
    }

    /// @dev Executes a proposal that is not votable anymore and can be finished
    /// @param _to The id of the proposal to be executed
    /// @param _data The id of the proposal to be executed
    /// @param _value The id of the proposal to be executed
    function relayTransactions(
        address[] memory _to,
        bytes[] memory _data,
        uint256[] memory _value
    ) external payable {
        require(msg.sender == admin, "PRModule: Only callable by admin or when initialized");
        require(!isExecutingProposal, "ERC20Guild: Proposal under execution");

        // All calls are batched and sent together to the avatar, which will execute all of them through the multisend contract.
        bytes memory data = abi.encodePacked( /// permissionRegistry.setERC20Balances()
            uint8(Enum.Operation.Call),
            permissionRegistry, /// to as an address.
            uint256(0), /// value as an uint256.
            uint256(SET_ERC20_BALANCES_DATA.length),
            SET_ERC20_BALANCES_DATA /// data as bytes.
        );
        uint256 totalValue = 0;

        for (uint256 i = 0; i < _to.length; i++) {
            require(_to[i] != address(0) && _data[i].length > 0, "");

            bytes memory _dataI = _data[i];
            bytes4 callDataFuncSignature;
            assembly {
                callDataFuncSignature := mload(add(_dataI, 32))
            }

            // The permission registry keeps track of all value transferred and checks call permission
            bytes memory setETHPermissionUsedData = abi.encodeWithSelector(
                IPermissionRegistry.setETHPermissionUsed.selector,
                avatar,
                _to[i],
                bytes4(callDataFuncSignature),
                _value[i]
            );
            data = abi.encodePacked(
                data,
                abi.encodePacked( /// permissionRegistry.setETHPermissionUsed(avatar, to, funcSignature, value)
                    uint8(Enum.Operation.Call),
                    permissionRegistry, /// to as an address.
                    uint256(0), /// value as an uint256.
                    uint256(setETHPermissionUsedData.length),
                    setETHPermissionUsedData /// data as bytes.
                ),
                abi.encodePacked(
                    uint8(Enum.Operation.Call),
                    _to[i], /// to as an address.
                    _value[i], /// value as an uint256.
                    uint256(_data[i].length),
                    _data[i] /// data as bytes.
                )
            );
            totalValue += _value[i];
        }

        bytes memory checkERC20LimitsData = abi.encodeWithSelector(
            IPermissionRegistry.checkERC20Limits.selector,
            avatar
        );
        data = abi.encodePacked(
            data,
            abi.encodePacked( /// permissionRegistry.checkERC20Limits(avatar)
                uint8(Enum.Operation.Call),
                permissionRegistry, /// to as an address.
                uint256(0), /// value as an uint256.
                uint256(checkERC20LimitsData.length),
                checkERC20LimitsData /// data as bytes.
            )
        );

        data = abi.encodeWithSignature("multiSend(bytes)", data);
        isExecutingProposal = true;
        bool success = IAvatar(avatar).execTransactionFromModule(
            multisend,
            totalValue,
            data,
            Enum.Operation.DelegateCall
        );
        require(success, "ERC20Guild: Proposal call failed");
        isExecutingProposal = false;
    }
}
