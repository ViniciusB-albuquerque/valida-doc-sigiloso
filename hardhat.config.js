require("@nomicfoundation/hardhat-toolbox");

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      // A rede Besu da disciplina (bc101-dev-env) só habilita fork até
      // Berlin no genesis.json. Sem isso, o compilador pode inserir
      // opcodes de forks mais recentes (ex.: PUSH0, do Shanghai) que essa
      // rede não entende, e o deploy falha com opcode inválido.
      evmVersion: "berlin",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    besu: {
      // Mesmo RPC e chainId do Hardhat local (coincidência do ambiente da
      // disciplina) — mas aqui aponta pra rede Docker/Besu, não pro
      // "npx hardhat node". Os dois não podem rodar ao mesmo tempo: ambos
      // usam a porta 8545 do host.
      url: "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: [
        // Conta pré-financiada do genesis.json da Besu (bc101-dev-env),
        // usada como `vara` nesta rede. Nunca faça isso com uma chave de
        // rede real — só serve porque é uma rede de desenvolvimento local,
        // com as chaves publicamente conhecidas no próprio repositório do
        // professor.
        "0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63",
      ],
    },
  },
};