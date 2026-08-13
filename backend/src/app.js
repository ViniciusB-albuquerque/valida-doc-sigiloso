require("dotenv").config();
const express = require("express");
const cors = require("cors");

const documentosRouter = require("./routes/documentos");
const identidadesRouter = require("./routes/identidades");
const blockchain = require("./blockchain");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/documentos", documentosRouter);
app.use("/api/identidades", identidadesRouter);

app.get("/api/saude", (req, res) => {
  res.json({ ok: true, backend: blockchain.wallet.address });
});

module.exports = app;
