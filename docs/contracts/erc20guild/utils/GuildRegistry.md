# Solidity API

## GuildRegistry

### AddGuild

```solidity
event AddGuild(address guildAddress)
```

### RemoveGuild

```solidity
event RemoveGuild(address guildAddress)
```

### guilds

```solidity
address[] guilds
```

### index

```solidity
struct Counters.Counter index
```

### guildsByAddress

```solidity
mapping(address => uint256) guildsByAddress
```

### addGuild

```solidity
function addGuild(address guildAddress) external
```

### removeGuild

```solidity
function removeGuild(address guildAddress) external
```

### getGuildsAddresses

```solidity
function getGuildsAddresses() external view returns (address[])
```
