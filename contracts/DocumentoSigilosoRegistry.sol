// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DocumentoSigilosoRegistry {
   
    enum StatusDocumento {
        Valido,
        Expirado,
        Revogado,
        Substituido
    }

    struct RegistroDocumento {
        bytes32 documentHash; 
        address emissor; // endereço que fez o registro
        uint64 emitidoEm; 
        uint64 expiraEm; 
        StatusDocumento status; 
        bytes32 substituidoPor; 
        bool existe; 
    }

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

    modifier onlyVara() {
        if (msg.sender != vara) revert ApenasVara();
        _;
    }

    constructor() {
        vara = msg.sender;
    }


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

    function revogarDocumento(bytes32 documentId) external onlyVara {
        RegistroDocumento storage registro = registros[documentId];
        if (!registro.existe) revert DocumentoInexistente(documentId);
        if (registro.status != StatusDocumento.Valido) {
            revert DocumentoNaoValido(documentId, registro.status);
        }

        registro.status = StatusDocumento.Revogado;

        emit DocumentoRevogado(documentId, msg.sender, uint64(block.timestamp));
    }

    function substituirDocumento(
        bytes32 documentIdAntigo,
        bytes32 documentIdNovo,
        bytes32 documentHashNovo,
        uint64 expiraEmNovo
    ) external onlyVara {
        RegistroDocumento storage antigo = registros[documentIdAntigo];
        if (!antigo.existe) revert DocumentoInexistente(documentIdAntigo);
        if (antigo.status != StatusDocumento.Valido) {
            revert DocumentoNaoValido(documentIdAntigo, antigo.status);
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

    function consultarStatus(bytes32 documentId) external view returns (StatusDocumento) {
        RegistroDocumento storage registro = registros[documentId];
        if (!registro.existe) revert DocumentoInexistente(documentId);
        return _statusEfetivo(registro);
    }

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

   
    function transferirVara(address novaVara) external onlyVara {
        if (novaVara == address(0)) revert EnderecoInvalido();
        vara = novaVara;
    }

    function _statusEfetivo(RegistroDocumento storage registro) private view returns (StatusDocumento) {
        if (registro.status == StatusDocumento.Valido && registro.expiraEm != 0 && block.timestamp > registro.expiraEm) {
            return StatusDocumento.Expirado;
        }
        return registro.status;
    }
}
