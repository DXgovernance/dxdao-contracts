import { artifacts, contract } from "hardhat";
import { SOME_ADDRESS, SOME_TOKEN_URI } from "../../helpers/constants";
import { expectRevert, expectEvent } from "@openzeppelin/test-helpers";

const DXdaoNFT = artifacts.require("DXdaoNFT.sol");

contract("DXdaoNFT", accounts => {
  let dxDaoNFT;
  beforeEach(async () => {
    dxDaoNFT = await DXdaoNFT.new({
      from: accounts[0],
    });
  });

  describe("Mint DXdaoNFT", () => {
    it("should mint a DXdaoNFT", async () => {
      const mint = await dxDaoNFT.mint(SOME_ADDRESS, SOME_TOKEN_URI, {
        from: accounts[0],
      });
      await expectEvent(mint, "Transfer");
    });
    it("should not mint a DXdaoNFT if not the owner", async () => {
      await expectRevert(
        dxDaoNFT.mint(SOME_ADDRESS, SOME_TOKEN_URI, {
          from: accounts[1],
        }),
        "Ownable: caller is not the owner"
      );
    });
  });
});
