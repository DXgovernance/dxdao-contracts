#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

yarn solhint contracts/schemes/*.sol 
yarn solhint contracts/erc20Guild/*.sol 
yarn solhint contracts/omen/*.sol 
yarn solhint contracts/dxdao/*.sol 
