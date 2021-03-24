#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

NODE_OPTIONS=--max-old-space-size=4096 OVERRIDE_GAS_LIMIT=0xfffffffffff OVERRIDE_GAS_PRICE=1 npx hardhat coverage
