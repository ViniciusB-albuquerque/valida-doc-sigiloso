const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Helper: gera um documentId "não sensível" a partir de um identificador interno
// (nunca o número do processo em texto puro).
function documentIdFrom(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

// Helper: simula o hash canônico do documento (calculado off-chain, no backend,
// a partir do conteúdo completo do PDF/JSON do alvará).
function documentHashFrom(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

const StatusDocumento = ["Valido", "Expirado", "Revogado", "Substituido"];

describe("DocumentoSigilosoRegistry", function () {
  let registry;
  let vara;
  let outraConta;

  beforeEach(async function () {
    [vara, outraConta] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DocumentoSigilosoRegistry", vara);
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  it("registra um documento e o deixa com status Valido", async function () {
    const documentId = documentIdFrom("alvara-viagem-0001");
    const documentHash = documentHashFrom("conteudo-completo-do-alvara-0001");

    const tx = await registry.registrarDocumento(documentId, documentHash, 0);
    const receipt = await tx.wait();

    console.log("\n[registrarDocumento] tx hash:", receipt.hash);
    console.log("[registrarDocumento] bloco:", receipt.blockNumber);
    console.log("[registrarDocumento] gas usado:", receipt.gasUsed.toString());

    await expect(tx)
      .to.emit(registry, "DocumentoRegistrado")
      .withArgs(documentId, documentHash, vara.address, 0n);

    const status = await registry.consultarStatus(documentId);
    console.log("[consultarStatus] status após registro:", StatusDocumento[Number(status)]);
    expect(status).to.equal(0n); // Valido
  });

  it("impede que uma conta não autorizada registre documentos", async function () {
    const documentId = documentIdFrom("alvara-viagem-0002");
    const documentHash = documentHashFrom("conteudo-0002");

    await expect(
      registry.connect(outraConta).registrarDocumento(documentId, documentHash, 0)
    ).to.be.revertedWithCustomError(registry, "ApenasVara");
  });

  it("registra, revoga e mostra a transição de estado Valido -> Revogado", async function () {
    const documentId = documentIdFrom("termo-guarda-0007");
    const documentHash = documentHashFrom("conteudo-completo-termo-0007");

    await (await registry.registrarDocumento(documentId, documentHash, 0)).wait();

    let status = await registry.consultarStatus(documentId);
    console.log("\n[antes] status:", StatusDocumento[Number(status)]);
    expect(status).to.equal(0n); // Valido

    const txRevoga = await registry.revogarDocumento(documentId);
    const receiptRevoga = await txRevoga.wait();
    console.log("[revogarDocumento] tx hash:", receiptRevoga.hash);

    await expect(txRevoga).to.emit(registry, "DocumentoRevogado");

    status = await registry.consultarStatus(documentId);
    console.log("[depois] status:", StatusDocumento[Number(status)]);
    expect(status).to.equal(2n); // Revogado
  });

  it("substitui um documento válido e encadeia o sucessor", async function () {
    const idAntigo = documentIdFrom("alvara-viagem-0099-v1");
    const idNovo = documentIdFrom("alvara-viagem-0099-v2");
    const hashAntigo = documentHashFrom("conteudo-v1");
    const hashNovo = documentHashFrom("conteudo-v2-destino-corrigido");

    await (await registry.registrarDocumento(idAntigo, hashAntigo, 0)).wait();

    const txSubstitui = await registry.substituirDocumento(idAntigo, idNovo, hashNovo, 0);
    await expect(txSubstitui).to.emit(registry, "DocumentoSubstituido").withArgs(idAntigo, idNovo, vara.address);

    const statusAntigo = await registry.consultarStatus(idAntigo);
    const statusNovo = await registry.consultarStatus(idNovo);

    console.log("\n[substituirDocumento] status do antigo:", StatusDocumento[Number(statusAntigo)]);
    console.log("[substituirDocumento] status do novo:", StatusDocumento[Number(statusNovo)]);

    expect(statusAntigo).to.equal(3n); // Substituido
    expect(statusNovo).to.equal(0n); // Valido

    const registroAntigo = await registry.obterRegistro(idAntigo);
    expect(registroAntigo.substituidoPor).to.equal(idNovo);
  });

  it("calcula Expirado dinamicamente quando passa do prazo, sem precisar de transação extra", async function () {
    const documentId = documentIdFrom("alvara-viagem-curto-prazo");
    const documentHash = documentHashFrom("conteudo-curto-prazo");

    const bloco = await ethers.provider.getBlock("latest");
    const expiraEm = bloco.timestamp + 5; // expira em 5 segundos

    await (await registry.registrarDocumento(documentId, documentHash, expiraEm)).wait();

    let status = await registry.consultarStatus(documentId);
    expect(status).to.equal(0n); // ainda Valido

    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);

    status = await registry.consultarStatus(documentId);
    console.log("\n[expiração automática] status após passar do prazo:", StatusDocumento[Number(status)]);
    expect(status).to.equal(1n); // Expirado
  });

  it("rejeita registrar o mesmo documentId duas vezes", async function () {
    const documentId = documentIdFrom("alvara-duplicado");
    const documentHash = documentHashFrom("conteudo-duplicado");

    await (await registry.registrarDocumento(documentId, documentHash, 0)).wait();

    await expect(registry.registrarDocumento(documentId, documentHash, 0))
      .to.be.revertedWithCustomError(registry, "DocumentoJaRegistrado")
      .withArgs(documentId);
  });

  it("rejeita revogar um documento que já expirou naturalmente (status efetivo consistente)", async function () {
    const documentId = documentIdFrom("alvara-viagem-expira-antes-de-revogar");
    const documentHash = documentHashFrom("conteudo-expira-antes-de-revogar");

    const bloco = await ethers.provider.getBlock("latest");
    const expiraEm = bloco.timestamp + 5;
    await (await registry.registrarDocumento(documentId, documentHash, expiraEm)).wait();

    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);

    // Confirma que, pra quem consulta, já aparece Expirado.
    const statusAntesDeTentar = await registry.consultarStatus(documentId);
    expect(statusAntesDeTentar).to.equal(1n); // Expirado

    // A tentativa de revogar agora precisa reverter, informando o status EFETIVO
    // (Expirado), não o status bruto do storage (que ainda seria Valido).
    await expect(registry.revogarDocumento(documentId))
      .to.be.revertedWithCustomError(registry, "DocumentoNaoValido")
      .withArgs(documentId, 1n); // 1n = Expirado
  });

  it("rejeita substituir um documento que já expirou naturalmente", async function () {
    const idAntigo = documentIdFrom("alvara-viagem-expira-antes-de-substituir");
    const idNovo = documentIdFrom("alvara-viagem-substituto-nunca-deveria-existir");
    const hashAntigo = documentHashFrom("conteudo-antigo-expirado");
    const hashNovo = documentHashFrom("conteudo-novo");

    const bloco = await ethers.provider.getBlock("latest");
    const expiraEm = bloco.timestamp + 5;
    await (await registry.registrarDocumento(idAntigo, hashAntigo, expiraEm)).wait();

    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);

    await expect(registry.substituirDocumento(idAntigo, idNovo, hashNovo, 0))
      .to.be.revertedWithCustomError(registry, "DocumentoNaoValido")
      .withArgs(idAntigo, 1n); // 1n = Expirado

    // Confirma que o documento novo nem chegou a ser criado.
    await expect(registry.consultarStatus(idNovo)).to.be.revertedWithCustomError(registry, "DocumentoInexistente");
  });
});

describe("DocumentoSigilosoRegistry — confirmarVerificacao (não-repúdio de leitura)", function () {
  let registry;
  let vara;
  let atendente1;
  let atendente2;

  beforeEach(async function () {
    [vara, atendente1, atendente2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DocumentoSigilosoRegistry", vara);
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  it("permite que qualquer conta (não só a vara) confirme ter verificado um documento", async function () {
    const documentId = documentIdFrom("alvara-verificacao-0001");
    const documentHash = documentHashFrom("conteudo-verificacao-0001");
    await (await registry.registrarDocumento(documentId, documentHash, 0)).wait();

    // atendente1 faz o papel do primeiro atendente no cenário do aeroporto
    const tx = await registry.connect(atendente1).confirmarVerificacao(documentId);
    const receipt = await tx.wait();
    console.log("\n[confirmarVerificacao] tx hash:", receipt.hash);

    await expect(tx)
      .to.emit(registry, "DocumentoVerificadoPor")
      .withArgs(documentId, atendente1.address, anyValue);
  });

  it("rejeita confirmar verificação de um documento inexistente", async function () {
    const documentId = documentIdFrom("nao-existe-999");

    await expect(registry.connect(atendente1).confirmarVerificacao(documentId))
      .to.be.revertedWithCustomError(registry, "DocumentoInexistente")
      .withArgs(documentId);
  });

  it("cenário do aeroporto: acumula confirmações de atendentes diferentes, formando um histórico público e consultável", async function () {
    const documentId = documentIdFrom("alvara-fila-aeroporto");
    const documentHash = documentHashFrom("conteudo-fila-aeroporto");
    await (await registry.registrarDocumento(documentId, documentHash, 0)).wait();

    // Primeiro atendente confirma que verificou.
    await (await registry.connect(atendente1).confirmarVerificacao(documentId)).wait();

    // Mais à frente na fila, um segundo atendente também confirma —
    // independentemente, sem precisar "confiar na palavra" do primeiro.
    await (await registry.connect(atendente2).confirmarVerificacao(documentId)).wait();

    // Qualquer pessoa consegue reconstruir esse histórico consultando os eventos —
    // é exatamente isso que a tela pública de verificação vai mostrar.
    const eventos = await registry.queryFilter(registry.filters.DocumentoVerificadoPor(documentId));

    console.log("\n[histórico de verificações]");
    for (const ev of eventos) {
      console.log(`  verificado por ${ev.args.verificador} em ${ev.args.verificadoEm}`);
    }

    expect(eventos.length).to.equal(2);
    expect(eventos[0].args.verificador).to.equal(atendente1.address);
    expect(eventos[1].args.verificador).to.equal(atendente2.address);
  });

  it("não confirmar verificação não altera o status do documento (é só um carimbo de leitura, não uma aprovação)", async function () {
    const documentId = documentIdFrom("alvara-nao-altera-status");
    const documentHash = documentHashFrom("conteudo-nao-altera-status");
    await (await registry.registrarDocumento(documentId, documentHash, 0)).wait();

    await (await registry.connect(atendente1).confirmarVerificacao(documentId)).wait();

    const status = await registry.consultarStatus(documentId);
    expect(status).to.equal(0n); // continua Valido — confirmarVerificacao não muda estado do documento
  });
});
