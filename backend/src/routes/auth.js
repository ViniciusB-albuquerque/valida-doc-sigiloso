const express = require("express");
const jwt = require("jsonwebtoken");

const { buscarContaPorEmail, conferirSenha } = require("../contas");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRACAO = "2h";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definido no .env (copie .env.example para .env e preencha).");
}

// Login tradicional — email + senha, hash conferido via bcrypt.
//
// O QUE ESTE TOKEN NÃO FAZ: não carrega papel nem endereço de carteira, e
// não libera NENHUMA ação sensível sozinho. É só identidade de sessão pro
// painel (mostrar nome/instituição, nada mais). Toda ação que importa
// (registrar/revogar documento, ver Nível 2) continua pedindo a carteira
// separadamente, no momento em que a pessoa tenta fazer aquilo — e quem
// decide se é permitido é sempre a blockchain (onlyVara no contrato, ou o
// gate de `identidades` no Nível 2), nunca este login.
router.post("/login", (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ erro: "Campos 'email' e 'senha' são obrigatórios." });
  }

  const conta = buscarContaPorEmail(email);

  // Mensagem genérica de propósito, nos dois casos de falha (email não
  // existe / senha errada) — evita dar pista de quais emails existem.
  if (!conta || !conferirSenha(senha, conta.senhaHash)) {
    return res.status(401).json({ erro: "Email ou senha incorretos." });
  }

  const payload = { nome: conta.nome, instituicao: conta.instituicao };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRACAO });

  res.json({ token, ...payload, expiraEm: JWT_EXPIRACAO });
});

// Middleware reutilizável para rotas futuras do painel que precisem saber
// quem está logado, sem pedir email/senha de novo a cada clique de menu.
// Não está sendo aplicado a nenhuma rota ainda — só fica pronto pra uso.
function verificarToken(req, res, next) {
  const cabecalho = req.headers.authorization || "";
  const [tipo, token] = cabecalho.split(" ");
  if (tipo !== "Bearer" || !token) {
    return res.status(401).json({ erro: "Token ausente. Faça login novamente." });
  }
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido ou expirado. Faça login novamente." });
  }
}

module.exports = router;
module.exports.verificarToken = verificarToken;
