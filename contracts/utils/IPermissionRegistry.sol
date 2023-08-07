// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

interface IPermissionRegistry {
    function setETHPermissionDelay(address from, uint256 _timeDelay) external;

    function setETHPermission(
        address from,
        address to,
        bytes4 functionSignature,
        uint256 valueAllowed,
        bool allowed
    ) external;

    function addERC20Limit(
        address from,
        address token,
        uint256 valueAllowed,
        uint256 index
    ) external;

    function removeERC20Limit(address from, uint256 index) external;

    function executeRemoveERC20Limit(address from, uint256 index) external;

    function setETHPermissionUsed(
        address from,
        address to,
        bytes4 functionSignature,
        uint256 valueTransferred
    ) external;

    function setERC20Balances() external;

    function checkERC20Limits(address from) external returns (bool);

    function getETHPermissionDelay(address from) external view returns (uint256);

    function getETHPermission(
        address from,
        address to,
        bytes4 functionSignature
    ) external view returns (uint256 valueAllowed, uint256 fromTime);

    function getERC20Limit(address from, address token) external view returns (uint256);
}
