// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "./BaseERC20Guild.sol";

/*
  @title ERC20Guild
  @author github:AugustoL
  @dev Non upgradeable ERC20Guild
*/
contract ERC20Guild is BaseERC20Guild {
    event GuildInitialized();

    /// @dev Constructor
    /// @param _token The ERC20 token that will be used as source of voting power
    /// @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    // solhint-disable-next-line max-line-length
    /// @param _votingPowerPercentageForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal action
    // solhint-disable-next-line max-line-length
    /// @param _votingPowerPercentageForProposalCreation The percentage of voting power in base 10000 needed to create a proposal
    /// @param _name The name of the ERC20Guild
    /// @param _lockTime The minimum amount of seconds that the tokens would be locked
    /// @param _permissionRegistry The address of the permission registry contract to be used
    constructor(
        address _token,
        uint256 _proposalTime,
        uint256 _votingPowerPercentageForProposalExecution,
        uint256 _votingPowerPercentageForProposalCreation,
        string memory _name,
        uint256 _lockTime,
        address _permissionRegistry
    ) {
        require(address(_token) != address(0), "ERC20Guild: token cant be zero address");
        require(_proposalTime > 0, "ERC20Guild: proposal time has to be more tha 0");
        require(_lockTime >= _proposalTime, "ERC20Guild: lockTime has to be higher or equal to proposalTime");
        require(
            _votingPowerPercentageForProposalExecution > 0,
            "ERC20Guild: voting power for execution has to be more than 0"
        );
        name = _name;
        token = IERC20Upgradeable(_token);
        tokenVault = new TokenVault(address(token), address(this));
        proposalTime = _proposalTime;
        votingPowerPercentageForProposalExecution = _votingPowerPercentageForProposalExecution;
        votingPowerPercentageForProposalCreation = _votingPowerPercentageForProposalCreation;
        lockTime = _lockTime;
        permissionRegistry = PermissionRegistry(_permissionRegistry);

        // This variables are set initially to default values cause the constructor throws stack too deep error
        // They can be changed later by calling the setConfig function
        timeForExecution = 30 days;
        voteGas = 0;
        maxGasPrice = 0;
        maxActiveProposals = 5;
        emit GuildInitialized();
    }
}
