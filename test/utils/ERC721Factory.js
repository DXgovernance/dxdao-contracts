import { artifacts, contract } from "hardhat";
import { SOME_ADDRESS, SOME_TOKEN_URI } from "../helpers/constants";
import { expectRevert, expectEvent } from "@openzeppelin/test-helpers";

const ERC721Factory = artifacts.require("ERC721Factory.sol");

contract("ERC721Factory", accounts => {
  let erc721Factory;
  beforeEach(async () => {
    erc721Factory = await ERC721Factory.new("DXDAO NFT", "DXNFT", {
      from: accounts[0],
    });
  });

  describe("Mint ERC721Factory", () => {
    it("should mint a ERC721Factory", async () => {
      const mint = await erc721Factory.mint(SOME_ADDRESS, SOME_TOKEN_URI, {
        from: accounts[0],
      });
      await expectEvent(mint, "Transfer");
    });
    it("should not mint a ERC721Factory if not the owner", async () => {
      await expectRevert(
        erc721Factory.mint(SOME_ADDRESS, SOME_TOKEN_URI, {
          from: accounts[1],
        }),
        "Ownable: caller is not the owner"
      );
    });
  });
});
