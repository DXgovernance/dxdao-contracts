// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@gnosis.pm/zodiac/contracts/interfaces/IAvatar.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import "./../../utils/IPermissionRegistry.sol";

/*
  @title PermissionRegistryModule
  @author github:fnanni-0
  @dev This Zodiac Module allows Guild contracts to own several Gnosis Safe while keeping the Permission Registry
    features, i.e. restricting the safe calls to allowed addresses, functions and values. Only one module given a
    PermissionRegistry is needed. All Guilds will use the same instance of this module as intermediary to control
    their respective Gnosis Safes.
*/
contract PermissionRegistryModule {
    bytes private constant SET_ERC20_BALANCES_DATA =
        abi.encodeWithSelector(IPermissionRegistry.setERC20Balances.selector);

    /// @dev Address of the permission registry that will regulate this module.
    IPermissionRegistry public immutable permissionRegistry;

    /// @dev moduleConfigs[avatar][admin] .
    mapping(address => mapping(address => address)) public multisends;

    /// @dev Initialize the Module configuration.
    /// @param _permissionRegistry Address of the permission registry that will regulate this module.
    constructor(address _permissionRegistry) {
        permissionRegistry = IPermissionRegistry(_permissionRegistry);
    }

    /// @dev Set the Module avatar, can only be called by the admin.
    /// @param _admin Address of the controller of the module.
    /// @param _multisend Address of the multisend contract that the avatar contract should use to bundle transactions.
    function activateModule(address _admin, address _multisend) external {
        multisends[msg.sender][_admin] = _multisend;
    }

    /// @dev Set the Module avatar, can only be called by the admin.
    /// @param _admin Address of the controller of the module.
    function deactivateModule(address _admin) external {
        multisends[msg.sender][_admin] = address(0x0);
    }

    /// @dev Relays transactions from admin (guild contract) to avatar (gnosis safe contract)
    /// @param _avatar Address that this module will pass transactions to.
    /// @param _to The receiver addresses of each call to be executed
    /// @param _data The data to be executed on each call to be executed
    /// @param _value The ETH value to be sent on each call to be executed
    function relayTransactions(
        address _avatar,
        address[] memory _to,
        bytes[] memory _data,
        uint256[] memory _value
    ) external payable returns (bool success) {
        address multisend = multisends[_avatar][msg.sender];
        require(multisend != address(0x0), "PRModule: Only callable by admin");

        // All calls are batched and sent together to the avatar.
        // The avatar will execute all calls through the multisend contract.
        bytes memory data = getSetERC20BalancesCalldata();
        uint256 totalValue = 0;

        for (uint256 i = 0; i < _to.length; i++) {
            require(_to[i] != address(0) && _data[i].length > 0, "");
            data = abi.encodePacked(
                data,
                getSetETHPermissionUsedCalldata(_avatar, _to[i], _value[i], _data[i]),
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

        data = abi.encodePacked(data, getCheckERC20LimitsCalldata(_avatar));

        data = abi.encodeWithSignature("multiSend(bytes)", data);
        success = IAvatar(_avatar).execTransactionFromModule(multisend, totalValue, data, Enum.Operation.DelegateCall);
    }

    /// @dev Encodes permissionRegistry.checkERC20Limits(avatar)
    /// @param _avatar Address that this module will pass transactions to.
    function getCheckERC20LimitsCalldata(address _avatar) internal view returns (bytes memory) {
        bytes memory checkERC20LimitsData = abi.encodeWithSelector(
            IPermissionRegistry.checkERC20Limits.selector,
            _avatar
        );
        return
            abi.encodePacked(
                uint8(Enum.Operation.Call),
                permissionRegistry, /// to as an address.
                uint256(0), /// value as an uint256.
                uint256(checkERC20LimitsData.length),
                checkERC20LimitsData /// data as bytes.
            );
    }

    /// @dev Encodes permissionRegistry.setERC20Balances()
    function getSetERC20BalancesCalldata() internal view returns (bytes memory) {
        return
            abi.encodePacked(
                uint8(Enum.Operation.Call),
                permissionRegistry, /// to as an address.
                uint256(0), /// value as an uint256.
                uint256(SET_ERC20_BALANCES_DATA.length),
                SET_ERC20_BALANCES_DATA /// data as bytes.
            );
    }

    /// @dev Encodes permissionRegistry.setETHPermissionUsed(avatar, to, funcSignature, value)
    /// @param _avatar Address that this module will pass transactions to.
    /// @param _to The receiver address of the call to be executed
    /// @param _data The data to be executed on the call
    /// @param _value The ETH value to be sent on the call to be executed
    function getSetETHPermissionUsedCalldata(
        address _avatar,
        address _to,
        uint256 _value,
        bytes memory _data
    ) internal view returns (bytes memory) {
        bytes4 callDataFuncSignature;
        assembly {
            callDataFuncSignature := mload(add(_data, 32))
        }

        // The permission registry keeps track of all value transferred and checks call permission
        bytes memory setETHPermissionUsedData = abi.encodeWithSelector(
            IPermissionRegistry.setETHPermissionUsed.selector,
            _avatar,
            _to,
            callDataFuncSignature,
            _value
        );

        return
            abi.encodePacked(
                uint8(Enum.Operation.Call),
                permissionRegistry, /// to as an address.
                uint256(0), /// value as an uint256.
                uint256(setETHPermissionUsedData.length),
                setETHPermissionUsedData /// data as bytes.
            );
    }

    /// @dev For compatibility with
    /// @param _avatar Address that the module will pass transactions to.
    /// @param _admin Address of the controller of the module.
    function isModuleActivated(address _avatar, address _admin) external view returns (bool) {
        return multisends[_avatar][_admin] != address(0x0);
    }
}
