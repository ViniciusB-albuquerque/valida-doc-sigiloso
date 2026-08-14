// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DocumentoSigilosoRegistry
/// @notice Registra o hash e o status de documentos judiciais sigilosos (alvarás de viagem,
///         termos de guarda) expedidos por uma Vara da Infância e Juventude.
/// @dev Princípio central: o contrato é um "cartório de hashes", não um banco de dados.
///      NUNCA armazena dados pessoais (nome de criança/adolescente, número do processo,
///      responsáveis, destino de viagem etc.). Esses dados ficam em banco de dados off-chain,
///      com controle de acesso por perfil de usuário (Polícia Federal, companhia aérea,
///      Conselho Tutelar). A blockchain só responde: "este documento existe, está válido,
///      foi emitido por quem tinha autoridade para emiti-lo, e não foi adulterado?"
contract DocumentoSigilosoRegistry {
    /// @notice Estados possíveis de um documento sigiloso.
    /// @dev "Expirado" nunca é gravado em storage: é calculado dinamicamente em tempo de
    ///      leitura a partir de `expiraEm` e `block.timestamp`. Isso evita depender de uma
    ///      transação (que poderia nunca ser enviada) para marcar o documento como expirado.
    enum StatusDocumento {
        Valido,
        Expirado,
        Revogado,
        Substituido
    }

    struct RegistroDocumento {
        bytes32 documentHash; // hash canônico do documento + metadados, calculado off-chain
        address emissor; // endereço autorizado que efetuou o registro
        uint64 emitidoEm; // timestamp de emissão
        uint64 expiraEm; // timestamp de expiração (0 = sem expiração definida)
        StatusDocumento status; // último estado gravado explicitamente (não inclui "Expirado")
        bytes32 substituidoPor; // documentId do documento sucessor, se houver substituição
        bool existe; // true se o documentId já foi registrado alguma vez
    }

    /// @notice Endereço da Vara (autoridade emissora) autorizado a emitir/revogar/substituir.
    address public vara;

    /// @notice Endereço do backend autorizado a registrar acessos (ver `registrarAcesso`).
    /// @dev Começa em address(0) — ninguém consegue chamar `registrarAcesso` até a Vara
    ///      definir isso explicitamente via `definirBackendAutorizado`.
    address public backendAutorizado;

    mapping(bytes32 => RegistroDocumento) private registros;

    /// @notice documentHash -> documentId já registrado com esse hash (0x0 = nenhum).
    /// @dev Evita que o MESMO conteúdo (mesmo PDF) seja registrado duas vezes sob
    ///      documentId's diferentes — o que criaria dois registros com históricos de
    ///      revogação/substituição divergentes para, na prática, o mesmo documento físico.
    mapping(bytes32 => bytes32) private documentIdPorHash;

    error ApenasVara();
    error ApenasBackendAutorizado();
    error DocumentIdInvalido();
    error DocumentHashInvalido();
    error EnderecoInvalido();
    error DocumentoJaRegistrado(bytes32 documentId);
    error HashJaRegistrado(bytes32 documentHash, bytes32 documentIdExistente);
    error DocumentoInexistente(bytes32 documentId);
    error DocumentoNaoValido(bytes32 documentId, StatusDocumento statusAtual);

    event DocumentoRegistrado(
        bytes32 indexed documentId,
        bytes32 indexed documentHash,
        address indexed emissor,
        uint64 expiraEm
    );

    event DocumentoRevogado(bytes32 indexed documentId, address indexed revogadoPor, uint64 revogadoEm);

    event DocumentoSubstituido(
        bytes32 indexed documentIdAntigo,
        bytes32 indexed documentIdNovo,
        address indexed responsavel
    );

    /// @notice Emitido quando o backend registra que um endereço acessou os detalhes de um documento.
    /// @dev Mecanismo de não-repúdio de leitura, versão reforçada: diferente da primeira
    ///      versão (função pública `confirmarVerificacao`, removida nesta etapa — qualquer
    ///      endereço podia chamá-la sem nunca ter passado pelo fluxo real de acesso), agora
    ///      só o backend autorizado consegue emitir este evento, e só o faz como parte do
    ///      mesmo fluxo que serve os dados do Nível 2 — nunca como uma ação isolada. O campo
    ///      `assinaturaHash` ancora o hash de uma mensagem assinada pelo próprio `verificador`
    ///      (fora desta transação, sem gas) no momento do acesso: mesmo que o backend seja
    ///      questionado depois, a assinatura original (mantida off-chain) mais este hash
    ///      permitem provar, de forma independente do backend, que o `verificador` realmente
    ///      assinou aquele acesso.
    event AcessoRegistrado(
        bytes32 indexed documentId,
        address indexed verificador,
        bytes32 assinaturaHash,
        uint64 quando
    );

    modifier onlyVara() {
        if (msg.sender != vara) revert ApenasVara();
        _;
    }

    modifier onlyBackend() {
        if (msg.sender != backendAutorizado) revert ApenasBackendAutorizado();
        _;
    }

    constructor() {
        vara = msg.sender;
    }

    /// @notice Registra um novo documento sigiloso.
    /// @dev Função central do sistema. Estado inicial é sempre `Valido`. Bloqueia tanto
    ///      `documentId` repetido quanto `documentHash` já usado por outro `documentId`
    ///      (ver `documentIdPorHash`).
    /// @param documentId Identificador não sensível do documento (ex.: keccak256 de um UUID
    ///        interno gerado pelo backend — nunca o número do processo).
    /// @param documentHash Hash canônico do conteúdo + metadados do documento (calculado off-chain).
    /// @param expiraEm Timestamp Unix de expiração (use 0 se não houver expiração definida).
    function registrarDocumento(bytes32 documentId, bytes32 documentHash, uint64 expiraEm) external onlyVara {
        if (documentId == bytes32(0)) revert DocumentIdInvalido();
        if (documentHash == bytes32(0)) revert DocumentHashInvalido();
        if (registros[documentId].existe) revert DocumentoJaRegistrado(documentId);
        if (documentIdPorHash[documentHash] != bytes32(0)) {
            revert HashJaRegistrado(documentHash, documentIdPorHash[documentHash]);
        }

        registros[documentId] = RegistroDocumento({
            documentHash: documentHash,
            emissor: msg.sender,
            emitidoEm: uint64(block.timestamp),
            expiraEm: expiraEm,
            status: StatusDocumento.Valido,
            substituidoPor: bytes32(0),
            existe: true
        });
        documentIdPorHash[documentHash] = documentId;

        emit DocumentoRegistrado(documentId, documentHash, msg.sender, expiraEm);
    }

    /// @notice Revoga um documento válido (ex.: guarda destituída, alvará cancelado).
    /// @dev A checagem usa o status EFETIVO (via `_statusEfetivo`), não o status bruto do
    ///      storage — isso impede revogar um documento que já expirou naturalmente, mantendo
    ///      consistência com o que `consultarStatus` já mostra publicamente.
    function revogarDocumento(bytes32 documentId) external onlyVara {
        RegistroDocumento storage registro = registros[documentId];
        if (!registro.existe) revert DocumentoInexistente(documentId);

        StatusDocumento statusAtual = _statusEfetivo(registro);
        if (statusAtual != StatusDocumento.Valido) {
            revert DocumentoNaoValido(documentId, statusAtual);
        }

        registro.status = StatusDocumento.Revogado;

        emit DocumentoRevogado(documentId, msg.sender, uint64(block.timestamp));
    }

    /// @notice Substitui um documento válido por uma nova versão (ex.: alvará reemitido com
    ///         novo destino). O documento antigo passa a `Substituido` e aponta para o novo.
    /// @dev Mesma correção de `revogarDocumento` (status efetivo) e mesma checagem de
    ///      duplicata por hash de `registrarDocumento`, aplicada ao documento novo.
    function substituirDocumento(
        bytes32 documentIdAntigo,
        bytes32 documentIdNovo,
        bytes32 documentHashNovo,
        uint64 expiraEmNovo
    ) external onlyVara {
        RegistroDocumento storage antigo = registros[documentIdAntigo];
        if (!antigo.existe) revert DocumentoInexistente(documentIdAntigo);

        StatusDocumento statusAntigo = _statusEfetivo(antigo);
        if (statusAntigo != StatusDocumento.Valido) {
            revert DocumentoNaoValido(documentIdAntigo, statusAntigo);
        }

        if (documentIdNovo == bytes32(0)) revert DocumentIdInvalido();
        if (documentHashNovo == bytes32(0)) revert DocumentHashInvalido();
        if (registros[documentIdNovo].existe) revert DocumentoJaRegistrado(documentIdNovo);
        if (documentIdPorHash[documentHashNovo] != bytes32(0)) {
            revert HashJaRegistrado(documentHashNovo, documentIdPorHash[documentHashNovo]);
        }

        antigo.status = StatusDocumento.Substituido;
        antigo.substituidoPor = documentIdNovo;

        registros[documentIdNovo] = RegistroDocumento({
            documentHash: documentHashNovo,
            emissor: msg.sender,
            emitidoEm: uint64(block.timestamp),
            expiraEm: expiraEmNovo,
            status: StatusDocumento.Valido,
            substituidoPor: bytes32(0),
            existe: true
        });
        documentIdPorHash[documentHashNovo] = documentIdNovo;

        emit DocumentoSubstituido(documentIdAntigo, documentIdNovo, msg.sender);
    }

    /// @notice Consulta o status efetivo do documento (calcula expiração em tempo de leitura).
    function consultarStatus(bytes32 documentId) external view returns (StatusDocumento) {
        RegistroDocumento storage registro = registros[documentId];
        if (!registro.existe) revert DocumentoInexistente(documentId);
        return _statusEfetivo(registro);
    }

    /// @notice Retorna o registro completo (hash, emissor, datas, status efetivo, sucessor).
    function obterRegistro(
        bytes32 documentId
    )
        external
        view
        returns (
            bytes32 documentHash,
            address emissor,
            uint64 emitidoEm,
            uint64 expiraEm,
            StatusDocumento status,
            bytes32 substituidoPor
        )
    {
        RegistroDocumento storage registro = registros[documentId];
        if (!registro.existe) revert DocumentoInexistente(documentId);

        return (
            registro.documentHash,
            registro.emissor,
            registro.emitidoEm,
            registro.expiraEm,
            _statusEfetivo(registro),
            registro.substituidoPor
        );
    }

    /// @notice Consulta se um hash de documento já foi registrado, e sob qual documentId.
    /// @dev Usado pela interface assim que um PDF é carregado (antes de preencher qualquer
    ///      campo) para checar duplicata por conteúdo, não só por id escolhido pelo usuário.
    function consultarPorHash(bytes32 documentHash) external view returns (bool existe, bytes32 documentId) {
        bytes32 id = documentIdPorHash[documentHash];
        return (id != bytes32(0), id);
    }

    /// @notice Resolve a cadeia de substituições inteira, de uma vez, até achar a versão vigente.
    /// @dev Sem custo de gas para quem só consulta (`view`). Sem risco de laço infinito:
    ///      `documentIdNovo` nunca pode já existir no momento de uma substituição
    ///      (checado em `substituirDocumento`), então a cadeia é estritamente progressiva.
    function resolverDocumentoAtual(bytes32 documentId) external view returns (bytes32 documentIdAtual) {
        documentIdAtual = documentId;
        RegistroDocumento storage registro = registros[documentIdAtual];
        if (!registro.existe) revert DocumentoInexistente(documentId);

        while (registro.status == StatusDocumento.Substituido) {
            documentIdAtual = registro.substituidoPor;
            registro = registros[documentIdAtual];
        }
    }

    /// @notice Transfere a autoridade de emissão para outro endereço.
    function transferirVara(address novaVara) external onlyVara {
        if (novaVara == address(0)) revert EnderecoInvalido();
        vara = novaVara;
    }

    /// @notice Define qual endereço do backend está autorizado a chamar `registrarAcesso`.
    /// @dev Só a Vara pode trocar isso — é a mesma raiz de confiança que já controla emissão.
    function definirBackendAutorizado(address novoBackend) external onlyVara {
        if (novoBackend == address(0)) revert EnderecoInvalido();
        backendAutorizado = novoBackend;
    }

    /// @notice Registra, de forma não-repudiável, que `verificador` acessou os detalhes de
    ///         um documento — chamado automaticamente pelo backend, nunca pelo próprio
    ///         verificador, e nunca como uma ação isolada de um clique.
    /// @dev Substituiu `confirmarVerificacao` (pública, sem controle). Só `backendAutorizado`
    ///      pode chamar — fecha a brecha de alguém carimbar acesso sem ter passado pelo
    ///      fluxo real (login + checagem de identidade cadastrada + servir os dados).
    /// @param assinaturaHash Hash de uma mensagem assinada pelo próprio `verificador`
    ///        (fora desta transação, via `personal_sign`, sem gas) no momento do acesso —
    ///        ancora uma prova independente do backend, sem precisar guardar a assinatura
    ///        inteira on-chain.
    function registrarAcesso(bytes32 documentId, address verificador, bytes32 assinaturaHash) external onlyBackend {
        if (!registros[documentId].existe) revert DocumentoInexistente(documentId);
        emit AcessoRegistrado(documentId, verificador, assinaturaHash, uint64(block.timestamp));
    }

    function _statusEfetivo(RegistroDocumento storage registro) private view returns (StatusDocumento) {
        if (registro.status == StatusDocumento.Valido && registro.expiraEm != 0 && block.timestamp > registro.expiraEm) {
            return StatusDocumento.Expirado;
        }
        return registro.status;
    }
}
