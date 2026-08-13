// Utilitário compartilhado entre verificar, index e buscar:
// detecta se um valor já é um documentId pronto (bytes32, 0x + 64 hex) ou
// se precisa ser tratado como rótulo interno e convertido via keccak256.
// Depende do global `ethers` (carregado via CDN antes deste script).
function resolverIdentificadorDocumento(valor) {
  const v = valor.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v;
  return ethers.keccak256(ethers.toUtf8Bytes(v));
}
