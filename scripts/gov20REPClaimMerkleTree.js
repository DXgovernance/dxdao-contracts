require("@nomiclabs/hardhat-web3");

const XLSX = require("xlsx");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const Web3 = require("web3");

task(
  "gov20REPClaimMerkleTree",
  "Generate the merkle tree to be used for the REP claim"
).setAction(async () => {
  // Set the WETH amount to be distributed
  const tokenAmount = 932.6;

  const receivers = [
    {
      address: "0x81A94868572EA6E430F9a72ED6C4afB8b5003fDF",
      percentage: 10.1795,
    },
    {
      address: "0x08f8C46f9f71E301bA41f59C253c412F1A129daD",
      percentage: 7.0456,
    },
    {
      address: "0xe16d3664b313bd5FB8D911b467047e3CB4Ed853D",
      percentage: 6.1336,
    },
    {
      address: "0x9CA367224770B496fe009403da7b93A543DF3C45",
      percentage: 5.891,
    },
    {
      address: "0x08EEc580AD41e9994599BaD7d2a74A9874A2852c",
      percentage: 4.5348,
    },
    {
      address: "0x7933b94746Df9a0791402C1Da59C371c1691f145",
      percentage: 4.3822,
    },
    {
      address: "0x1861974f32eaCDCceD0F81b0f8eCcFeD58153a9D",
      percentage: 4.2955,
    },
    {
      address: "0x91628ddc3A6ff9B48A2f34fC315D243eB07a9501",
      percentage: 4.0493,
    },
    {
      address: "0x3111327EdD38890C3fe564afd96b4C73e8101747",
      percentage: 2.5878,
    },
    {
      address: "0x36000d7592B3bCe1a5d7E24D99AD73E38E49CCe9",
      percentage: 2.2219,
    },
    {
      address: "0x7e72CfD9a36517435dc1ca7f9451ECCBC973111E",
      percentage: 2.2175,
    },
    {
      address: "0xF96187c99389cB17dAc7B1D762c1F549A249c987",
      percentage: 2.1178,
    },
    {
      address: "0xe858a4bf603995a9156EdBd25ff06269D997839E",
      percentage: 2.0725,
    },
    {
      address: "0x26358E62C2eDEd350e311bfde51588b8383A9315",
      percentage: 1.9262,
    },
    {
      address: "0xa5A29f81EEE450eC189b2F8B4562af1785595D69",
      percentage: 1.7792,
    },
    {
      address: "0xa493f3Adf76560092088a61e9e314a08D0B1B2b8",
      percentage: 1.7015,
    },
    {
      address: "0x5A3992044A131c2f633394065C13BA1b33CdFFD9",
      percentage: 1.6933,
    },
    {
      address: "0x05b0B6Ef681c9413D0e457f08aBA8354b8BF482a",
      percentage: 1.5942,
    },
    {
      address: "0x9B4C75cE8d7006620Df39e8757ade75D6434A6fE",
      percentage: 1.5854,
    },
    {
      address: "0xb0e83C2D71A991017e0116d58c5765Abc57384af",
      percentage: 1.5141,
    },
    {
      address: "0xE1D2210A967eE144aAD31EcD08565E894B88FFaf",
      percentage: 1.4472,
    },
    {
      address: "0xB5806a701c2ae0366e15BDe9bE140E82190fa3d6",
      percentage: 1.1105,
    },
    {
      address: "0x6f7C864Cc0FC9Fb2Fe26f53C031d3deeC0b8d7d5",
      percentage: 1.0564,
    },
    {
      address: "0x63a5D59953b8A317dE02b292549489e259CB77A5",
      percentage: 1.0424,
    },
    {
      address: "0xD97672177E0673227FA102C91BFA8b8cfA825141",
      percentage: 1.0225,
    },
    {
      address: "0x9aE035dEE8318A9b9fD080Dda31D7524098f65EF",
      percentage: 1.005,
    },
    {
      address: "0xA932E2C7d88497fdee9d87e5a450BaE3874ff1A1",
      percentage: 0.9532,
    },
    {
      address: "0x03e4766aE55862c37D133FfDF497678e3d603A0c",
      percentage: 0.9281,
    },
    {
      address: "0x98E6E4a3856049Fec1272f61127eC30A96F77256",
      percentage: 0.9219,
    },
    {
      address: "0xc36cBdd85791a718ceFCA21045E773856A89C197",
      percentage: 0.912,
    },
    {
      address: "0xF006779eAbE823F8EEd05464A1628383af1f7afb",
      percentage: 0.8885,
    },
    {
      address: "0x334F12AfB7D8740868bE04719639616533075234",
      percentage: 0.8696,
    },
    {
      address: "0x71C95151C960AA3976B462Ff41adB328790F110D",
      percentage: 0.8444,
    },
    {
      address: "0xa15Ca74e65bf72730811ABF95163E89aD9b9DFF6",
      percentage: 0.7635,
    },
    {
      address: "0x8F44e0c4dE4CDDd1dE0F15577a36C8C4fc7097c5",
      percentage: 0.6877,
    },
    {
      address: "0x617512FA7d3fd26bdA51b9Ac8c23b04a48D625f1",
      percentage: 0.6012,
    },
    {
      address: "0xA3d59249b5bAe16905613aD2BE5639FFA35BBb57",
      percentage: 0.5812,
    },
    {
      address: "0x9a23d52E8Cf96d776C2953B17edA463711b2d94a",
      percentage: 0.5797,
    },
    {
      address: "0xe6dc752F04414251d7b3474A7F9FF99e23647eFB",
      percentage: 0.5279,
    },
    {
      address: "0x8EcAB7B8ed8215cA52500cbf1548B9239173ef82",
      percentage: 0.508,
    },
    {
      address: "0xFCd81C0D8fcDBA864cc558c17aF8EF83D05bdF45",
      percentage: 0.4841,
    },
    {
      address: "0xf3F93fabD88065c98a88f8c229085CE7D800E317",
      percentage: 0.484,
    },
    {
      address: "0x7DC252B36Ca3dD3573aBFC47076D28BB423B0774",
      percentage: 0.4711,
    },
    {
      address: "0xF197CAF7b8cE72137C931Ef1fE0a70f4FBd2C545",
      percentage: 0.3962,
    },
    {
      address: "0x275cabAf6452D8A90FFB037B2aDB38f7194c57C7",
      percentage: 0.3953,
    },
    {
      address: "0x0b17cf48420400e1D71F8231d4a8e43B3566BB5B",
      percentage: 0.3695,
    },
    {
      address: "0x18B13ef88822292E59bfF80210D815F7FBFC9b32",
      percentage: 0.3568,
    },
    {
      address: "0x759A2169dA1b826F795A00A9aB5f29F9ca39E48a",
      percentage: 0.3517,
    },
    {
      address: "0x2dd17D7450eA0f02f7731d4520D51D641DAE333b",
      percentage: 0.3489,
    },
    {
      address: "0x166cEa845adE3F3b40eA68045D699deE5A645905",
      percentage: 0.3338,
    },
    {
      address: "0xD179b3217F9593a9FAac7c85D5ACAF1F5223d762",
      percentage: 0.3213,
    },
    {
      address: "0x3C87b4c34aBDb615Bd405458982e1A2076D24111",
      percentage: 0.3199,
    },
    {
      address: "0xF2a997f56373bC99fA6829098c78F10088255e77",
      percentage: 0.3179,
    },
    {
      address: "0x29fC44D5dAA3e191118f4EFA5e91eBfF572A0186",
      percentage: 0.3102,
    },
    {
      address: "0x9AD6bB93353DbAB28F37e3d0B3C57Acd4b445961",
      percentage: 0.3081,
    },
    {
      address: "0xA6cD28EF39015f7f9b162A6e08A6168C9EbfdD66",
      percentage: 0.3073,
    },
    {
      address: "0xc35A5FEc6BE6957899E15559Be252Db882220b37",
      percentage: 0.2733,
    },
    {
      address: "0xDd4a7cc4092515C130667C1bFd53Be0DE91062C5",
      percentage: 0.245,
    },
    {
      address: "0x49786cB81DC288328459948a4039F069E4B4f8E3",
      percentage: 0.2366,
    },
    {
      address: "0xdec0DED0606B7d0560ADEBD6C3a919a671dB4D66",
      percentage: 0.2297,
    },
    {
      address: "0x13E209679a430d607cFF56fc8e001dfE0cAC80c9",
      percentage: 0.2282,
    },
    {
      address: "0xF50A3cfd68A00009623e1767eb696C4cC9347A7d",
      percentage: 0.2147,
    },
    {
      address: "0x4502166bE703312eae5137AD7399393b09471F27",
      percentage: 0.2121,
    },
    {
      address: "0xC75446A6AdaEF73269dBdEcE73536977B2b639e0",
      percentage: 0.2089,
    },
    {
      address: "0x79b63d1077C2F12015397A0922E516C1f68C0cE5",
      percentage: 0.2046,
    },
    {
      address: "0x6260204B5714C692804D1c71F325FDb0e184339D",
      percentage: 0.2044,
    },
    {
      address: "0x723CE1691EB38384Fe4111A8694Bf85c6218a09a",
      percentage: 0.1997,
    },
    {
      address: "0x11AA7ef6d9Fb561b2050c90F655286eA2409A477",
      percentage: 0.1954,
    },
    {
      address: "0xB435871B0959561226b4d903b1abf79528177E81",
      percentage: 0.1939,
    },
    {
      address: "0x6595732468A241312bc307F327bA0D64F02b3c20",
      percentage: 0.1893,
    },
    {
      address: "0xC4d9d1a93068d311Ab18E988244123430eB4F1CD",
      percentage: 0.1854,
    },
    {
      address: "0xd7FE300587d41ed0e8B6A2bEd5a1B2BB4fCdaD9E",
      percentage: 0.1761,
    },
    {
      address: "0x95a223299319022a842D0DfE4851C145A2F615B9",
      percentage: 0.1673,
    },
    {
      address: "0x02352E6DCF0c77577222adEE8C63d52243B5C33F",
      percentage: 0.1672,
    },
    {
      address: "0x839395e20bbB182fa440d08F850E6c7A8f6F0780",
      percentage: 0.1598,
    },
    {
      address: "0x436Bb9e1f02C9cA7164afb5753C03c071430216d",
      percentage: 0.1593,
    },
    {
      address: "0x308d5aa5ae305abeE43D060d8C3e990A5aF61Ed9",
      percentage: 0.1486,
    },
    {
      address: "0x91323447Dd945D0Efebd0eB4D9dad7C8478a40Bd",
      percentage: 0.1443,
    },
    {
      address: "0x3f78441292b95F346475e9aEf2649eBA5DcbF477",
      percentage: 0.1302,
    },
    {
      address: "0x93d29542401C00F1431fD1C80b634697e5645C59",
      percentage: 0.1159,
    },
    {
      address: "0x4171160dB0e7E2C75A4973b7523B437C010Dd9d4",
      percentage: 0.1117,
    },
    {
      address: "0x5ce7d4C2772915a649333edB5a02BdBD8109D570",
      percentage: 0.1075,
    },
    {
      address: "0x7088C5611dAE159A640d940cde0a3221a4af8896",
      percentage: 0.1042,
    },
    {
      address: "0x60DAFeDF4865CC4Bb95270002D04A25dcfc63c24",
      percentage: 0.0999,
    },
    {
      address: "0xB81E88279F3208001AEdA20689d3E5d818758dbf",
      percentage: 0.0998,
    },
    {
      address: "0x866dB98faE3FaFC84ebd9535a262dA858805B17a",
      percentage: 0.0998,
    },
    {
      address: "0x35E2acD3f46B13151BC941daa44785A38F3BD97A",
      percentage: 0.0997,
    },
    {
      address: "0x1dC96F305645b5Ac12dDa5151eB6704677C7dB12",
      percentage: 0.0988,
    },
    {
      address: "0xe8A06462628b49eb70DBF114EA510EB3BbBDf559",
      percentage: 0.0931,
    },
    {
      address: "0x56E48D3CECA7BE201CD181c765e9A57aE60f992e",
      percentage: 0.0925,
    },
    {
      address: "0x2b47C57A4c9Fc1649B43500f4c0cDa6cF29be278",
      percentage: 0.0775,
    },
    {
      address: "0xe29a27962E16Eb0A3C7826eBb960Bbe1e95f535e",
      percentage: 0.0775,
    },
    {
      address: "0xaD2c2A8800ee32fA966C3B16061A6BDFA47cf259",
      percentage: 0.0775,
    },
    {
      address: "0xca8252Afdf0dc2a94eaDef82536bB53C0Be7716A",
      percentage: 0.0728,
    },
    {
      address: "0x137695899d5cCFEA3084a2C3D026A757eE3f0464",
      percentage: 0.0698,
    },
    {
      address: "0x3c1863dedC30f8650E63E5c4b5400BA80e19B8Ac",
      percentage: 0.0644,
    },
    {
      address: "0x58fdd0fa08ccDE333E1F17d232DD418258fC5150",
      percentage: 0.0549,
    },
    {
      address: "0x3f3e6AdD7dA36A76539f1cC5b159D040c633134B",
      percentage: 0.0507,
    },
    {
      address: "0xB64850FE701fB64667B6CC762AA2c12f2E02193c",
      percentage: 0.0465,
    },
    {
      address: "0x3DaD32F81F5DC35d961d3DA77d32A0a268B8db44",
      percentage: 0.0463,
    },
    {
      address: "0xc4705681d89aA0d84B3f23e382a3A4c0Cd372b28",
      percentage: 0.0451,
    },
    {
      address: "0x628cC4601166a44e5378717790c8Da50de0cce9B",
      percentage: 0.0437,
    },
    {
      address: "0x2cc7Df4792E363be72c2f8A1f3cd8f086b5107dF",
      percentage: 0.0428,
    },
    {
      address: "0xBF0Dc9434B89f6271621548c01c247873EC2c207",
      percentage: 0.0395,
    },
    {
      address: "0xC4a69FBf4511A1377161834Cb7a3B8766953dB02",
      percentage: 0.0392,
    },
    {
      address: "0x58B753F0c417494226Af608B63E80028255CBc64",
      percentage: 0.0388,
    },
    {
      address: "0xF0c7ef0861D4F55368cBb7724EF61aEc198A8eFc",
      percentage: 0.0388,
    },
    {
      address: "0x06b172c63730F0cCFb40ea35E726ebF4E930c9e3",
      percentage: 0.0388,
    },
    {
      address: "0x01349510117dC9081937794939552463F5616dfb",
      percentage: 0.0388,
    },
    {
      address: "0x818Ff73A5d881C27A945bE944973156C01141232",
      percentage: 0.0388,
    },
    {
      address: "0x952d13D6f71b4a1399BBac77f07E4cA1bA48d22e",
      percentage: 0.0388,
    },
    {
      address: "0x3269C4C05356E511BC447DA5C722e63f682243C9",
      percentage: 0.0388,
    },
    {
      address: "0x6f0e26acB8D20A6356C98a5bb6E28e6D8deFc29B",
      percentage: 0.0388,
    },
    {
      address: "0x5FaaD293282818791356d5F83af8748Fb8842522",
      percentage: 0.0388,
    },
    {
      address: "0x4a0200096a86F4D51095A1e3C7a00b3744Dc3FF3",
      percentage: 0.0388,
    },
    {
      address: "0xceB5e5506a2924D0fEc82ae60b3726360C1D9759",
      percentage: 0.0388,
    },
    {
      address: "0x40035B9144baC13A0ca93003526f77dF3a8E2b55",
      percentage: 0.0372,
    },
    {
      address: "0x6dd5f1Bf1Ffa6A3173e333c1588f4cDdE8c6799E",
      percentage: 0.035,
    },
    {
      address: "0x6502bc1deeB61C1Fce5151e90bCBE51Fc75CfB10",
      percentage: 0.031,
    },
    {
      address: "0x151EaaA48bbD08B7Cc37B52216Cf54f54c41b24b",
      percentage: 0.0307,
    },
    {
      address: "0x13a0B42b9C180065510615972858bF41d1972a55",
      percentage: 0.0289,
    },
    {
      address: "0x2DF45c44c37757910b27d6dB10D5139D52a8EA13",
      percentage: 0.0242,
    },
    {
      address: "0xD97beFFDf558b269257fEba5dF111Ab718B71E24",
      percentage: 0.0236,
    },
    {
      address: "0x8a9BcDc68D19e111663D6c986caf1dA1edA1c304",
      percentage: 0.0233,
    },
    {
      address: "0x3E9976d5BA86a78d6E5c25bc2F309049676C0798",
      percentage: 0.0189,
    },
    {
      address: "0x2a58Ab26538a905F08aC7838B83c1c160430e744",
      percentage: 0.0184,
    },
    {
      address: "0x1dB2f5E4d469b59a6b7911Dc20133d46FF45B412",
      percentage: 0.0174,
    },
    {
      address: "0xd8f515DaD06a9f5B2cC761E5A108AA3eEb70c2B9",
      percentage: 0.0169,
    },
    {
      address: "0x88f1706c20d94A4d1551C5F799C9E3380A24C3AC",
      percentage: 0.0159,
    },
    {
      address: "0x3efD3391A0601eaA093647F911c653d77C11e3Fd",
      percentage: 0.0139,
    },
    {
      address: "0xbD7ACDbA6383F3187C0d7DBd046AF0834F06E92e",
      percentage: 0.0134,
    },
    {
      address: "0x3706c5FBE1d3f9d8e1da3c0989EcfF4cB84be4c8",
      percentage: 0.0125,
    },
    {
      address: "0x1c85d6Ae1336D0e4E3F165bbfA9641bfA04CeDb1",
      percentage: 0.0123,
    },
    {
      address: "0x914AA366fc6AF1CEF6d8B98Dd24b2842E0d14c39",
      percentage: 0.0123,
    },
    {
      address: "0xA92a012274E4056e1E591e52073D6C839af187C6",
      percentage: 0.012,
    },
    {
      address: "0x2474B32a2F1ab83CF2Ac52080559706152909777",
      percentage: 0.0103,
    },
    {
      address: "0xD65478656497b3388c2c930DE3bc48Ac0688039d",
      percentage: 0.0091,
    },
    {
      address: "0xA601aeD34dda12fF760d8ABb64Fd4Eb3664E35Af",
      percentage: 0.0078,
    },
    {
      address: "0xdCA51787f58C18fB8f613a27b84b108324ac4C52",
      percentage: 0.0078,
    },
    {
      address: "0x0BE639F29F75D7f0518a30e225aC9D898e034176",
      percentage: 0.0078,
    },
    {
      address: "0x7FB1D2CF886A66f0A2D6a4c841f529F116E274B1",
      percentage: 0.0078,
    },
    {
      address: "0x2e7853783E5a64f6F5971d538441a629F5CC05bD",
      percentage: 0.0074,
    },
    {
      address: "0xB16eCbB050EE31e3F034c5a5a02D6E2bb272987A",
      percentage: 0.0064,
    },
    {
      address: "0x097468dc04CbBb63cB0A3E28D3d9906471D6eBF0",
      percentage: 0.0062,
    },
    {
      address: "0x6d1A4be65723355a9f5b12C446780a5000849461",
      percentage: 0.0022,
    },
    {
      address: "0x9671a3fbBfB13D68E5770Afed424F8915eA0adA3",
      percentage: 0.0018,
    },
    {
      address: "0xC66aD11962CD7f4E3a8344A2F2A9d8036B4a2029",
      percentage: 0.0016,
    },
    {
      address: "0x27657399177403a891CC7A22Bd6F2C00621Db7b0",
      percentage: 0.0016,
    },
    {
      address: "0xE2F35B376461E7FDd2f2E45248E4c3cD9626A933",
      percentage: 0.0008,
    },
    {
      address: "0x399c7819840329E2B73449d6afcF7f4Fd71399b2",
      percentage: 0.0006,
    },
    {
      address: "0x6651a0A95e7E19C13DD94CAb16c91C201337B56A",
      percentage: 0.0002,
    },
    {
      address: "0x24597c5c68687E816fFc0C69E064Cb70Bb62a9Cd",
      percentage: 0.0002,
    },
    {
      address: "0x9A94Ac82B17E67F7dff81912de68EB74ca20E6C3",
      percentage: 0.0002,
    },
    {
      address: "0x6ac0A885Ed84F4A2D062c60FB7DaaF504Fc8C47f",
      percentage: 0.0001,
    },
  ];

  // We get the sum of all percentages that is around 100
  const sumOfAllPercentages = receivers.reduce(
    (acc, receiver) => acc + receiver.percentage,
    0
  );

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
    receivers.map(receiver => {
      const amountToSend = Web3.utils.toWei(
        ((tokenAmount / sumOfAllPercentages) * receiver.percentage)
          .toFixed(18)
          .toString()
      );
      const leaf = generateLeaf(receiver.address, amountToSend);
      leaves.push({
        address: receiver.address,
        weiAmount: amountToSend,
        leafProof: [],
        leafHash: leaf.toString("hex"),
      });
      return leaf;
    }),
    keccak256,
    { sortPairs: true }
  );

  // Get the Merkle Root
  const merkleRoot = merkleTree.getHexRoot();

  // Now that the MerkleTree is generated we calculate the proof of each leaf
  console.log("Receiver, WEI Amount, ETH Amount, Leaf Hex, Leaf Proof");
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    leaf.leafProof =
      "[" +
      merkleTree.getHexProof(Buffer.from(leaf.leafHash, "hex")).toString() +
      "]";
    console.log(
      "#" + i,
      leaf.address,
      leaf.weiAmount,
      web3.utils.fromWei(leaf.weiAmount),
      leaf.leafHash
    );
  }

  // Save everything into a spreadsheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(leaves);
  XLSX.utils.book_append_sheet(workbook, worksheet, "REP Merkle Proofs");
  XLSX.writeFile(workbook, "docs/Gov 2.0 REP Distribution.xlsx");

  return {
    merkleRoot,
    leaves,
  };
});
