const app = require("./app");
const blockchain = require("./blockchain");
const { iniciarIndexador } = require("./indexador");

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend VerificaJus rodando em http://localhost:${PORT}`);
  console.log(`Endereço do backend (deve bater com backendAutorizado() no contrato): ${blockchain.wallet.address}`);

  // Efeito colateral de rede (polling on-chain): só aqui, no ponto de entrada
  // real — nunca em app.js, que precisa ser importável sem disparar rede.
  iniciarIndexador();
});
