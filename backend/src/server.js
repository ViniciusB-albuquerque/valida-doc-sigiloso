const app = require("./app");
const blockchain = require("./blockchain");

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend VerificaJus rodando em http://localhost:${PORT}`);
  console.log(`Endereço do backend (deve bater com backendAutorizado() no contrato): ${blockchain.wallet.address}`);
});
