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
    expect(status).to.equal(0n); // Valido

    const txRevoga = await registry.revogarDocumento(documentId);
    await expect(txRevoga).to.emit(registry, "DocumentoRevogado");

    status = await registry.consultarStatus(documentId);
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

    expect(statusAntigo).to.equal(3n); // Substituido
    expect(statusNovo).to.equal(0n); // Valido

    const registroAntigo = await registry.obterRegistro(idAntigo);
    expect(registroAntigo.substituidoPor).to.equal(idNovo);
  });

  it("calcula Expirado dinamicamente quando passa do prazo, sem precisar de transação extra", async function () {
    const documentId = documentIdFrom("alvara-viagem-curto-prazo");
    const documentHash = documentHashFrom("conteudo-curto-prazo");

    const bloco = await ethers.provider.getBlock("latest");
    const expiraEm = bloco.timestamp + 5;

    await (await registry.registrarDocumento(documentId, documentHash, expiraEm)).wait();

    let status = await registry.consultarStatus(documentId);
    expect(status).to.equal(0n);

    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);

    status = await registry.consultarStatus(documentId);
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

    expect(await registry.consultarStatus(documentId)).to.equal(1n); // Expirado

    await expect(registry.revogarDocumento(documentId))
      .to.be.revertedWithCustomError(registry, "DocumentoNaoValido")
      .withArgs(documentId, 1n);
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
      .withArgs(idAntigo, 1n);

    await expect(registry.consultarStatus(idNovo)).to.be.revertedWithCustomError(registry, "DocumentoInexistente");
  });
});

