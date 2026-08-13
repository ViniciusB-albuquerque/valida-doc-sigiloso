const bcrypt = require("bcryptjs");
const { db } = require("./db");

// Tabela separada de `identidades` de propósito: `identidades` é "quem pode
// fazer coisas com carteira" (endereco como chave primária) — não muda.
// `contas` é só "quem pode entrar no painel" — email/senha tradicional,
// sem nenhuma referência a carteira ou papel. A decisão de simplificação:
// o login NUNCA decide quem pode fazer o quê — isso fica inteiramente a
// cargo da blockchain, no momento em que a pessoa tenta uma ação sensível
// (conectar carteira pra registrar/revogar, ou pra ver Nível 2). O login
// só identifica quem está navegando, pra mostrar o nome na tela.
db.exec(`
  CREATE TABLE IF NOT EXISTS contas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    senhaHash TEXT NOT NULL,
    nome TEXT NOT NULL,
    instituicao TEXT NOT NULL
  );
`);

// Conta de exemplo, só para desenvolvimento/demo — senha documentada aqui
// de propósito (texto puro), só pra você conseguir testar sem precisar
// gerar um hash na mão. NUNCA faça isso com uma senha real.
const EMAIL_EXEMPLO = "juiz.exemplo@tjpb.jus.br";
const SENHA_EXEMPLO_DEV = "senha123";

const jaExiste = db.prepare("SELECT 1 FROM contas WHERE email = ?").get(EMAIL_EXEMPLO);
if (!jaExiste) {
  const senhaHash = bcrypt.hashSync(SENHA_EXEMPLO_DEV, 10);
  db.prepare("INSERT INTO contas (email, senhaHash, nome, instituicao) VALUES (?, ?, ?, ?)").run(
    EMAIL_EXEMPLO,
    senhaHash,
    "Juiz de Exemplo",
    "TJPB"
  );
}

function buscarContaPorEmail(email) {
  return db.prepare("SELECT * FROM contas WHERE email = ?").get(String(email).toLowerCase());
}

function conferirSenha(senha, senhaHash) {
  return bcrypt.compareSync(senha, senhaHash);
}

module.exports = { buscarContaPorEmail, conferirSenha };
