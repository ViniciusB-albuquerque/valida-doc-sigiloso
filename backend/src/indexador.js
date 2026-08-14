const blockchain = require("./blockchain");
const {
  getEstadoIndexador,
  setEstadoIndexador,
  registrarDocumentoIndexado,
  registrarSubstituicaoIndexada,
} = require("./db");

const { provider, contratoLeitura, CONTRATO_ENDERECO } = blockchain;

const CHAVE_ULTIMO_BLOCO = "ultimoBlocoIndexado";
const INTERVALO_MS = 8000; // polling a cada 8s (Task 4.1)

/**
 * Busca logs crus de UM evento (por nome) no range [fromBlock, toBlock].
 *
 * NOTA TÉCNICA (a mesma lição já aprendida em blockchain.obterHistoricoAcessos):
 * contrato.queryFilter() / provider.getLogs() do ethers v6 se mostraram NÃO
 * confiáveis com JsonRpcProvider puro neste projeto — retornavam 0 resultados
 * mesmo com eventos existindo. Por isso, aqui também usamos provider.send(
 * "eth_getLogs", ...) DIRETO + interface.parseLog() manual.
 */
async function buscarLogsDeEvento(nomeEvento, fromBlockHex, toBlockHex) {
  const topics = await contratoLeitura.filters[nomeEvento]().getTopicFilter();
  return provider.send("eth_getLogs", [
    { address: CONTRATO_ENDERECO, fromBlock: fromBlockHex, toBlock: toBlockHex, topics },
  ]);
}

// Cache de timestamp por bloco dentro de UMA passada — vários eventos podem
// cair no mesmo bloco; evita re-consultar eth_getBlockByNumber à toa.
async function timestampDoBloco(blockNumberHex, cache) {
  if (cache.has(blockNumberHex)) return cache.get(blockNumberHex);
  const bloco = await provider.send("eth_getBlockByNumber", [blockNumberHex, false]);
  const ts = Number(bloco.timestamp);
  cache.set(blockNumberHex, ts);
  return ts;
}

/**
 * Task 4.1 — lê o último bloco indexado, busca DocumentoRegistrado e
 * DocumentoSubstituido desde ele até "latest", grava nas tabelas e avança o
 * ponteiro de estado. Idempotente: reprocessar o mesmo range não duplica nada.
 */
async function indexarNovosEventos() {
  const ultimoBloco = Number(getEstadoIndexador(CHAVE_ULTIMO_BLOCO, "0"));
  const blocoAtual = await provider.getBlockNumber();

  // Nada novo desde a última passada (mas ainda reprocessamos o próprio
  // ultimoBloco para não perder eventos que chegaram no mesmo bloco).
  if (blocoAtual < ultimoBloco) return;

  const fromBlockHex = "0x" + ultimoBloco.toString(16);
  const toBlockHex = "0x" + blocoAtual.toString(16);
  const cacheTs = new Map();

  // --- DocumentoRegistrado -> documentos_indexados ---
  const logsRegistro = await buscarLogsDeEvento("DocumentoRegistrado", fromBlockHex, toBlockHex);
  for (const log of logsRegistro) {
    const ev = contratoLeitura.interface.parseLog(log);
    const emitidoEm = await timestampDoBloco(log.blockNumber, cacheTs);
    registrarDocumentoIndexado({
      documentId: ev.args.documentId,
      documentHash: ev.args.documentHash,
      emissor: ev.args.emissor,
      emitidoEm, // = block.timestamp do registro (o contrato grava exatamente isso)
      expiraEm: Number(ev.args.expiraEm),
      blockNumber: Number(log.blockNumber),
    });
  }

  // --- DocumentoSubstituido -> substituicoes_indexadas (+ o documento novo) ---
  const logsSubstituicao = await buscarLogsDeEvento("DocumentoSubstituido", fromBlockHex, toBlockHex);
  for (const log of logsSubstituicao) {
    const ev = contratoLeitura.interface.parseLog(log);
    const quando = await timestampDoBloco(log.blockNumber, cacheTs);
    const blockNumber = Number(log.blockNumber);

    registrarSubstituicaoIndexada({
      documentIdAntigo: ev.args.documentIdAntigo,
      documentIdNovo: ev.args.documentIdNovo,
      responsavel: ev.args.responsavel,
      quando, // o evento não carrega timestamp; usamos o do bloco
      blockNumber,
    });

    // DECISÃO DE DESIGN: o documento NOVO de uma substituição é criado por
    // substituirDocumento, que NÃO emite DocumentoRegistrado — só
    // DocumentoSubstituido. Sem o passo abaixo, esse documento (o vigente!)
    // nunca entraria em documentos_indexados e ficaria invisível à busca por
    // data/status. Então buscamos o registro dele on-chain (obterRegistro) e o
    // indexamos aqui. INSERT OR IGNORE cuida de não duplicar se um
    // DocumentoRegistrado dele existir por algum motivo.
    try {
      const reg = await blockchain.obterRegistro(ev.args.documentIdNovo);
      registrarDocumentoIndexado({
        documentId: ev.args.documentIdNovo,
        documentHash: reg.documentHash,
        emissor: reg.emissor,
        emitidoEm: reg.emitidoEm,
        expiraEm: reg.expiraEm,
        blockNumber,
      });
    } catch (err) {
      console.error(
        `[indexador] falha ao indexar documento novo ${ev.args.documentIdNovo}:`,
        blockchain.decodificarErro(err)
      );
    }
  }

  setEstadoIndexador(CHAVE_ULTIMO_BLOCO, blocoAtual + 1);

  if (logsRegistro.length || logsSubstituicao.length) {
    console.log(
      `[indexador] blocos ${ultimoBloco}..${blocoAtual}: ` +
        `${logsRegistro.length} registro(s), ${logsSubstituicao.length} substituicao(oes).`
    );
  }
}

/**
 * Task 4.1 — roda uma passada imediatamente e depois a cada 8s (polling, NÃO
 * subscription de evento — pela lição de que os helpers de evento do ethers
 * são não confiáveis aqui). Erros de uma passada são logados e não derrubam o
 * loop; a próxima passada tenta de novo do mesmo ponto.
 */
function iniciarIndexador() {
  const passada = () =>
    indexarNovosEventos().catch((err) =>
      console.error("[indexador] erro na passada:", blockchain.decodificarErro(err))
    );

  passada();
  setInterval(passada, INTERVALO_MS);
  console.log(`[indexador] iniciado (polling a cada ${INTERVALO_MS / 1000}s).`);
}

module.exports = { indexarNovosEventos, iniciarIndexador };
