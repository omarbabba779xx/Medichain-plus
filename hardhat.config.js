require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY     = process.env.PRIVATE_KEY  || "0x" + "0".repeat(64);
const AMOY_RPC        = process.env.AMOY_RPC     || "https://rpc-amoy.polygon.technology/";
const POLYGONSCAN_API = process.env.POLYGONSCAN_API || "";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat:   { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545" },
    amoy: {
      url:      AMOY_RPC,
      accounts: PRIVATE_KEY !== "0x" + "0".repeat(64) ? [PRIVATE_KEY] : [],
      chainId:  80002,
      // "auto" délègue la détection EIP-1559 au provider (ethers v6 gère automatiquement)
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: { polygonAmoy: POLYGONSCAN_API },
    customChains: [{
      network:   "polygonAmoy",
      chainId:   80002,
      urls: {
        apiURL:      "https://api-amoy.polygonscan.com/api",
        browserURL:  "https://amoy.polygonscan.com",
      },
    }],
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
  mocha: { timeout: 60000 },
};
