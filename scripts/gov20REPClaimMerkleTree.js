require("@nomiclabs/hardhat-web3");

const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const Web3 = require("web3");

task(
  "gov20REPClaimMerkleTree",
  "Generate the merkle tree to be used for the REP claim"
).setAction(async () => {
  const chainId = await hre.web3.eth.net.getId();
  const accounts = await hre.web3.eth.getAccounts();

  // Set the WETH amount to be distributed
  const tokenAmount = chainId === 1 ? 10000 : 100;

  const receivers =
    chainId === 1
      ? [
          "0x81A94868572EA6E430F9a72ED6C4afB8b5003fDF",
          "0x08f8C46f9f71E301bA41f59C253c412F1A129daD",
          "0xe16d3664b313bd5FB8D911b467047e3CB4Ed853D",
          "0x9CA367224770B496fe009403da7b93A543DF3C45",
          "0x08EEc580AD41e9994599BaD7d2a74A9874A2852c",
          "0x7933b94746Df9a0791402C1Da59C371c1691f145",
          "0x1861974f32eaCDCceD0F81b0f8eCcFeD58153a9D",
          "0x91628ddc3A6ff9B48A2f34fC315D243eB07a9501",
          "0x3111327EdD38890C3fe564afd96b4C73e8101747",
          "0x36000d7592B3bCe1a5d7E24D99AD73E38E49CCe9",
          "0x7e72CfD9a36517435dc1ca7f9451ECCBC973111E",
          "0xF96187c99389cB17dAc7B1D762c1F549A249c987",
          "0xe858a4bf603995a9156EdBd25ff06269D997839E",
          "0x26358E62C2eDEd350e311bfde51588b8383A9315",
          "0xa5A29f81EEE450eC189b2F8B4562af1785595D69",
          "0xa493f3Adf76560092088a61e9e314a08D0B1B2b8",
          "0x5A3992044A131c2f633394065C13BA1b33CdFFD9",
          "0x05b0B6Ef681c9413D0e457f08aBA8354b8BF482a",
          "0x9B4C75cE8d7006620Df39e8757ade75D6434A6fE",
          "0xb0e83C2D71A991017e0116d58c5765Abc57384af",
          "0xE1D2210A967eE144aAD31EcD08565E894B88FFaf",
          "0xB5806a701c2ae0366e15BDe9bE140E82190fa3d6",
          "0x6f7C864Cc0FC9Fb2Fe26f53C031d3deeC0b8d7d5",
          "0x63a5D59953b8A317dE02b292549489e259CB77A5",
          "0xD97672177E0673227FA102C91BFA8b8cfA825141",
          "0x9aE035dEE8318A9b9fD080Dda31D7524098f65EF",
          "0xA932E2C7d88497fdee9d87e5a450BaE3874ff1A1",
          "0x03e4766aE55862c37D133FfDF497678e3d603A0c",
          "0x98E6E4a3856049Fec1272f61127eC30A96F77256",
          "0xc36cBdd85791a718ceFCA21045E773856A89C197",
          "0xF006779eAbE823F8EEd05464A1628383af1f7afb",
          "0x334F12AfB7D8740868bE04719639616533075234",
          "0x71C95151C960AA3976B462Ff41adB328790F110D",
          "0xa15Ca74e65bf72730811ABF95163E89aD9b9DFF6",
          "0x8F44e0c4dE4CDDd1dE0F15577a36C8C4fc7097c5",
          "0x617512FA7d3fd26bdA51b9Ac8c23b04a48D625f1",
          "0xA3d59249b5bAe16905613aD2BE5639FFA35BBb57",
          "0x9a23d52E8Cf96d776C2953B17edA463711b2d94a",
          "0xe6dc752F04414251d7b3474A7F9FF99e23647eFB",
          "0x8EcAB7B8ed8215cA52500cbf1548B9239173ef82",
          "0xFCd81C0D8fcDBA864cc558c17aF8EF83D05bdF45",
          "0xf3F93fabD88065c98a88f8c229085CE7D800E317",
          "0x7DC252B36Ca3dD3573aBFC47076D28BB423B0774",
          "0xF197CAF7b8cE72137C931Ef1fE0a70f4FBd2C545",
          "0x275cabAf6452D8A90FFB037B2aDB38f7194c57C7",
          "0x0b17cf48420400e1D71F8231d4a8e43B3566BB5B",
          "0x18B13ef88822292E59bfF80210D815F7FBFC9b32",
          "0x759A2169dA1b826F795A00A9aB5f29F9ca39E48a",
          "0x2dd17D7450eA0f02f7731d4520D51D641DAE333b",
          "0x166cEa845adE3F3b40eA68045D699deE5A645905",
          "0xD179b3217F9593a9FAac7c85D5ACAF1F5223d762",
          "0x3C87b4c34aBDb615Bd405458982e1A2076D24111",
          "0xF2a997f56373bC99fA6829098c78F10088255e77",
          "0x29fC44D5dAA3e191118f4EFA5e91eBfF572A0186",
          "0x9AD6bB93353DbAB28F37e3d0B3C57Acd4b445961",
          "0xA6cD28EF39015f7f9b162A6e08A6168C9EbfdD66",
          "0xc35A5FEc6BE6957899E15559Be252Db882220b37",
          "0xDd4a7cc4092515C130667C1bFd53Be0DE91062C5",
          "0x49786cB81DC288328459948a4039F069E4B4f8E3",
          "0xdec0DED0606B7d0560ADEBD6C3a919a671dB4D66",
          "0x13E209679a430d607cFF56fc8e001dfE0cAC80c9",
          "0xF50A3cfd68A00009623e1767eb696C4cC9347A7d",
          "0x4502166bE703312eae5137AD7399393b09471F27",
          "0xC75446A6AdaEF73269dBdEcE73536977B2b639e0",
          "0x79b63d1077C2F12015397A0922E516C1f68C0cE5",
          "0x6260204B5714C692804D1c71F325FDb0e184339D",
          "0x723CE1691EB38384Fe4111A8694Bf85c6218a09a",
          "0x11AA7ef6d9Fb561b2050c90F655286eA2409A477",
          "0xB435871B0959561226b4d903b1abf79528177E81",
          "0x6595732468A241312bc307F327bA0D64F02b3c20",
          "0xC4d9d1a93068d311Ab18E988244123430eB4F1CD",
          "0xd7FE300587d41ed0e8B6A2bEd5a1B2BB4fCdaD9E",
          "0x95a223299319022a842D0DfE4851C145A2F615B9",
          "0x02352E6DCF0c77577222adEE8C63d52243B5C33F",
          "0x839395e20bbB182fa440d08F850E6c7A8f6F0780",
          "0x436Bb9e1f02C9cA7164afb5753C03c071430216d",
          "0x308d5aa5ae305abeE43D060d8C3e990A5aF61Ed9",
          "0x91323447Dd945D0Efebd0eB4D9dad7C8478a40Bd",
          "0x3f78441292b95F346475e9aEf2649eBA5DcbF477",
          "0x93d29542401C00F1431fD1C80b634697e5645C59",
          "0x4171160dB0e7E2C75A4973b7523B437C010Dd9d4",
          "0x5ce7d4C2772915a649333edB5a02BdBD8109D570",
          "0x7088C5611dAE159A640d940cde0a3221a4af8896",
          "0x60DAFeDF4865CC4Bb95270002D04A25dcfc63c24",
          "0xB81E88279F3208001AEdA20689d3E5d818758dbf",
          "0x866dB98faE3FaFC84ebd9535a262dA858805B17a",
          "0x35E2acD3f46B13151BC941daa44785A38F3BD97A",
          "0x1dC96F305645b5Ac12dDa5151eB6704677C7dB12",
          "0xe8A06462628b49eb70DBF114EA510EB3BbBDf559",
          "0x56E48D3CECA7BE201CD181c765e9A57aE60f992e",
          "0x2b47C57A4c9Fc1649B43500f4c0cDa6cF29be278",
          "0xe29a27962E16Eb0A3C7826eBb960Bbe1e95f535e",
          "0xaD2c2A8800ee32fA966C3B16061A6BDFA47cf259",
          "0xca8252Afdf0dc2a94eaDef82536bB53C0Be7716A",
          "0x137695899d5cCFEA3084a2C3D026A757eE3f0464",
          "0x3c1863dedC30f8650E63E5c4b5400BA80e19B8Ac",
          "0x58fdd0fa08ccDE333E1F17d232DD418258fC5150",
          "0x3f3e6AdD7dA36A76539f1cC5b159D040c633134B",
          "0xB64850FE701fB64667B6CC762AA2c12f2E02193c",
          "0x3DaD32F81F5DC35d961d3DA77d32A0a268B8db44",
          "0xc4705681d89aA0d84B3f23e382a3A4c0Cd372b28",
          "0x628cC4601166a44e5378717790c8Da50de0cce9B",
          "0x2cc7Df4792E363be72c2f8A1f3cd8f086b5107dF",
          "0xBF0Dc9434B89f6271621548c01c247873EC2c207",
          "0xC4a69FBf4511A1377161834Cb7a3B8766953dB02",
          "0x58B753F0c417494226Af608B63E80028255CBc64",
          "0xF0c7ef0861D4F55368cBb7724EF61aEc198A8eFc",
          "0x06b172c63730F0cCFb40ea35E726ebF4E930c9e3",
          "0x01349510117dC9081937794939552463F5616dfb",
          "0x818Ff73A5d881C27A945bE944973156C01141232",
          "0x952d13D6f71b4a1399BBac77f07E4cA1bA48d22e",
          "0x3269C4C05356E511BC447DA5C722e63f682243C9",
          "0x6f0e26acB8D20A6356C98a5bb6E28e6D8deFc29B",
          "0x5FaaD293282818791356d5F83af8748Fb8842522",
          "0x4a0200096a86F4D51095A1e3C7a00b3744Dc3FF3",
          "0xceB5e5506a2924D0fEc82ae60b3726360C1D9759",
          "0x40035B9144baC13A0ca93003526f77dF3a8E2b55",
          "0x6dd5f1Bf1Ffa6A3173e333c1588f4cDdE8c6799E",
          "0x6502bc1deeB61C1Fce5151e90bCBE51Fc75CfB10",
          "0x151EaaA48bbD08B7Cc37B52216Cf54f54c41b24b",
          "0x13a0B42b9C180065510615972858bF41d1972a55",
          "0x2DF45c44c37757910b27d6dB10D5139D52a8EA13",
          "0xD97beFFDf558b269257fEba5dF111Ab718B71E24",
          "0x8a9BcDc68D19e111663D6c986caf1dA1edA1c304",
          "0x3E9976d5BA86a78d6E5c25bc2F309049676C0798",
          "0x2a58Ab26538a905F08aC7838B83c1c160430e744",
          "0x1dB2f5E4d469b59a6b7911Dc20133d46FF45B412",
          "0xd8f515DaD06a9f5B2cC761E5A108AA3eEb70c2B9",
          "0x88f1706c20d94A4d1551C5F799C9E3380A24C3AC",
          "0x3efD3391A0601eaA093647F911c653d77C11e3Fd",
          "0xbD7ACDbA6383F3187C0d7DBd046AF0834F06E92e",
          "0x3706c5FBE1d3f9d8e1da3c0989EcfF4cB84be4c8",
          "0x1c85d6Ae1336D0e4E3F165bbfA9641bfA04CeDb1",
          "0x914AA366fc6AF1CEF6d8B98Dd24b2842E0d14c39",
          "0xA92a012274E4056e1E591e52073D6C839af187C6",
          "0x2474B32a2F1ab83CF2Ac52080559706152909777",
          "0xD65478656497b3388c2c930DE3bc48Ac0688039d",
          "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
          "0xdCA51787f58C18fB8f613a27b84b108324ac4C52",
          "0x0BE639F29F75D7f0518a30e225aC9D898e034176",
          "0x7FB1D2CF886A66f0A2D6a4c841f529F116E274B1",
          "0x2e7853783E5a64f6F5971d538441a629F5CC05bD",
          "0xB16eCbB050EE31e3F034c5a5a02D6E2bb272987A",
          "0x097468dc04CbBb63cB0A3E28D3d9906471D6eBF0",
          "0x6d1A4be65723355a9f5b12C446780a5000849461",
          "0x9671a3fbBfB13D68E5770Afed424F8915eA0adA3",
          "0xC66aD11962CD7f4E3a8344A2F2A9d8036B4a2029",
          "0x27657399177403a891CC7A22Bd6F2C00621Db7b0",
          "0xE2F35B376461E7FDd2f2E45248E4c3cD9626A933",
          "0x399c7819840329E2B73449d6afcF7f4Fd71399b2",
          "0x6651a0A95e7E19C13DD94CAb16c91C201337B56A",
          "0x24597c5c68687E816fFc0C69E064Cb70Bb62a9Cd",
          "0x9A94Ac82B17E67F7dff81912de68EB74ca20E6C3",
          "0x6ac0A885Ed84F4A2D062c60FB7DaaF504Fc8C47f",
        ]
      : [accounts[0], accounts[1], accounts[2], accounts[3], accounts[4]];

  const percentages =
    chainId === 1
      ? [
          10.1795, 7.0456, 6.1336, 5.891, 4.5348, 4.3822, 4.2955, 4.0493,
          2.5878, 2.2219, 2.2175, 2.1178, 2.0725, 1.9262, 1.7792, 1.7015,
          1.6933, 1.5942, 1.5854, 1.5141, 1.4472, 1.1105, 1.0564, 1.0424,
          1.0225, 1.005, 0.9532, 0.9281, 0.9219, 0.912, 0.8885, 0.8696, 0.8444,
          0.7635, 0.6877, 0.6012, 0.5812, 0.5797, 0.5279, 0.508, 0.4841, 0.484,
          0.4711, 0.3962, 0.3953, 0.3695, 0.3568, 0.3517, 0.3489, 0.3338,
          0.3213, 0.3199, 0.3179, 0.3102, 0.3081, 0.3073, 0.2733, 0.245, 0.2366,
          0.2297, 0.2282, 0.2147, 0.2121, 0.2089, 0.2046, 0.2044, 0.1997,
          0.1954, 0.1939, 0.1893, 0.1854, 0.1761, 0.1673, 0.1672, 0.1598,
          0.1593, 0.1486, 0.1443, 0.1302, 0.1159, 0.1117, 0.1075, 0.1042,
          0.0999, 0.0998, 0.0998, 0.0997, 0.0988, 0.0931, 0.0925, 0.0775,
          0.0775, 0.0775, 0.0728, 0.0698, 0.0644, 0.0549, 0.0507, 0.0465,
          0.0463, 0.0451, 0.0437, 0.0428, 0.0395, 0.0392, 0.0388, 0.0388,
          0.0388, 0.0388, 0.0388, 0.0388, 0.0388, 0.0388, 0.0388, 0.0388,
          0.0388, 0.0372, 0.035, 0.031, 0.0307, 0.0289, 0.0242, 0.0236, 0.0233,
          0.0189, 0.0184, 0.0174, 0.0169, 0.0159, 0.0139, 0.0134, 0.0125,
          0.0123, 0.0123, 0.012, 0.0103, 0.0091, 0.0078, 0.0078, 0.0078, 0.0078,
          0.0074, 0.0064, 0.0062, 0.0022, 0.0018, 0.0016, 0.0016, 0.0008,
          0.0006, 0.0002, 0.0002, 0.0002, 0.0001,
        ]
      : [40, 20, 20, 10, 10];

  // We get the sum of all percentages that is around 100
  const sumOfAllPercentages = percentages.reduce((a, b) => a + b, 0);

  const generateLeaf = function (address, value) {
    return Buffer.from(
      // Hash in appropriate Merkle format
      web3.utils.soliditySha3(address, value.toString()).slice(2),
      "hex"
    );
  };

  const leaves = [];

  // Generate merkle tree
  const merkleTree = new MerkleTree(
    receivers.map((receiver, i) => {
      const amountToSend = Web3.utils.toWei(
        ((tokenAmount / sumOfAllPercentages) * percentages[i]).toString()
      );
      const leaf = generateLeaf(receiver, amountToSend);
      leaves.push({
        address: receiver,
        amount: amountToSend,
        hex: leaf.toString("hex"),
        proof: [],
      });
      return leaf;
    }),
    keccak256,
    { sortPairs: true }
  );

  // Get the Merkle Root
  const merkleRoot = merkleTree.getHexRoot();

  // Now that the MerkleTree is generated we calculate the proof of each leaf
  console.log("Receiver, AmountToSend, Leaf Hex, Leaf Proof");
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const proof = merkleTree.getHexProof(Buffer.from(leaf.hex, "hex"));
    leaf.proof = proof;
    console.log(leaf.address, leaf.amount, leaf.hex, leaf.proof);
  }

  return {
    merkleRoot,
    leaves,
  };
});
