# Solidity API

## DecentralizedAutonomousTrust

### Buy

```solidity
event Buy(address _from, address _to, uint256 _currencyValue, uint256 _fairValue)
```

Events

### Sell

```solidity
event Sell(address _from, address _to, uint256 _currencyValue, uint256 _fairValue)
```

### Burn

```solidity
event Burn(address _from, uint256 _fairValue)
```

### Pay

```solidity
event Pay(address _from, address _to, uint256 _currencyValue, uint256 _fairValue)
```

### Close

```solidity
event Close(uint256 _exitFee)
```

### StateChange

```solidity
event StateChange(uint256 _previousState, uint256 _newState)
```

### UpdateConfig

```solidity
event UpdateConfig(address _whitelistAddress, address _beneficiary, address _control, address _feeCollector, bool _autoBurn, uint256 _revenueCommitmentBasisPoints, uint256 _feeBasisPoints, uint256 _minInvestment, uint256 _openUntilAtLeast)
```

### STATE_INIT

```solidity
uint256 STATE_INIT
```

### STATE_RUN

```solidity
uint256 STATE_RUN
```

### STATE_CLOSE

```solidity
uint256 STATE_CLOSE
```

### STATE_CANCEL

```solidity
uint256 STATE_CANCEL
```

### MAX_BEFORE_SQUARE

```solidity
uint256 MAX_BEFORE_SQUARE
```

### BASIS_POINTS_DEN

```solidity
uint256 BASIS_POINTS_DEN
```

### MAX_SUPPLY

```solidity
uint256 MAX_SUPPLY
```

### whitelist

```solidity
contract IWhitelist whitelist
```

### burnedSupply

```solidity
uint256 burnedSupply
```

### autoBurn

```solidity
bool autoBurn
```

### beneficiary

```solidity
address payable beneficiary
```

### buySlopeNum

```solidity
uint256 buySlopeNum
```

### buySlopeDen

```solidity
uint256 buySlopeDen
```

### control

```solidity
address control
```

### currency

```solidity
contract IERC20 currency
```

### feeCollector

```solidity
address payable feeCollector
```

### feeBasisPoints

```solidity
uint256 feeBasisPoints
```

### initGoal

```solidity
uint256 initGoal
```

### initInvestors

```solidity
mapping(address => uint256) initInvestors
```

### initReserve

```solidity
uint256 initReserve
```

### investmentReserveBasisPoints

```solidity
uint256 investmentReserveBasisPoints
```

### openUntilAtLeast

```solidity
uint256 openUntilAtLeast
```

### minInvestment

```solidity
uint256 minInvestment
```

### revenueCommitmentBasisPoints

```solidity
uint256 revenueCommitmentBasisPoints
```

### state

```solidity
uint256 state
```

### version

```solidity
string version
```

### nonces

```solidity
mapping(address => uint256) nonces
```

### DOMAIN_SEPARATOR

```solidity
bytes32 DOMAIN_SEPARATOR
```

### PERMIT_TYPEHASH

```solidity
bytes32 PERMIT_TYPEHASH
```

### authorizeTransfer

```solidity
modifier authorizeTransfer(address _from, address _to, uint256 _value, bool _isSell)
```

### buybackReserve

```solidity
function buybackReserve() public view returns (uint256)
```

The total amount of currency value currently locked in the contract and available to sellers.

### _detectTransferRestriction

```solidity
function _detectTransferRestriction(address _from, address _to, uint256 _value) private view returns (uint256)
```

Functions required for the whitelist

### _transfer

```solidity
function _transfer(address _from, address _to, uint256 _amount) internal
```

_Moves tokens from one account to another if authorized._

### _burn

```solidity
function _burn(address _from, uint256 _amount, bool _isSell) internal
```

_Removes tokens from the circulating supply._

### _mint

```solidity
function _mint(address _to, uint256 _quantity) internal
```

Called to mint tokens on `buy`.

### _collectInvestment

```solidity
function _collectInvestment(uint256 _quantityToInvest, uint256 _msgValue, bool _refundRemainder) private
```

Confirms the transfer of `_quantityToInvest` currency to the contract.

