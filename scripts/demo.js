// Script para a demonstração em sala.
// Rodar em dois terminais:
//   Terminal 1: npx hardhat node
//   Terminal 2: npx hardhat run scripts/demo.js --network localhost
const { ethers } = require("hardhat");

const StatusDocumento = ["Valido", "Expirado", "Revogado", "Substituido"];

async function main() {
  const [vara] = await ethers.getSigners();
  console.log("== Deploy ==");
  console.log("Conta da Vara (autoridade emissora):", vara.address);

  const Factory = await ethers.getContractFactory("DocumentoSigilosoRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  console.log("Contrato implantado em:", await registry.getAddress());

  // Em produção estes valores vêm do backend: documentId é um UUID interno
  // hasheado, documentHash é o hash canônico do PDF/JSON do alvará.
  const documentId = ethers.keccak256(ethers.toUtf8Bytes("alvara-viagem-2026-demo"));
  const documentHash = ethers.keccak256(ethers.toUtf8Bytes("conteudo-completo-do-alvara-demo"));

  console.log("\n== 1) Registrar documento ==");
  console.log("documentId:", documentId);
  console.log("documentHash:", documentHash);

  let tx = await registry.registrarDocumento(documentId, documentHash, 0);
  let receipt = await tx.wait();
  console.log("Transação:", receipt.hash, "| bloco:", receipt.blockNumber);

  let status = await registry.consultarStatus(documentId);
  console.log("Status atual:", StatusDocumento[Number(status)]);

  console.log("\n== 2) Consultar registro completo ==");
  const registro = await registry.obterRegistro(documentId);
  console.log({
    documentHash: registro.documentHash,
    emissor: registro.emissor,
    emitidoEm: new Date(Number(registro.emitidoEm) * 1000).toISOString(),
    status: StatusDocumento[Number(registro.status)],
  });

  console.log("\n== 3) Revogar documento (ex.: guarda destituída) ==");
  tx = await registry.revogarDocumento(documentId);
  receipt = await tx.wait();
  console.log("Transação:", receipt.hash, "| bloco:", receipt.blockNumber);

  status = await registry.consultarStatus(documentId);
  console.log("Status atual (mudou!):", StatusDocumento[Number(status)]);

  console.log("\n== 4) Tentativa de registrar duplicado (deve reverter) ==");
  try {
    await registry.registrarDocumento(documentId, documentHash, 0);
  } catch (err) {
    const data = err.data ?? err.info?.error?.data;
    let mensagem = err.shortMessage || err.message;
    try {
      if (data) {
        const decoded = registry.interface.parseError(data);
        mensagem = `${decoded.name}(${decoded.args.join(", ")})`;
      }
    } catch (_) {
      // mantém a mensagem padrão se não for possível decodificar
    }
    console.log("Revertido como esperado:", mensagem);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
