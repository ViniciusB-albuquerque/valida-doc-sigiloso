// Setup de validação da Etapa 4 (indexador + busca).
// Rodar em dois terminais:
//   Terminal 1: npx hardhat node
//   Terminal 2: npx hardhat run scripts/etapa4-setup.js --network localhost
//
// Faz: deploy do contrato, autoriza a carteira do backend (conta #4 do
// Hardhat, já pré-financiada com ETH de teste), registra 3 documentos sendo
// que A é depois substituído por B (cadeia A -> B), e grava os ids/hashes em
// /tmp/etapa4-out.json para o script de curl consumir.
const fs = require("fs");
const { ethers } = require("hardhat");

// Conta #4 padrão do Hardhat — será o backendAutorizado. Já vem com 10000 ETH
// de teste no `npx hardhat node`, então "financiar a carteira" está satisfeito.
const BACKEND_ADDRESS = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
const BACKEND_PRIVATE_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";

const StatusDocumento = ["Valido", "Expirado", "Revogado", "Substituido"];
const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

async function main() {
  const [vara] = await ethers.getSigners();
  console.log("Vara (deployer):", vara.address);

  const Factory = await ethers.getContractFactory("DocumentoSigilosoRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  const endereco = await registry.getAddress();
  console.log("Contrato:", endereco);

  await (await registry.definirBackendAutorizado(BACKEND_ADDRESS)).wait();
  console.log("backendAutorizado definido:", BACKEND_ADDRESS);
  console.log("Saldo do backend:", ethers.formatEther(await ethers.provider.getBalance(BACKEND_ADDRESS)), "ETH");

  // Documento A (será substituído por B)
  const idA = h("doc-A-alvara-viagem-2026");
  const hashA = h("conteudo-do-alvara-A");
  await (await registry.registrarDocumento(idA, hashA, 0)).wait();
  console.log("Registrado A:", idA);

  // Documento C (standalone, permanece Valido) — o 3º documento
  const idC = h("doc-C-termo-guarda-2026");
  const hashC = h("conteudo-do-termo-C");
  await (await registry.registrarDocumento(idC, hashC, 0)).wait();
  console.log("Registrado C:", idC);

  // Substitui A -> B (cria B, A vira Substituido). B NÃO emite
  // DocumentoRegistrado — só DocumentoSubstituido (por isso o indexador indexa
  // B a partir do evento de substituição).
  const idB = h("doc-B-alvara-viagem-2026-reemitido");
  const hashB = h("conteudo-do-alvara-B");
  await (await registry.substituirDocumento(idA, idB, hashB, 0)).wait();
  console.log("Substituido A -> B:", idB);

  console.log("\nStatus final on-chain:");
  for (const [nome, id] of [["A", idA], ["B", idB], ["C", idC]]) {
    console.log(`  ${nome}: ${StatusDocumento[Number(await registry.consultarStatus(id))]}`);
  }

  const saida = {
    contrato: endereco,
    backendAddress: BACKEND_ADDRESS,
    backendPrivateKey: BACKEND_PRIVATE_KEY,
    vara: vara.address,
    idA, hashA, idB, hashB, idC, hashC,
  };
  fs.writeFileSync("/tmp/etapa4-out.json", JSON.stringify(saida, null, 2));
  console.log("\nEscrito /tmp/etapa4-out.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