### _transferCurrency

```solidity
function _transferCurrency(address payable _to, uint256 _amount) private
```

_Send `_amount` currency from the contract to the `_to` account._

### initialize

```solidity
function initialize(uint256 _initReserve, address _currencyAddress, uint256 _initGoal, uint256 _buySlopeNum, uint256 _buySlopeDen, uint256 _investmentReserveBasisPoints, string _name, string _symbol) public
```

Called once after deploy to set the initial configuration.
 None of the values provided here may change once initially set.
 @dev using the init pattern in order to support zos upgrades

### getChainId

```solidity
function getChainId() private pure returns (uint256 id)
```

### updateConfig

```solidity
function updateConfig(address _whitelistAddress, address payable _beneficiary, address _control, address payable _feeCollector, uint256 _feeBasisPoints, bool _autoBurn, uint256 _revenueCommitmentBasisPoints, uint256 _minInvestment, uint256 _openUntilAtLeast) public
```

### burn

```solidity
function burn(uint256 _amount) public
```

Burn the amount of tokens from the address msg.sender if authorized.
 @dev Note that this is not the same as a `sell` via the DAT.

### _distributeInvestment

```solidity
function _distributeInvestment(uint256 _value) private
```

_Distributes _value currency between the buybackReserve, beneficiary, and feeCollector._

### estimateBuyValue

```solidity
function estimateBuyValue(uint256 _currencyValue) public view returns (uint256)
```

Calculate how many COT tokens you would buy with the given amount of currency if `buy` was called now.
 @param _currencyValue How much currency to spend in order to buy COT.

### buy

```solidity
function buy(address _to, uint256 _currencyValue, uint256 _minTokensBought) public payable
```

Purchase COT tokens with the given amount of currency.
 @param _to The account to receive the COT tokens from this purchase.
 @param _currencyValue How much currency to spend in order to buy COT.
 @param _minTokensBought Buy at least this many COT tokens or the transaction reverts.
 @dev _minTokensBought is necessary as the price will change if some elses transaction mines after
 yours was submitted.

### estimateSellValue

```solidity
function estimateSellValue(uint256 _quantityToSell) public view returns (uint256)
```

Sell

### sell

```solidity
function sell(address payable _to, uint256 _quantityToSell, uint256 _minCurrencyReturned) public
```

Sell COT tokens for at least the given amount of currency.
 @param _to The account to receive the currency from this sale.
 @param _quantityToSell How many COT tokens to sell for currency value.
 @param _minCurrencyReturned Get at least this many currency tokens or the transaction reverts.
 @dev _minCurrencyReturned is necessary as the price will change if some elses transaction mines after
 yours was submitted.

### estimatePayValue

```solidity
function estimatePayValue(uint256 _currencyValue) public view returns (uint256)
```

Pay

### _pay

```solidity
function _pay(address _to, uint256 _currencyValue) private
```

_Pay the organization on-chain.
 @param _to The account which receives tokens for the contribution.
 @param _currencyValue How much currency which was paid._

### pay

```solidity
function pay(address _to, uint256 _currencyValue) public payable
```

_Pay the organization on-chain.
 @param _to The account which receives tokens for the contribution. If this address
 is not authorized to receive tokens then they will be sent to the beneficiary account instead.
 @param _currencyValue How much currency which was paid._

### fallback

```solidity
fallback() external payable
```

Pay the organization on-chain without minting any tokens.
 @dev This allows you to add funds directly to the buybackReserve.

### estimateExitFee

```solidity
function estimateExitFee(uint256 _msgValue) public view returns (uint256)
```

Close

### close

```solidity
function close() public payable
```

Called by the beneficiary account to STATE_CLOSE or STATE_CANCEL the c-org,
 preventing any more tokens from being minted.
 @dev Requires an `exitFee` to be paid.  If the currency is ETH, include a little more than
 what appears to be required and any remainder will be returned to your account.  This is
 because another user may have a transaction mined which changes the exitFee required.
 For other `currency` types, the beneficiary account will be billed the exact amount required.

### permit

```solidity
function permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s) external
```

