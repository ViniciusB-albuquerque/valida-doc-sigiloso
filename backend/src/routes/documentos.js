const express = require("express");
const { ethers } = require("ethers");

const blockchain = require("../blockchain");
const {
  buscarIdentidade,
  estaAutorizado,
  buscarDadosDocumento,
  filtrarDadosDocumentoPorPerfil,
  reconstruirCadeia,
  buscarDocumentosIndexadosPorData,
} = require("../db");
const { gerarDesafio, verificarAssinatura } = require("../desafios");

const router = express.Router();

const REGEX_DOCUMENT_ID = /^0x[0-9a-fA-F]{64}$/;
const REGEX_ENDERECO = /^0x[0-9a-fA-F]{40}$/;
const LIMITE_BUSCA = 50;

function validarDocumentId(req, res, next) {
  if (!REGEX_DOCUMENT_ID.test(req.params.documentId)) {
    return res.status(400).json({ erro: "documentId inválido — precisa ser um bytes32 (0x + 64 hex)." });
  }
  next();
}

// --- Busca (Task 4.4) -------------------------------------------------------
//
// Registrada ANTES das rotas /:documentId/* para que "busca" não seja
// capturada como um documentId. Aceita parâmetros combináveis via query
// string; ver cada ramo abaixo. Sem nenhum parâmetro reconhecido -> 400.
router.get("/busca", async (req, res) => {
  const { id, hash, status, desde, ate } = req.query;

  try {
    // 1) ?id= — busca exata, mesmo formato de obterRegistro. Não usa o índice.
    if (id !== undefined) {
      if (!REGEX_DOCUMENT_ID.test(String(id))) {
        return res.status(400).json({ erro: "Parâmetro 'id' inválido — precisa ser um bytes32 (0x + 64 hex)." });
      }
      const registro = await blockchain.obterRegistro(String(id));
      return res.json({ documentId: String(id), registro });
    }

    // 2) ?hash= — usa consultarPorHash do contrato. Não usa o índice.
    if (hash !== undefined) {
      if (!REGEX_DOCUMENT_ID.test(String(hash))) {
        return res.status(400).json({ erro: "Parâmetro 'hash' inválido — precisa ser um bytes32 (0x + 64 hex)." });
      }
      const resultado = await blockchain.consultarPorHash(String(hash));
      return res.json({ documentHash: String(hash), ...resultado });
    }

    // 3) ?status= e/ou ?desde= e/ou ?ate= — usa o índice para achar candidatos
    //    por intervalo de emissão, mas confirma o status AO VIVO por candidato.
    if (status !== undefined || desde !== undefined || ate !== undefined) {
      if (status !== undefined && !blockchain.STATUS_NOMES.includes(String(status))) {
        return res.status(400).json({
          erro: `Parâmetro 'status' inválido — use um de: ${blockchain.STATUS_NOMES.join(", ")}.`,
        });
      }

      const desdeSeg = paraEpochSegundos(desde, 0);
      const ateSeg = paraEpochSegundos(ate, Number.MAX_SAFE_INTEGER);
      if (desdeSeg === null || ateSeg === null) {
        return res.status(400).json({ erro: "Parâmetro 'desde'/'ate' inválido — use uma data ISO (ex.: 2026-08-13)." });
      }

      const candidatos = buscarDocumentosIndexadosPorData(desdeSeg, ateSeg);

      const resultados = [];
      for (const c of candidatos) {
        let statusAoVivo;
        try {
          statusAoVivo = await blockchain.consultarStatus(c.documentId);
        } catch (_) {
          continue; // documento sumiu/inconsistente no índice — ignora
        }
        if (status !== undefined && statusAoVivo !== String(status)) continue;

        resultados.push({
          documentId: c.documentId,
          documentHash: c.documentHash,
          emissor: c.emissor,
          status: statusAoVivo,
          emitidoEm: new Date(c.emitidoEm * 1000).toISOString(),
          expiraEm: c.expiraEm === 0 ? null : new Date(c.expiraEm * 1000).toISOString(),
        });
        if (resultados.length >= LIMITE_BUSCA) break; // já vem ordenado por emitidoEm desc
      }

      return res.json({ total: resultados.length, resultados });
    }

    // 4) Nenhum parâmetro reconhecido.
    return res.status(400).json({
      erro: "Informe ao menos um parâmetro de busca: 'id', 'hash', ou 'status'/'desde'/'ate'.",
    });
  } catch (err) {
    return res.status(500).json({ erro: blockchain.decodificarErro(err) });
  }
});

