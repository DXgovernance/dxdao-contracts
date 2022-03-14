// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract GuildRegistry is Ownable {
    using Counters for Counters.Counter;
    event AddGuild(address guildAddress);
    event RemoveGuild(address guildAddress);

    struct Guild {
        uint256 index;
        // Should be filled out with other guild attributes
    }

    address[] private _guilds;
    Counters.Counter private _index;

    mapping(address => Guild) guildStructs;

    function addGuild(address guildAddress) external onlyOwner {
        guildStructs[guildAddress].index = _index.current();
        _guilds.push(guildAddress);
        _index.increment();
        emit AddGuild(guildAddress);
    }

    function removeGuild(address guildAddress) external onlyOwner {
        require(_guilds.length > 0, "No guilds to delete");
        // Overwrite the guild we want to delete and then we remove the last element
        uint256 guildIndexToDelete = guildStructs[guildAddress].index;
        address guildAddressToMove = _guilds[_guilds.length - 1];
        _guilds[guildIndexToDelete] = guildAddressToMove;
        guildStructs[guildAddressToMove].index = guildIndexToDelete;
        _guilds.pop();
        _index.decrement();
        emit RemoveGuild(guildAddress);
    }

    function getTotalGuilds() external view returns (uint256) {
        return _guilds.length;
    }

    function getGuildsAddresses() external view returns (address[] memory) {
        return _guilds;
    }
}
