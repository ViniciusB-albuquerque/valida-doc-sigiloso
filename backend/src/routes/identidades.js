const express = require("express");
const { buscarIdentidade } = require("../db");

const router = express.Router();

const REGEX_ENDERECO = /^0x[0-9a-fA-F]{40}$/;

router.get("/:endereco", (req, res) => {
  if (!REGEX_ENDERECO.test(req.params.endereco)) {
    return res.status(400).json({ erro: "Endereço inválido." });
  }
  const identidade = buscarIdentidade(req.params.endereco);
  if (!identidade) return res.status(404).json({ erro: "Endereço não cadastrado." });
  res.json({ endereco: req.params.endereco, ...identidade });
});

module.exports = router;
