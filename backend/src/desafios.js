const { ethers } = require("ethers");

/**
 * Fluxo de "desafio, depois verificação" para o acesso ao Nível 2:
 *
 *   1) Cliente pede um desafio (GET .../desafio) — backend gera uma
 *      mensagem com o documentId e o timestamp ATUAL (controlado pelo
 *      servidor, não pelo cliente).
 *   2) Cliente assina essa mensagem exata via personal_sign no MetaMask
 *      (sem gas, sem transação).
 *   3) Cliente envia endereco + assinatura de volta (POST .../acesso).
 *      O backend confere: a assinatura bate com a mensagem que ELE gerou,
 *      o endereço recuperado da assinatura bate com o que o cliente alega
 *      ser, e a mensagem não é velha demais (evita reuso de uma assinatura
 *      capturada antigamente).
 *
 * Guardado em memória (Map) — suficiente para esta etapa; um desafio some
 * assim que é usado (uso único) ou expira sozinho.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutos
const desafiosPendentes = new Map(); // chave: `${documentId}:${endereco}` -> { mensagem, criadoEm }

function chave(documentId, endereco) {
  return `${documentId.toLowerCase()}:${endereco.toLowerCase()}`;
}

function gerarDesafio(documentId, endereco) {
  const agora = Date.now();
  const mensagem = `Confirmo acesso ao documento ${documentId} às ${new Date(agora).toISOString()}`;
  desafiosPendentes.set(chave(documentId, endereco), { mensagem, criadoEm: agora });
  return mensagem;
}

/**
 * Verifica a assinatura contra o desafio pendente. Retorna a mensagem
 * original em caso de sucesso (para logging/depuração), ou lança um erro
 * com uma mensagem clara em caso de falha.
 */
function verificarAssinatura(documentId, endereco, assinatura) {
  const k = chave(documentId, endereco);
  const pendente = desafiosPendentes.get(k);

  if (!pendente) {
    throw new Error("Nenhum desafio pendente para este documento/endereço — peça um novo desafio antes de assinar.");
  }
  if (Date.now() - pendente.criadoEm > TTL_MS) {
    desafiosPendentes.delete(k);
    throw new Error("Desafio expirado — peça um novo antes de assinar.");
  }

  const enderecoRecuperado = ethers.verifyMessage(pendente.mensagem, assinatura);
  if (enderecoRecuperado.toLowerCase() !== endereco.toLowerCase()) {
    throw new Error("Assinatura não corresponde ao endereço informado.");
  }

  // Uso único: consome o desafio para não permitir reenviar a mesma
  // assinatura de novo mais tarde.
  desafiosPendentes.delete(k);

  return pendente.mensagem;
}

module.exports = { gerarDesafio, verificarAssinatura };
