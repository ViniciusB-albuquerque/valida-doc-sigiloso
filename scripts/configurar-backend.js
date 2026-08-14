const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

function lerEnvBackend() {
  const envPath = path.join(__dirname, "..", "backend", ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "backend/.env não encontrado. Copie backend/.env.example para backend/.env " +
        "e preencha RPC_URL/CONTRATO_ENDERECO/BACKEND_PRIVATE_KEY/JWT_SECRET/PORT antes de rodar este script."
    );
  }
  const conteudo = fs.readFileSync(envPath, "utf8");
  const vars = {};
  for (const linha of conteudo.split("\n")) {
    const match = linha.match(/^([A-Z_]+)=(.*)$/);
    if (match) vars[match[1]] = match[2].trim();
  }
  return vars;
}

async function main() {
  const env = lerEnvBackend();

  if (!env.BACKEND_PRIVATE_KEY || env.BACKEND_PRIVATE_KEY.includes("00000000000000")) {
    throw new Error("BACKEND_PRIVATE_KEY em backend/.env ainda está vazia/placeholder.");
  }
  if (!env.CONTRATO_ENDERECO || env.CONTRATO_ENDERECO.includes("0000000000")) {
    throw new Error("CONTRATO_ENDERECO em backend/.env ainda está vazio/placeholder — rode o deploy primeiro.");
  }

  const enderecoBackend = new ethers.Wallet(env.BACKEND_PRIVATE_KEY).address;
  const [vara] = await ethers.getSigners();
  const registry = await ethers.getContractAt("DocumentoSigilosoRegistry", env.CONTRATO_ENDERECO, vara);

  console.log("Contrato:", env.CONTRATO_ENDERECO);
  console.log("Endereço do backend (derivado de BACKEND_PRIVATE_KEY):", enderecoBackend);

  const jaAutorizado = await registry.backendAutorizado();
  if (jaAutorizado.toLowerCase() === enderecoBackend.toLowerCase()) {
    console.log("✓ backendAutorizado já está correto — nada a fazer.");
  } else {
    const tx = await registry.definirBackendAutorizado(enderecoBackend);
    await tx.wait();
    console.log("✓ definirBackendAutorizado confirmado:", tx.hash);
  }

  const saldo = await ethers.provider.getBalance(enderecoBackend);
  if (saldo >= ethers.parseEther("0.5")) {
    console.log("✓ Carteira do backend já tem saldo suficiente — nada a fazer.");
  } else {
    const tx = await vara.sendTransaction({ to: enderecoBackend, value: ethers.parseEther("1.0") });
    await tx.wait();
    console.log("✓ Carteira do backend financiada com 1 ETH de teste:", tx.hash);
  }

  sincronizarVerificarHtml(env);

  console.log("\nBackend pronto para uso neste contrato.");
}

function sincronizarVerificarHtml(env) {
  const verificarPath = path.join(__dirname, "..", "interface", "verificar.html");
  if (!fs.existsSync(verificarPath)) {
    console.log("⚠ interface/verificar.html não encontrado — pulando essa etapa.");
    return;
  }

  let conteudo = fs.readFileSync(verificarPath, "utf8");
  const regexRpc = /const RPC_URL = "[^"]*";/;
  const regexContrato = /const CONTRATO_ENDERECO = "[^"]*";/;

  if (!regexRpc.test(conteudo) || !regexContrato.test(conteudo)) {
    console.log(
      "⚠ Não encontrei as constantes RPC_URL/CONTRATO_ENDERECO no formato esperado " +
        "dentro de interface/verificar.html — pulei a sincronização automática. Edite manualmente."
    );
    return;
  }

  const conteudoAntes = conteudo;
  conteudo = conteudo.replace(regexRpc, `const RPC_URL = "${env.RPC_URL}";`);
  conteudo = conteudo.replace(regexContrato, `const CONTRATO_ENDERECO = "${env.CONTRATO_ENDERECO}";`);

  if (conteudo === conteudoAntes) {
    console.log("✓ interface/verificar.html já estava sincronizado — nada a fazer.");
  } else {
    fs.writeFileSync(verificarPath, conteudo);
    console.log("✓ interface/verificar.html sincronizado com backend/.env (RPC_URL e CONTRATO_ENDERECO atualizados).");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
