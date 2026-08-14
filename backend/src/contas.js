const bcrypt = require("bcryptjs");
const { db } = require("./db");

// Tabela separada de `identidades` de proposito: `identidades` e "quem pode
// fazer coisas com carteira"; `contas` e so "quem pode entrar no painel" via
// email/senha. A autorizacao sensivel continua acontecendo por carteira e
// blockchain no momento da acao.
db.exec(`
  CREATE TABLE IF NOT EXISTS contas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    senhaHash TEXT NOT NULL,
    nome TEXT NOT NULL,
    instituicao TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'verificador'
  );
`);

if (!db.prepare("PRAGMA table_info(contas)").all().some((coluna) => coluna.name === "perfil")) {
  db.exec("ALTER TABLE contas ADD COLUMN perfil TEXT NOT NULL DEFAULT 'verificador'");
}

// Contas de exemplo, so para desenvolvimento/demo. Todas usam a senha `senha123`
// para facilitar a apresentacao. Nunca use esse padrao com contas reais.
const CONTAS_DEMO = [
  {
    email: "juiz.exemplo@tjpb.jus.br",
    senha: "senha123",
    nome: "Juiz de Exemplo",
    instituicao: "TJPB",
    perfil: "vara",
  },
  {
    email: "pf.exemplo@dpf.gov.br",
    senha: "senha123",
    nome: "Ana Silva",
    instituicao: "Policia Federal",
    perfil: "policia_federal",
  },
  {
    email: "aerea.exemplo@companhia.demo",
    senha: "senha123",
    nome: "Marina Costa",
    instituicao: "Companhia Aerea",
    perfil: "companhia_aerea",
  },
  {
    email: "conselho.exemplo@ct.demo",
    senha: "senha123",
    nome: "Carlos Souza",
    instituicao: "Conselho Tutelar",
    perfil: "conselho_tutelar",
  },
];

function inserirContaDemo(conta) {
  const jaExiste = db.prepare("SELECT 1 FROM contas WHERE email = ?").get(conta.email);
  if (!jaExiste) {
    const senhaHash = bcrypt.hashSync(conta.senha, 10);
    db.prepare("INSERT INTO contas (email, senhaHash, nome, instituicao, perfil) VALUES (?, ?, ?, ?, ?)").run(
      conta.email,
      senhaHash,
      conta.nome,
      conta.instituicao,
      conta.perfil
    );
    return;
  }

  db.prepare("UPDATE contas SET nome = ?, instituicao = ?, perfil = ? WHERE email = ?").run(
    conta.nome,
    conta.instituicao,
    conta.perfil,
    conta.email
  );
}

CONTAS_DEMO.forEach(inserirContaDemo);

function buscarContaPorEmail(email) {
  return db.prepare("SELECT * FROM contas WHERE email = ?").get(String(email).toLowerCase());
}

function conferirSenha(senha, senhaHash) {
  return bcrypt.compareSync(senha, senhaHash);
}

module.exports = { buscarContaPorEmail, conferirSenha };
