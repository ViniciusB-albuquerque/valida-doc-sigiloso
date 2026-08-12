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

    mapping(bytes32 => RegistroDocumento) private registros;

    error ApenasVara();
    error DocumentIdInvalido();
    error DocumentHashInvalido();
    error EnderecoInvalido();
    error DocumentoJaRegistrado(bytes32 documentId);
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

    /// @notice Emitido quando alguém confirma ter acessado os detalhes de um documento.
    /// @dev Este é o mecanismo de não-repúdio de leitura: não prova que o documento é
    ///      válido (isso `consultarStatus` já garante), prova que UM ENDEREÇO ESPECÍFICO
    ///      atesta ter visto os detalhes deste documento NESTE momento. Resolve o cenário
    ///      "o atendente anterior disse que verificou, mas é só a palavra dele" — agora
    ///      qualquer um pode conferir a lista de confirmações sem precisar confiar em
    ///      ninguém, só consultando o histórico de eventos.
    event DocumentoVerificadoPor(bytes32 indexed documentId, address indexed verificador, uint64 verificadoEm);

    modifier onlyVara() {
        if (msg.sender != vara) revert ApenasVara();
        _;
    }

    constructor() {
        vara = msg.sender;
    }

    /// @notice Registra um novo documento sigiloso.
    /// @dev Função central do sistema (equivalente ao "registrar documento e recuperar hash"
    ///      citado no roteiro da disciplina). Estado inicial é sempre `Valido`.
    /// @param documentId Identificador não sensível do documento (ex.: keccak256 de um UUID
    ///        interno gerado pelo backend — nunca o número do processo).
    /// @param documentHash Hash canônico do conteúdo + metadados do documento (calculado off-chain).
    /// @param expiraEm Timestamp Unix de expiração (use 0 se não houver expiração definida).
    function registrarDocumento(bytes32 documentId, bytes32 documentHash, uint64 expiraEm) external onlyVara {
        if (documentId == bytes32(0)) revert DocumentIdInvalido();
        if (documentHash == bytes32(0)) revert DocumentHashInvalido();
        if (registros[documentId].existe) revert DocumentoJaRegistrado(documentId);

        registros[documentId] = RegistroDocumento({
            documentHash: documentHash,
            emissor: msg.sender,
            emitidoEm: uint64(block.timestamp),
            expiraEm: expiraEm,
            status: StatusDocumento.Valido,
            substituidoPor: bytes32(0),
            existe: true
        });

        emit DocumentoRegistrado(documentId, documentHash, msg.sender, expiraEm);
    }

    /// @notice Revoga um documento válido (ex.: guarda destituída, alvará cancelado).
    /// @dev A checagem usa o status EFETIVO (via `_statusEfetivo`), não o status bruto do
    ///      storage — isso impede revogar um documento que já expirou naturalmente, mantendo
    ///      consistência com o que `consultarStatus` já mostra publicamente. Antes desta
    ///      correção, era possível "revogar" algo que, para quem consultava, já aparecia
    ///      como `Expirado` — uma inconsistência entre leitura e escrita.
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
    /// @dev Mesma correção de `revogarDocumento`: a checagem do documento antigo usa o status
    ///      efetivo, não permitindo substituir algo que já expirou naturalmente.
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

    /// @notice Transfere a autoridade de emissão para outro endereço.
    /// @dev Modelo mínimo de autorização (um único emissor). Um modelo com múltiplos
    ///      emissores autorizados (ex.: vários servidores da vara) fica para uma iteração
    ///      futura, quando o controle de acesso for detalhado.
    function transferirVara(address novaVara) external onlyVara {
        if (novaVara == address(0)) revert EnderecoInvalido();
        vara = novaVara;
    }

    /// @notice Registra, de forma não-repudiável, que quem chamou esta função acessou
    ///         os detalhes deste documento neste momento.
    /// @dev Deliberadamente SEM `onlyVara` — qualquer verificador (Polícia Federal,
    ///      companhia aérea, Conselho Tutelar, outro atendente) pode confirmar. Não
    ///      altera nenhum estado do documento (não muda `status`, não é uma "aprovação"
    ///      do documento em si) — é só um carimbo de "eu vi isso", com endereço e
    ///      timestamp, permanentemente auditável via `queryFilter` do evento.
    function confirmarVerificacao(bytes32 documentId) external {
        if (!registros[documentId].existe) revert DocumentoInexistente(documentId);
        emit DocumentoVerificadoPor(documentId, msg.sender, uint64(block.timestamp));
    }

    function _statusEfetivo(RegistroDocumento storage registro) private view returns (StatusDocumento) {
        if (registro.status == StatusDocumento.Valido && registro.expiraEm != 0 && block.timestamp > registro.expiraEm) {
            return StatusDocumento.Expirado;
        }
        return registro.status;
    }
}
