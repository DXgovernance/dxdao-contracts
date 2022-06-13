import { assert } from "chai";
import { artifacts, contract } from "hardhat";
import {
  ANY_ADDRESS,
  SOME_ADDRESS,
  SOME_OTHER_ADDRESS,
} from "../../helpers/constants";
import { expectRevert, expectEvent } from "@openzeppelin/test-helpers";

const GuildRegistry = artifacts.require("GuildRegistry.sol");

contract("GuildRegistry", accounts => {
  let guildRegistry;
  beforeEach(async () => {
    guildRegistry = await GuildRegistry.new({
      from: accounts[0],
    });
  });

  describe("Retrieve Guild Registry information", () => {
    it("should initialize with no data", async () => {
      const getGuildsAddresses = await guildRegistry.getGuildsAddresses();
      assert.deepEqual(getGuildsAddresses, []);
    });

    it("should add a new guild address to the array if you are the owner", async () => {
      const addGuild = await guildRegistry.addGuild(SOME_ADDRESS, {
        from: accounts[0],
      });
      const getGuildsAddresses = await guildRegistry.getGuildsAddresses();
      assert.deepEqual(getGuildsAddresses, [SOME_ADDRESS]);
      assert.equal(getGuildsAddresses.length, 1);
      await expectEvent(addGuild, "AddGuild");
    });

    it("should revert if not the owner for addGuild and removeGuild", async () => {
      await expectRevert(
        guildRegistry.addGuild(SOME_ADDRESS, {
          from: accounts[1],
        }),
        "Ownable: caller is not the owner"
      );
      await expectRevert(
        guildRegistry.removeGuild(SOME_ADDRESS, {
          from: accounts[1],
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("should not be able to remove a guild address if there are none existing", async () => {
      await expectRevert(
        guildRegistry.removeGuild(SOME_ADDRESS, {
          from: accounts[0],
        }),
        "No guilds to delete"
      );
    });

    it.only("should remove the right guild address in the array", async () => {
      guildRegistry.addGuild(SOME_ADDRESS, { from: accounts[0] });
      guildRegistry.addGuild(SOME_OTHER_ADDRESS, { from: accounts[0] });
      guildRegistry.addGuild(ANY_ADDRESS, { from: accounts[0] });
      const removeGuild = await guildRegistry.removeGuild(SOME_ADDRESS, {
        from: accounts[0],
      });
      const getGuildsAddresses1 = await guildRegistry.getGuildsAddresses();
      assert.deepEqual(getGuildsAddresses1, [ANY_ADDRESS, SOME_OTHER_ADDRESS]);
      await expectEvent(removeGuild, "RemoveGuild");
      await guildRegistry.removeGuild(ANY_ADDRESS, {
        from: accounts[0],
      });
      const getGuildsAddresses2 = await guildRegistry.getGuildsAddresses();
      assert.deepEqual(getGuildsAddresses2, [SOME_OTHER_ADDRESS]);

      await guildRegistry.removeGuild(SOME_OTHER_ADDRESS, {
        from: accounts[0],
      });
      const getGuildsAddresses3 = await guildRegistry.getGuildsAddresses();
      assert.deepEqual(getGuildsAddresses3, []);
    });

    it("should return all guild addresses", async () => {
      await guildRegistry.addGuild(SOME_ADDRESS, { from: accounts[0] });
      await guildRegistry.addGuild(SOME_OTHER_ADDRESS, { from: accounts[0] });
      const getGuildsAddresses = await guildRegistry.getGuildsAddresses();
      assert.equal(getGuildsAddresses.length, 2);
    });
  });
});
