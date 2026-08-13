const { ethers } = require("ethers");

const ABI = [
  "function vara() view returns (address)",
  "function backendAutorizado() view returns (address)",
  "function consultarStatus(bytes32 documentId) view returns (uint8)",
  "function obterRegistro(bytes32 documentId) view returns (bytes32 documentHash, address emissor, uint64 emitidoEm, uint64 expiraEm, uint8 status, bytes32 substituidoPor)",
  "function consultarPorHash(bytes32 documentHash) view returns (bool existe, bytes32 documentId)",
  "function resolverDocumentoAtual(bytes32 documentId) view returns (bytes32 documentIdAtual)",
  "function registrarAcesso(bytes32 documentId, address verificador, bytes32 assinaturaHash)",
  "event AcessoRegistrado(bytes32 indexed documentId, address indexed verificador, bytes32 assinaturaHash, uint64 quando)",
  "error ApenasVara()",
  "error ApenasBackendAutorizado()",
  "error DocumentIdInvalido()",
  "error DocumentHashInvalido()",
  "error EnderecoInvalido()",
  "error DocumentoJaRegistrado(bytes32 documentId)",
  "error HashJaRegistrado(bytes32 documentHash, bytes32 documentIdExistente)",
  "error DocumentoInexistente(bytes32 documentId)",
  "error DocumentoNaoValido(bytes32 documentId, uint8 statusAtual)",
];

const STATUS_NOMES = ["Valido", "Expirado", "Revogado", "Substituido"];

const RPC_URL = process.env.RPC_URL;
const CONTRATO_ENDERECO = process.env.CONTRATO_ENDERECO;
const BACKEND_PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;

if (!RPC_URL || !CONTRATO_ENDERECO || !BACKEND_PRIVATE_KEY) {
  throw new Error(
    "Configuração incompleta: defina RPC_URL, CONTRATO_ENDERECO e BACKEND_PRIVATE_KEY no .env " +
      "(copie .env.example para .env e preencha os valores)."
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);

// Uma instância "de leitura" (sem signer) e uma "de escrita" (com o wallet
// do backend) — deixa explícito, ao ler o código, qual chamada é view e
// qual manda transação de verdade.
const contratoLeitura = new ethers.Contract(CONTRATO_ENDERECO, ABI, provider);
const contratoEscrita = new ethers.Contract(CONTRATO_ENDERECO, ABI, wallet);

function decodificarErro(err) {
  const data = err?.data ?? err?.info?.error?.data;
  if (data) {
    try {
      const decoded = contratoLeitura.interface.parseError(data);
      return `${decoded.name}(${decoded.args.map(String).join(", ")})`;
    } catch (_) {
      // segue para a mensagem padrão
    }
  }
  return err?.reason || err?.shortMessage || err?.message || String(err);
}

async function consultarStatus(documentId) {
  const status = await contratoLeitura.consultarStatus(documentId);
  return STATUS_NOMES[Number(status)];
}

async function obterRegistro(documentId) {
  const r = await contratoLeitura.obterRegistro(documentId);
  return {
    documentHash: r.documentHash,
    emissor: r.emissor,
    emitidoEm: Number(r.emitidoEm),
    expiraEm: Number(r.expiraEm),
    status: STATUS_NOMES[Number(r.status)],
    substituidoPor: r.substituidoPor === ethers.ZeroHash ? null : r.substituidoPor,
  };
}

async function resolverDocumentoAtual(documentId) {
  return contratoLeitura.resolverDocumentoAtual(documentId);
}

/**
 * Busca o histórico de acessos (evento AcessoRegistrado) para um documento.
 *
 * NOTA TÉCNICA IMPORTANTE: contrato.queryFilter() e provider.getLogs() do
 * ethers v6 se mostraram não confiáveis quando o provider é um
 * JsonRpcProvider puro (sem passar por um Signer/HardhatEthersProvider) —
 * retornavam 0 resultados mesmo com eventos existentes e o filtro (topics)
 * correto (já isolamos essa causa antes, comparando com uma chamada
 * eth_getLogs crua, que funciona). Por isso usamos provider.send("eth_getLogs")
 * direto + parseLog manual, em vez do atalho de mais alto nível — mesmo
 * workaround já validado em interface/verificar.html.
 */
async function obterHistoricoAcessos(documentId) {
  const filtro = contratoLeitura.filters.AcessoRegistrado(documentId);
  const topics = await filtro.getTopicFilter();

  const logsCrus = await provider.send("eth_getLogs", [
    { address: CONTRATO_ENDERECO, fromBlock: "0x0", toBlock: "latest", topics },
  ]);

  return logsCrus.map((log) => {
    const evento = contratoLeitura.interface.parseLog(log);
    return {
      verificador: evento.args.verificador,
      assinaturaHash: evento.args.assinaturaHash,
      quando: Number(evento.args.quando),
    };
  });
}

/** Chama registrarAcesso assinado pelo backend — nunca pelo próprio verificador. */
async function registrarAcesso(documentId, verificador, assinaturaHash) {
  const tx = await contratoEscrita.registrarAcesso(documentId, verificador, assinaturaHash);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

module.exports = {
  STATUS_NOMES,
  decodificarErro,
  consultarStatus,
  obterRegistro,
  resolverDocumentoAtual,
  obterHistoricoAcessos,
  registrarAcesso,
  wallet,
};
