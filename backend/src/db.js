const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "identidades.db");
const SEED_PATH = path.join(__dirname, "seed.sql");
const SEED_INDEXADOR_PATH = path.join(__dirname, "seed-indexador.sql");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Migração leve para quem já rodou versões anteriores do backend: o seed antigo
// criava `identidades` sem `perfil`. Como CREATE TABLE IF NOT EXISTS não altera
// tabelas existentes, garantimos a coluna antes de executar o seed novo.
function tabelaExiste(nome) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome));
}

function colunaExiste(tabela, coluna) {
  if (!tabelaExiste(tabela)) return false;
  return db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
}

if (tabelaExiste("identidades") && !colunaExiste("identidades", "perfil")) {
  db.exec("ALTER TABLE identidades ADD COLUMN perfil TEXT NOT NULL DEFAULT 'verificador'");
}

// Roda os seeds toda vez que o servidor sobe — são idempotentes (CREATE TABLE
// IF NOT EXISTS + INSERT OR IGNORE), então não duplicam nem falham se já
// rodaram antes. seed.sql = dados de identidades/dados off-chain; seed-indexador.sql =
// schema das tabelas do indexador de eventos (Etapa 4).
db.exec(fs.readFileSync(SEED_PATH, "utf8"));
db.exec(fs.readFileSync(SEED_INDEXADOR_PATH, "utf8"));

/**
 * Busca a identidade (nome, instituição e perfil) de um endereço.
 * Comparação sempre em minúsculas — endereços Ethereum são case-insensitive
 * no valor (o "checksum" com maiúsculas/minúsculas é só uma checagem visual
 * opcional, EIP-55), então normalizamos para não depender de vir formatado
 * igual em todo lugar.
 */
function buscarIdentidade(endereco) {
  const stmt = db.prepare("SELECT nome, instituicao, perfil FROM identidades WHERE endereco = ?");
  return stmt.get(endereco.toLowerCase()) || null;
}

/** true se o endereço está cadastrado — usado como o gate da Camada 1 (Nível 2). */
function estaAutorizado(endereco) {
  return buscarIdentidade(endereco) !== null;
}

/**
 * Busca os metadados sensíveis mantidos off-chain.
 *
 * A blockchain armazena só hash/status. Dados de criança/adolescente, destino,
 * responsáveis e medidas de proteção ficam aqui, atrás do controle de acesso por
 * perfil. Em produção isso viria do banco judicial ou de um cofre de dados, não
 * de um seed de demonstração.
 */
function buscarDadosDocumento(documentId) {
  return (
    db
      .prepare(
        `SELECT documentId, tipoDocumento, numeroControle, nomeCrianca, responsavelLegal,
                acompanhante, destino, periodoViagem, autorizacaoResumo, medidasProtecao,
                contatoInstitucional
           FROM documentos_dados_offchain
          WHERE documentId = ?`
      )
      .get(String(documentId).toLowerCase()) || null
  );
}

/**
 * Aplica validação seletiva: cada instituição recebe apenas o necessário para
 * sua finalidade. O contrato prova autenticidade/status; esta camada decide
 * quais campos off-chain podem ser revelados a quem assinou o acesso.
 */
function filtrarDadosDocumentoPorPerfil(dados, perfil) {
  if (!dados) {
    return {
      aviso: "Documento autenticado na blockchain, mas sem metadados off-chain cadastrados nesta demo.",
    };
  }

  const comum = {
    tipoDocumento: dados.tipoDocumento,
    numeroControle: dados.numeroControle,
    autorizacaoResumo: dados.autorizacaoResumo,
  };

  switch (perfil) {
    case "policia_federal":
      return {
        ...comum,
        nomeCrianca: dados.nomeCrianca,
        responsavelLegal: dados.responsavelLegal,
        acompanhante: dados.acompanhante,
        destino: dados.destino,
        periodoViagem: dados.periodoViagem,
      };
    case "companhia_aerea":
      return {
        ...comum,
        nomeCrianca: dados.nomeCrianca,
        acompanhante: dados.acompanhante,
        destino: dados.destino,
        periodoViagem: dados.periodoViagem,
      };
    case "conselho_tutelar":
      return {
        ...comum,
        nomeCrianca: dados.nomeCrianca,
        responsavelLegal: dados.responsavelLegal,
        medidasProtecao: dados.medidasProtecao,
        contatoInstitucional: dados.contatoInstitucional,
      };
    case "vara":
      return dados;
    default:
      return comum;
  }
}

// --- Estado do indexador (Etapa 4) -----------------------------------------

