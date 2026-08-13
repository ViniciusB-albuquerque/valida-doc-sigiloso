const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "identidades.db");
const SEED_PATH = path.join(__dirname, "seed.sql");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Roda o seed toda vez que o servidor sobe — é idempotente (CREATE TABLE IF
// NOT EXISTS + INSERT OR IGNORE), então não duplica nem falha se já rodou antes.
db.exec(fs.readFileSync(SEED_PATH, "utf8"));

/**
 * Busca a identidade (nome, instituição) de um endereço.
 * Comparação sempre em minúsculas — endereços Ethereum são case-insensitive
 * no valor (o "checksum" com maiúsculas/minúsculas é só uma checagem visual
 * opcional, EIP-55), então normalizamos para não depender de vir formatado
 * igual em todo lugar.
 */
function buscarIdentidade(endereco) {
  const stmt = db.prepare("SELECT nome, instituicao FROM identidades WHERE endereco = ?");
  return stmt.get(endereco.toLowerCase()) || null;
}

/** true se o endereço está cadastrado — usado como o gate da Camada 1 (Nível 2). */
function estaAutorizado(endereco) {
  return buscarIdentidade(endereco) !== null;
}

module.exports = { db, buscarIdentidade, estaAutorizado };
