module.exports = {
  networks: {
    testrpc: {
      host: "localhost",
      port: 8545,
      network_id: "*",
      gas: 4500000, // Gas limit used for deploys
      gasPrice: 10000000000 // 10 gwei
    },
    v24: {
      host: "chain.v24.cn",
      port: 8545,
      network_id: "10",
      from: "0xbc7cab179e25799e0206d3b25cbeec77271254af", // enter your local rinkeby unlocked address
      gas: 4500000, // Gas limit used for deploys
      gasPrice: 10000000000 // 10 gwei
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  // https://truffle.readthedocs.io/en/beta/advanced/configuration/
  mocha: {
    bail: true
  }
};