/** Lê um valor de indexador_estado (string), ou `padrao` se a chave não existir. */
function getEstadoIndexador(chave, padrao = null) {
  const linha = db.prepare("SELECT valor FROM indexador_estado WHERE chave = ?").get(chave);
  return linha ? linha.valor : padrao;
}

/** Grava/atualiza um valor de indexador_estado (INSERT OR REPLACE — idempotente). */
function setEstadoIndexador(chave, valor) {
  db.prepare("INSERT OR REPLACE INTO indexador_estado (chave, valor) VALUES (?, ?)").run(chave, String(valor));
}

// --- Escrita das tabelas indexadas (Etapa 4) --------------------------------
//
// INSERT OR IGNORE em ambas: o indexador pode reprocessar o mesmo bloco (o
// range de eth_getLogs inclui o último bloco já processado) sem duplicar linha.
// documentId (e o par antigo/novo) já é PRIMARY KEY, então "IGNORE" é o
// comportamento correto — a primeira gravação vence e as repetições são no-op.

const stmtInserirDocumento = db.prepare(`
  INSERT OR IGNORE INTO documentos_indexados
    (documentId, documentHash, emissor, emitidoEm, expiraEm, blockNumber)
  VALUES (@documentId, @documentHash, @emissor, @emitidoEm, @expiraEm, @blockNumber)
`);

function registrarDocumentoIndexado(doc) {
  stmtInserirDocumento.run(doc);
}

const stmtInserirSubstituicao = db.prepare(`
  INSERT OR IGNORE INTO substituicoes_indexadas
    (documentIdAntigo, documentIdNovo, responsavel, quando, blockNumber)
  VALUES (@documentIdAntigo, @documentIdNovo, @responsavel, @quando, @blockNumber)
`);

function registrarSubstituicaoIndexada(sub) {
  stmtInserirSubstituicao.run(sub);
}

// --- Consultas usadas pelo endpoint de busca (Task 4.4) ---------------------

/**
 * Candidatos por intervalo de data de emissão (emitidoEm, em segundos Unix).
 * `desde`/`ate` também em segundos Unix; use 0 e um teto alto para "sem limite".
 * Ordena por emitidoEm decrescente (mais recentes primeiro). NÃO filtra por
 * status — quem chama consulta consultarStatus AO VIVO por candidato, porque o
 * status muda com o tempo e não é reindexado a cada mudança.
 */
function buscarDocumentosIndexadosPorData(desde, ate) {
  return db
    .prepare(
      `SELECT documentId, documentHash, emissor, emitidoEm, expiraEm, blockNumber
         FROM documentos_indexados
        WHERE emitidoEm >= ? AND emitidoEm <= ?
        ORDER BY emitidoEm DESC`
    )
    .all(desde, ate);
}

/**
 * Task 4.3 — reconstrói a cadeia COMPLETA de substituições a partir de um
 * documentId, seguindo documentIdAntigo -> documentIdNovo repetidamente na
 * tabela substituicoes_indexadas. Retorna um array ordenado (do salto mais
 * antigo ao mais recente) de { documentIdAntigo, documentIdNovo, responsavel,
 * quando } — CADA salto, não só o destino final (o destino já existe on-chain
 * via resolverDocumentoAtual; o que falta é o histórico com datas).
 *
 * O contrato garante que documentIdNovo nunca pré-existe numa substituição, ou
 * seja, a cadeia é estritamente progressiva e acíclica; ainda assim, guardamos
 * os já visitados para nunca entrar em laço mesmo com dado inconsistente.
 */
function reconstruirCadeia(documentId) {
  const proximo = db.prepare(
    `SELECT documentIdAntigo, documentIdNovo, responsavel, quando
       FROM substituicoes_indexadas
      WHERE documentIdAntigo = ?`
  );

  const cadeia = [];
  const visitados = new Set();
  let atual = documentId;

  while (atual && !visitados.has(atual)) {
    visitados.add(atual);
    const salto = proximo.get(atual);
    if (!salto) break;
    cadeia.push(salto);
    atual = salto.documentIdNovo;
  }

  return cadeia;
}

module.exports = {
  db,
  buscarIdentidade,
  estaAutorizado,
  buscarDadosDocumento,
  filtrarDadosDocumentoPorPerfil,
  getEstadoIndexador,
  setEstadoIndexador,
  registrarDocumentoIndexado,
  registrarSubstituicaoIndexada,
  buscarDocumentosIndexadosPorData,
  reconstruirCadeia,
};
