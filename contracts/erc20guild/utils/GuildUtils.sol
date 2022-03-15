// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract GuildUtils is Ownable {
    using Counters for Counters.Counter;
    event AddGuild(string guildName, address guildAddress);
    event DeleteGuild(string guildName, address guildAddress);

    struct Guild {
        uint256 index;
        string guildName;
        // Should be filled out with other guild attributes
    }

    address[] private _guilds;
    Counters.Counter private _index;

    mapping(address => Guild) guildStructs;

    function addGuild(address guildAddress, string memory guildName) external onlyOwner {
        guildStructs[guildAddress].guildName = guildName;
        guildStructs[guildAddress].index = _index.current();
        _guilds.push(guildAddress);
        _index.increment();
        emit AddGuild(guildName, guildAddress);
    }

    function deleteGuild(address guildAddress) external onlyOwner {
        require(_guilds.length > 0, "No guilds to delete");
        // Overwrite the guild we want to delete and then we remove the last element
        uint256 guildIndexToDelete = guildStructs[guildAddress].index;
        address guildAddressToMove = _guilds[_guilds.length - 1];
        _guilds[guildIndexToDelete] = guildAddressToMove;
        guildStructs[guildAddressToMove].index = guildIndexToDelete;
        _guilds.pop();
        _index.decrement();
        emit DeleteGuild(guildStructs[guildAddress].guildName, guildAddress);
    }

    function getTotalGuilds() external view onlyOwner returns (uint256) {
        return _guilds.length;
    }

    function getGuildName(address guildAddress) external view onlyOwner returns (string memory) {
        return guildStructs[guildAddress].guildName;
    }
}
