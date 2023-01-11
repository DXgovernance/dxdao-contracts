# Solidity API

## BigDiv

This effectively allows us to overflow values in the numerator and/or denominator
of a fraction, so long as the end result does not overflow as well.

_Results may be off by 1 + 0.000001% for 2x1 calls and 2 + 0.00001% for 2x2 calls.
Do not use if your contract expects very small result values to be accurate._

### MAX_UINT

```solidity
uint256 MAX_UINT
```

### MAX_BEFORE_SQUARE

```solidity
uint256 MAX_BEFORE_SQUARE
```

### MAX_ERROR

```solidity
uint256 MAX_ERROR
```

### MAX_ERROR_BEFORE_DIV

```solidity
uint256 MAX_ERROR_BEFORE_DIV
```

### bigDiv2x1

```solidity
function bigDiv2x1(uint256 _numA, uint256 _numB, uint256 _den) internal pure returns (uint256)
```

Returns the approx result of `a * b / d` so long as the result is <= MAX_UINT

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _numA | uint256 | the first numerator term |
| _numB | uint256 | the second numerator term |
| _den | uint256 | the denominator |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the approx result with up to off by 1 + MAX_ERROR, rounding down if needed |

### bigDiv2x1RoundUp

```solidity
function bigDiv2x1RoundUp(uint256 _numA, uint256 _numB, uint256 _den) internal pure returns (uint256)
```

Returns the approx result of `a * b / d` so long as the result is <= MAX_UINT

_roundUp is implemented by first rounding down and then adding the max error to the result_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _numA | uint256 | the first numerator term |
| _numB | uint256 | the second numerator term |
| _den | uint256 | the denominator |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the approx result with up to off by 1 + MAX_ERROR, rounding down if needed |

### bigDiv2x2

```solidity
function bigDiv2x2(uint256 _numA, uint256 _numB, uint256 _denA, uint256 _denB) internal pure returns (uint256)
```

Returns the approx result of `a * b / (c * d)` so long as the result is <= MAX_UINT

_this uses bigDiv2x1 and adds additional rounding error so the max error of this
formula is larger_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _numA | uint256 | the first numerator term |
| _numB | uint256 | the second numerator term |
| _denA | uint256 | the first denominator term |
| _denB | uint256 | the second denominator term |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | the approx result with up to off by 2 + MAX_ERROR*10 error, rounding down if needed |

