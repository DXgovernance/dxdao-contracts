# Solidity API

## DAOReputation

_An ERC20 token that is non-transferable, owned and controlled by the DAO.
Used by the DAO to vote on proposals.
It uses a snapshot mechanism to keep track of the reputation at the moment of
each modification of the supply of the token (every mint an burn)._

### votingPowerToken

```solidity
address votingPowerToken
```

Voting Power Token address

### DAOReputation__InvalidMintRepAmount

```solidity
error DAOReputation__InvalidMintRepAmount()
```

Mint or Burn shouldn’t be called if the amount is 0

### initialize

```solidity
function initialize(string name, string symbol, address _votingPowerToken) external
```

### snapshot

```solidity
function snapshot() internal
```

_Create a new snapshot and call VPToken callback_

### mint

```solidity
function mint(address account, uint256 amount) external returns (bool success)
```

_Generates `amount` reputation that are assigned to `account`_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address that will be assigned the new reputation |
| amount | uint256 | The quantity of reputation generated |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are generated correctly |

### mintMultiple

```solidity
function mintMultiple(address[] accounts, uint256[] amounts) external returns (bool success)
```

_Mint reputation for multiple accounts_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The accounts that will be assigned the new reputation |
| amounts | uint256[] | The quantity of reputation generated for each account |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are generated correctly |

### burn

```solidity
function burn(address account, uint256 amount) external returns (bool success)
```

_Burns ` amount` reputation from ` account`_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address that will lose the reputation |
| amount | uint256 | The quantity of reputation to burn |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are burned correctly |

### burnMultiple

```solidity
function burnMultiple(address[] accounts, uint256[] amounts) external returns (bool success)
```

_Burn reputation from multiple accounts_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | The accounts that will lose the reputation |
| amounts | uint256[] | The quantity of reputation to burn for each account |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| success | bool | True if the reputation are generated correctly |

### setVotingPowerTokenAddress

```solidity
function setVotingPowerTokenAddress(address _votingPowerToken) external
```

_Sets new Voting Power Token contract address_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _votingPowerToken | address | The address of the new VPToken contract |