/** Converte uma data ISO em epoch (segundos); retorna `padrao` se vazio, ou null se inválida. */
function paraEpochSegundos(valor, padrao) {
  if (valor === undefined || valor === "") return padrao;
  const ms = Date.parse(String(valor));
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

// --- Nível 1 (público, sem carteira) ---------------------------------------

router.get("/:documentId/status", validarDocumentId, async (req, res) => {
  try {
    const status = await blockchain.consultarStatus(req.params.documentId);
    res.json({ documentId: req.params.documentId, status });
  } catch (err) {
    res.status(404).json({ erro: blockchain.decodificarErro(err) });
  }
});

router.get("/:documentId/atual", validarDocumentId, async (req, res) => {
  try {
    const documentIdAtual = await blockchain.resolverDocumentoAtual(req.params.documentId);
    res.json({ documentId: req.params.documentId, documentIdAtual });
  } catch (err) {
    res.status(404).json({ erro: blockchain.decodificarErro(err) });
  }
});

// Histórico de acessos é público por natureza (o evento em si é público
// on-chain — ver docs/05-fluxo-e-plano.md, seção 3.2). Enriquecido aqui
// com nome/instituição de quem já está cadastrado.
router.get("/:documentId/historico", validarDocumentId, async (req, res) => {
  try {
    const eventos = await blockchain.obterHistoricoAcessos(req.params.documentId);
    const historico = eventos.map((ev) => {
      const identidade = buscarIdentidade(ev.verificador);
      return {
        endereco: ev.verificador,
        nome: identidade?.nome ?? null,
        instituicao: identidade?.instituicao ?? null,
        quando: new Date(ev.quando * 1000).toISOString(),
      };
    });

    // Task 4.3: histórico COMPLETO da cadeia de substituições (cada salto, com
    // datas), reconstruído a partir do índice off-chain. Enriquece cada salto
    // com a identidade cadastrada do responsável, no mesmo espírito do acima.
    const cadeiaSubstituicoes = reconstruirCadeia(req.params.documentId).map((salto) => {
      const identidade = buscarIdentidade(salto.responsavel);
      return {
        documentIdAntigo: salto.documentIdAntigo,
        documentIdNovo: salto.documentIdNovo,
        responsavel: salto.responsavel,
        responsavelNome: identidade?.nome ?? null,
        responsavelInstituicao: identidade?.instituicao ?? null,
        quando: new Date(salto.quando * 1000).toISOString(),
      };
    });

    res.json({ documentId: req.params.documentId, historico, cadeiaSubstituicoes });
  } catch (err) {
    res.status(500).json({ erro: blockchain.decodificarErro(err) });
  }
});

// --- Nível 2 (com carteira cadastrada) --------------------------------------

// Passo 1 do fluxo de assinatura: pede um desafio para assinar.
router.get("/:documentId/desafio", validarDocumentId, (req, res) => {
  const endereco = String(req.query.endereco || "");
  if (!REGEX_ENDERECO.test(endereco)) {
    return res.status(400).json({ erro: "Parâmetro 'endereco' ausente ou inválido." });
  }

  // Camada 1 (gate de identidade): nem gera desafio para quem não está
  // cadastrado — evita dar qualquer pista de que vale a pena tentar assinar.
  if (!estaAutorizado(endereco)) {
    return res.status(403).json({ erro: "Endereço não cadastrado. Procure o administrador do sistema." });
  }

  const mensagem = gerarDesafio(req.params.documentId, endereco);
  res.json({ mensagem });
});

// Passo 2: envia a assinatura, recebe os detalhes do documento se tudo bater.
router.post("/:documentId/acesso", validarDocumentId, async (req, res) => {
  const { endereco, assinatura } = req.body || {};
  if (!REGEX_ENDERECO.test(String(endereco || ""))) {
    return res.status(400).json({ erro: "Campo 'endereco' ausente ou inválido." });
  }
  if (!assinatura) {
    return res.status(400).json({ erro: "Campo 'assinatura' ausente." });
  }

  // Camada 1: confere de novo aqui (não só no /desafio) — nunca confiar só
  // na etapa anterior.
  if (!estaAutorizado(endereco)) {
    return res.status(403).json({ erro: "Endereço não cadastrado. Procure o administrador do sistema." });
  }

  let mensagemAssinada;
  try {
    mensagemAssinada = verificarAssinatura(req.params.documentId, endereco, assinatura);
  } catch (err) {
    return res.status(401).json({ erro: err.message });
  }

  try {
    // Camada 2: só agora, com a assinatura já verificada, o backend chama
    // registrarAcesso — nunca antes, nunca por conta do próprio verificador.
    const assinaturaHash = ethers.keccak256(assinatura);
    const { txHash, blockNumber } = await blockchain.registrarAcesso(
      req.params.documentId,
      endereco,
      assinaturaHash
    );

    const registro = await blockchain.obterRegistro(req.params.documentId);
    const identidadeVerificador = buscarIdentidade(endereco);
    const identidadeEmissor = buscarIdentidade(registro.emissor);
    const dadosOffchain = buscarDadosDocumento(req.params.documentId);
    const dadosLiberados = filtrarDadosDocumentoPorPerfil(dadosOffchain, identidadeVerificador?.perfil);

    res.json({
      registro: {
        ...registro,
        emissorNome: identidadeEmissor?.nome ?? null,
        emissorInstituicao: identidadeEmissor?.instituicao ?? null,
      },
      verificador: {
        endereco,
        nome: identidadeVerificador?.nome ?? null,
        instituicao: identidadeVerificador?.instituicao ?? null,
        perfil: identidadeVerificador?.perfil ?? "verificador",
      },
      dadosLiberados,
      acessoRegistrado: { txHash, blockNumber, assinaturaHash },
      mensagemAssinada,
    });
  } catch (err) {
    res.status(500).json({ erro: blockchain.decodificarErro(err) });
  }
});

module.exports = router;
