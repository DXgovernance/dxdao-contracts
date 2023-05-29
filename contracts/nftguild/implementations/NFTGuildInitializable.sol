// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../../utils/PermissionRegistry.sol";
import "../BaseNFTGuild.sol";

/*
  @title NFTGuildUpgradeable
  @author 
  @dev Extends the BaseNFTGuild into a guild that can be initialized,
*/
contract NFTGuildInitializable is BaseNFTGuild, Initializable {
    // @dev Initializer
    // @param _token The NFT token that will be used as source of voting power
    // @param _proposalTime The amount of time in seconds that a proposal will be active for voting
    // @param _timeForExecution The amount of time in seconds that a proposal option will have to execute successfully
    // @param _votingPowerForProposalExecution The percentage of voting power in base 10000 needed to execute a proposal
    // action
    // @param _name The name of the NFTGuild
    // @param _voteGas The amount of gas in wei unit used for vote refunds
    // @param _maxGasPrice The maximum gas price used for vote refunds
    // @param _maxActiveProposals The maximum amount of proposals to be active at the same time
    // @param _lockTime The minimum amount of seconds that the tokens would be locked
    // @param _permissionRegistry The address of the permission registry contract to be used
    function initialize(
        address _token,
        uint256 _proposalTime,
        uint256 _timeForExecution,
        uint256 _votingPowerForProposalExecution,
        string calldata _name,
        uint256 _voteGas,
        uint256 _maxGasPrice,
        uint128 _maxActiveProposals,
        address _permissionRegistry
    ) public virtual initializer {
        require(_proposalTime > 0, "NFTGuild: proposal time has to be more than 0");
        require(_votingPowerForProposalExecution > 0, "NFTGuild: voting power for execution has to be more than 0");
        token = IERC721Upgradeable(_token);
        proposalTime = _proposalTime;
        timeForExecution = _timeForExecution;
        votingPowerForProposalExecution = _votingPowerForProposalExecution;
        name = _name;
        voteGas = _voteGas;
        maxGasPrice = _maxGasPrice;
        maxActiveProposals = _maxActiveProposals;
        permissionRegistry = PermissionRegistry(_permissionRegistry);

        setEIP712DomainSeparator();
    }
}
