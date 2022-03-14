import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert } from "chai";
import { artifacts, contract } from "hardhat";
import { describe } from "pm2";

const GuildRegistry = artifacts.require("GuildRegistry.sol");

contract("GuildRegistry", () => {
  describe("Retrieve Guild Registry information", () => {
    it("should add a new guild address to the array", async () => {});
    it("should remove a guild address in the array", () => {});
    it("should return the total amount of guilds", () => {});
    it("should return all guild addresses", () => {});
  });
});