describe("DocumentoSigilosoRegistry — duplicata por hash (Etapa 1)", function () {
  let registry;
  let vara;

  beforeEach(async function () {
    [vara] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DocumentoSigilosoRegistry", vara);
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  it("consultarPorHash retorna existe=false para um hash nunca registrado", async function () {
    const hash = documentHashFrom("conteudo-nunca-registrado");
    const [existe, id] = await registry.consultarPorHash(hash);
    expect(existe).to.equal(false);
    expect(id).to.equal(ethers.ZeroHash);
  });

  it("consultarPorHash retorna o documentId correto após o registro", async function () {
    const documentId = documentIdFrom("alvara-viagem-hash-0001");
    const documentHash = documentHashFrom("conteudo-hash-0001");
    await (await registry.registrarDocumento(documentId, documentHash, 0)).wait();

    const [existe, id] = await registry.consultarPorHash(documentHash);
    expect(existe).to.equal(true);
    expect(id).to.equal(documentId);
  });

  it("rejeita registrar o MESMO hash sob um documentId diferente (mesmo PDF, rótulo distinto)", async function () {
    const idOriginal = documentIdFrom("alvara-viagem-0001");
    const idCopia = documentIdFrom("alvara-viagem-0001-copia");
    const hashCompartilhado = documentHashFrom("conteudo-identico-nos-dois");

    await (await registry.registrarDocumento(idOriginal, hashCompartilhado, 0)).wait();

    await expect(registry.registrarDocumento(idCopia, hashCompartilhado, 0))
      .to.be.revertedWithCustomError(registry, "HashJaRegistrado")
      .withArgs(hashCompartilhado, idOriginal);
  });

  it("rejeita substituir um documento por outro cujo hash já existe em algum lugar", async function () {
    const idA = documentIdFrom("alvara-A");
    const idB = documentIdFrom("alvara-B");
    const idC = documentIdFrom("alvara-C-tentativa-substituto");
    const hashA = documentHashFrom("conteudo-A");
    const hashB = documentHashFrom("conteudo-B-ja-usado-em-outro-lugar");

    await (await registry.registrarDocumento(idA, hashA, 0)).wait();
    await (await registry.registrarDocumento(idB, hashB, 0)).wait(); // hashB já ocupado por idB

    // Tenta substituir A por um documento novo (idC) reaproveitando hashB, que já pertence a B.
    await expect(registry.substituirDocumento(idA, idC, hashB, 0))
      .to.be.revertedWithCustomError(registry, "HashJaRegistrado")
      .withArgs(hashB, idB);
  });
});

describe("DocumentoSigilosoRegistry — resolverDocumentoAtual (Etapa 1)", function () {
  let registry;
  let vara;

  beforeEach(async function () {
    [vara] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DocumentoSigilosoRegistry", vara);
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  it("retorna o próprio id quando o documento nunca foi substituído", async function () {
    const documentId = documentIdFrom("alvara-sem-substituicao");
    await (await registry.registrarDocumento(documentId, documentHashFrom("x"), 0)).wait();

    expect(await registry.resolverDocumentoAtual(documentId)).to.equal(documentId);
  });

  it("resolve um único salto (A substituído por B)", async function () {
    const idA = documentIdFrom("cadeia-A");
    const idB = documentIdFrom("cadeia-B");
    await (await registry.registrarDocumento(idA, documentHashFrom("conteudo-A"), 0)).wait();
    await (await registry.substituirDocumento(idA, idB, documentHashFrom("conteudo-B"), 0)).wait();

    expect(await registry.resolverDocumentoAtual(idA)).to.equal(idB);
  });

  it("resolve uma cadeia de múltiplos saltos (A -> B -> C) num único retorno", async function () {
    const idA = documentIdFrom("cadeia-longa-A");
    const idB = documentIdFrom("cadeia-longa-B");
    const idC = documentIdFrom("cadeia-longa-C");

    await (await registry.registrarDocumento(idA, documentHashFrom("conteudo-longa-A"), 0)).wait();
    await (await registry.substituirDocumento(idA, idB, documentHashFrom("conteudo-longa-B"), 0)).wait();
    await (await registry.substituirDocumento(idB, idC, documentHashFrom("conteudo-longa-C"), 0)).wait();

    // A cadeia inteira A -> B -> C resolve direto para C, sem parar em B.
    expect(await registry.resolverDocumentoAtual(idA)).to.equal(idC);
    expect(await registry.resolverDocumentoAtual(idB)).to.equal(idC);
    expect(await registry.resolverDocumentoAtual(idC)).to.equal(idC);
  });

  it("rejeita resolver um documentId que nunca existiu", async function () {
    const idInexistente = documentIdFrom("nunca-existiu");
    await expect(registry.resolverDocumentoAtual(idInexistente)).to.be.revertedWithCustomError(
      registry,
      "DocumentoInexistente"
    );
  });
});

describe("DocumentoSigilosoRegistry — não-repúdio reforçado (Etapa 1)", function () {
  let registry;
  let vara;
  let backend;
  let atendente1;
  let outraConta;

  beforeEach(async function () {
    [vara, backend, atendente1, outraConta] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DocumentoSigilosoRegistry", vara);
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  it("confirmarVerificacao não existe mais no ABI (função removida nesta etapa)", async function () {
    expect(registry.interface.hasFunction("confirmarVerificacao(bytes32)")).to.equal(false);
  });

  it("registrarAcesso reverte se o backend autorizado ainda não foi definido", async function () {
    const documentId = documentIdFrom("alvara-sem-backend-definido");
    await (await registry.registrarDocumento(documentId, documentHashFrom("x"), 0)).wait();

    await expect(
      registry.connect(backend).registrarAcesso(documentId, atendente1.address, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(registry, "ApenasBackendAutorizado");
  });

  it("só a vara consegue definir o backend autorizado", async function () {
    await expect(
      registry.connect(outraConta).definirBackendAutorizado(backend.address)
    ).to.be.revertedWithCustomError(registry, "ApenasVara");

    await (await registry.definirBackendAutorizado(backend.address)).wait();
    expect(await registry.backendAutorizado()).to.equal(backend.address);
  });

  it("rejeita registrarAcesso vindo de qualquer conta que não seja o backend autorizado", async function () {
    const documentId = documentIdFrom("alvara-acesso-nao-autorizado");
    await (await registry.registrarDocumento(documentId, documentHashFrom("x"), 0)).wait();
    await (await registry.definirBackendAutorizado(backend.address)).wait();

    // Nem o próprio verificador, nem a vara, conseguem chamar diretamente — só o backend.
    await expect(
      registry.connect(atendente1).registrarAcesso(documentId, atendente1.address, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(registry, "ApenasBackendAutorizado");
  });

  it("cenário do aeroporto, versão reforçada: o backend registra o acesso em nome do verificador, com hash de assinatura ancorado", async function () {
    const documentId = documentIdFrom("alvara-fila-aeroporto-reforcado");
    await (await registry.registrarDocumento(documentId, documentHashFrom("conteudo-aeroporto"), 0)).wait();
    await (await registry.definirBackendAutorizado(backend.address)).wait();

    // Simula o hash de uma mensagem assinada pelo atendente via personal_sign (fora da chain).
    const assinaturaHash = ethers.keccak256(ethers.toUtf8Bytes("assinatura-simulada-do-atendente"));

    const tx = await registry.connect(backend).registrarAcesso(documentId, atendente1.address, assinaturaHash);
    const receipt = await tx.wait();
    console.log("\n[registrarAcesso] tx hash:", receipt.hash);

    await expect(tx)
      .to.emit(registry, "AcessoRegistrado")
      .withArgs(documentId, atendente1.address, assinaturaHash, anyValue);

    // Confirma que qualquer um consegue reconstruir o histórico via evento — mesma lógica
    // pública de antes, só que agora alimentada exclusivamente pelo backend.
    const eventos = await registry.queryFilter(registry.filters.AcessoRegistrado(documentId));
    expect(eventos.length).to.equal(1);
    expect(eventos[0].args.verificador).to.equal(atendente1.address);
    expect(eventos[0].args.assinaturaHash).to.equal(assinaturaHash);
  });

  it("registrarAcesso não altera o status do documento (continua sendo só um carimbo)", async function () {
    const documentId = documentIdFrom("alvara-acesso-nao-altera-status");
    await (await registry.registrarDocumento(documentId, documentHashFrom("x"), 0)).wait();
    await (await registry.definirBackendAutorizado(backend.address)).wait();

    await (await registry.connect(backend).registrarAcesso(documentId, atendente1.address, ethers.ZeroHash)).wait();

    expect(await registry.consultarStatus(documentId)).to.equal(0n); // continua Valido
  });

  it("registrarAcesso rejeita documento inexistente", async function () {
    await (await registry.definirBackendAutorizado(backend.address)).wait();
    const idInexistente = documentIdFrom("nunca-registrado");

    await expect(
      registry.connect(backend).registrarAcesso(idInexistente, atendente1.address, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(registry, "DocumentoInexistente");
  });
});
