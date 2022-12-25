// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@gnosis.pm/zodiac/contracts/interfaces/IAvatar.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";

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
  @title PermissionRegistryModule
  @author github:fnanni-0
  @dev This Zodiac Module allows Guild contracts to own several Gnosis Safe while keeping the Permission Registry
    features, i.e. restricting the safe calls to allowed addresses, functions and values.
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

    bool public initialized;
    bool public isExecutingProposal;

    /// @dev Initialize the Module configuration.
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
        require(!initialized, "PRModule: Only callable when initialized");
        avatar = _avatar;
        multisend = _multisend;
        admin = _admin;
        permissionRegistry = _permissionRegistry;
        initialized = true;
    }

    /// @dev Set the Module avatar, can only be called by the admin.
    /// @param _avatar Address that this module will pass transactions to.
    function setAvatar(address _avatar) external {
        require(msg.sender == admin, "PRModule: Only callable by admin");
        avatar = _avatar;
    }

    /// @dev Set the Module multisend, can only be called by the admin.
    /// @param _multisend Address of the multisend contract that the avatar contract should use to bundle transactions.
    function setMultisend(address _multisend) external {
        require(msg.sender == admin, "PRModule: Only callable by admin");
        multisend = _multisend;
    }

    /// @dev Set the Module admin, can only be called by the admin.
    /// @param _admin Address that will have permission to execute transactions and update settings.
    function setAdmin(address _admin) external {
        require(msg.sender == admin, "PRModule: Only callable by admin");
        admin = _admin;
    }

    /// @dev Set the Module permission registry, can only be called by the admin.
    /// @param _permissionRegistry Address of the permission registry that will regulate this module.
    function setPermissionRegistry(IPermissionRegistry _permissionRegistry) external {
        require(msg.sender == admin, "PRModule: Only callable by admin");
        permissionRegistry = _permissionRegistry;
    }

    /// @dev Relays transactions from admin (guild contract) to avatar (gnosis safe contract)
    /// @param _to The receiver addresses of each call to be executed
    /// @param _data The data to be executed on each call to be executed
    /// @param _value The ETH value to be sent on each call to be executed
    function relayTransactions(
        address[] memory _to,
        bytes[] memory _data,
        uint256[] memory _value
    ) external payable {
        require(msg.sender == admin, "PRModule: Only callable by admin or when initialized");
        require(!isExecutingProposal, "ERC20Guild: Proposal under execution");

        // All calls are batched and sent together to the avatar.
        // The avatar will execute all calls through the multisend contract.
        bytes memory data = getSetERC20BalancesCalldata();
        uint256 totalValue = 0;

        for (uint256 i = 0; i < _to.length; i++) {
            require(_to[i] != address(0) && _data[i].length > 0, "");
            data = abi.encodePacked(
                data,
                getSetETHPermissionUsedCalldata(_to[i], _value[i], _data[i]),
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

        data = abi.encodePacked(data, getCheckERC20LimitsCalldata());

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

    /// @dev Encodes permissionRegistry.checkERC20Limits(avatar)
    function getCheckERC20LimitsCalldata() internal view returns (bytes memory) {
        bytes memory checkERC20LimitsData = abi.encodeWithSelector(
            IPermissionRegistry.checkERC20Limits.selector,
            avatar
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
    /// @param _to The receiver address of the call to be executed
    /// @param _data The data to be executed on the call
    /// @param _value The ETH value to be sent on the call to be executed
    function getSetETHPermissionUsedCalldata(
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
            avatar,
            _to,
            bytes4(callDataFuncSignature),
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
}
