// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "../erc20guild/implementations/SnapshotRepERC20Guild.sol";
import "../utils/ERC20/ERC20SnapshotRep.sol";
import "../utils/PermissionRegistry.sol";

contract DXdaoTreasuryGuildDeployer {
    constructor() {
        PermissionRegistry permissionRegistry = new PermissionRegistry();
        permissionRegistry.initialize();
        ERC20SnapshotRep repToken = new ERC20SnapshotRep();
        repToken.initialize("DXdao Treasury REP", "TREP");
        SnapshotRepERC20Guild newGuild = new SnapshotRepERC20Guild();
        newGuild.initialize(
            address(repToken),
            3 days, // proposal time
            6 hours, // time for execution
            5000, // 50% voting power for proposal execution
            500, // 5% voting power for proposal creation
            "DXdao Treasury Guild", // guild name
            0, // vote gas
            0, // max gas price
            10, // max active proposals
            3 days, // lock time, not used
            address(permissionRegistry)
        );
        permissionRegistry.setETHPermissionDelay(address(newGuild), 1);
    }
}
