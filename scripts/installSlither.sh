#!/usr/bin/env bash
python -m venv venv;
source venv/bin/activate;
pip install --upgrade pip;
pip install slither-analyzer==0.8.2;
