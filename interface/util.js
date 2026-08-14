// Utilitário compartilhado entre verificar, index e buscar:
// detecta se um valor já é um documentId pronto (bytes32, 0x + 64 hex) ou
// se precisa ser tratado como rótulo interno e convertido via keccak256.
// Depende do global `ethers` (carregado via CDN antes deste script).
function resolverIdentificadorDocumento(valor) {
  const v = valor.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v;
  return ethers.keccak256(ethers.toUtf8Bytes(v));
}

// Quando o front e servido pelo proprio backend, a API esta na mesma origem
// (ex.: http://localhost:3001). Se alguem ainda abrir o front por um servidor
// estatico separado, mantemos localhost:3001 como padrao de desenvolvimento.
function obterBackendPadrao() {
  const params = new URLSearchParams(window.location.search);
  const backendParam = params.get("backend");
  if (backendParam) return backendParam;

  const hostLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (hostLocal && window.location.port && window.location.port !== "3001") {
    return "http://localhost:3001";
  }

  return window.location.origin;
}

async function carregarConfigBackend() {
  const backendUrl = obterBackendPadrao().replace(/\/$/, "");
  const resp = await fetch(`${backendUrl}/api/config`);
  const dados = await resp.json();
  if (!resp.ok) throw new Error(dados.erro || "Nao foi possivel carregar configuracao do backend.");
  return dados;
}

function perfilPeloEmail(email) {
  const mapa = {
    "juiz.exemplo@tjpb.jus.br": "vara",
    "pf.exemplo@dpf.gov.br": "policia_federal",
    "aerea.exemplo@companhia.demo": "companhia_aerea",
    "conselho.exemplo@ct.demo": "conselho_tutelar",
  };
  return mapa[String(email || "").toLowerCase()] || "";
}

function normalizarPerfilSessao(sessao) {
  if (!sessao || typeof sessao !== "object") return sessao;
  const perfilDetectado = perfilPeloEmail(sessao.email);
  const perfilAtual = sessao.perfil || "";
  const perfil = !perfilAtual || perfilAtual === "verificador" ? (perfilDetectado || perfilAtual || "verificador") : perfilAtual;
  return { ...sessao, perfil };
}

function nomePerfil(perfil) {
  const nomes = {
    vara: "Vara",
    policia_federal: "Polícia Federal",
    companhia_aerea: "Companhia Aérea",
    conselho_tutelar: "Conselho Tutelar",
    verificador: "Verificador",
  };
  return nomes[perfil] || perfil || "Verificador";
}
