/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");

const { doActions } = require("./utils/do-actions");

task("actions-dxdao-contracts", "Execute actions on dxdao-contracts")
  .addParam("actions", "The actions json array in string format")
  .addParam(
    "networkContracts",
    "The networkContracts json object in string format"
  )
  .setAction(async ({ actions, networkContracts }) => {
    // Do actions
    await doActions(JSON.parse(actions), JSON.parse(networkContracts));

    return;
  });
