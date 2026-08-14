require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const documentosRouter = require("./routes/documentos");
const identidadesRouter = require("./routes/identidades");
const authRouter = require("./routes/auth");
const blockchain = require("./blockchain");

const app = express();
const interfacePath = path.join(__dirname, "..", "..", "interface");

app.use(cors());
app.use(express.json());

app.use("/api/documentos", documentosRouter);
app.use("/api/identidades", identidadesRouter);
app.use("/api/auth", authRouter);

app.get("/api/saude", (req, res) => {
  res.json({ ok: true, backend: blockchain.wallet.address });
});

app.get("/api/config", (req, res) => {
  res.json({
    contratoEndereco: blockchain.CONTRATO_ENDERECO,
    backend: blockchain.wallet.address,
  });
});

// Integra o front estatico ao mesmo servidor Express do backend.
// Assim a demo pode abrir http://localhost:3001/login, /painel, /verificar etc.
// As rotas /api ficam acima e continuam respondendo JSON; o restante cai aqui.
app.use(express.static(interfacePath, { extensions: ["html"] }));

app.get("/", (req, res) => {
  res.sendFile(path.join(interfacePath, "login.html"));
});

module.exports = app;
