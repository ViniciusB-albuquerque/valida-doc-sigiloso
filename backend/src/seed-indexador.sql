-- Schema das tabelas do indexador de eventos (Etapa 4). Mantido SEPARADO de
-- seed.sql (que semeia dados de `identidades`) porque aqui é só DDL de tabelas
-- alimentadas em tempo de execução pelo indexador (src/indexador.js) — não há
-- dado "semente" para inserir. db.js carrega os dois arquivos na subida.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, e o indexador usa INSERT OR IGNORE /
-- INSERT OR REPLACE — reprocessar o mesmo bloco não duplica linha nem quebra.

CREATE TABLE IF NOT EXISTS documentos_indexados (
  documentId TEXT PRIMARY KEY,
  documentHash TEXT NOT NULL,
  emissor TEXT NOT NULL,
  emitidoEm INTEGER NOT NULL,
  expiraEm INTEGER NOT NULL,
  blockNumber INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS substituicoes_indexadas (
  documentIdAntigo TEXT NOT NULL,
  documentIdNovo TEXT NOT NULL,
  responsavel TEXT NOT NULL,
  quando INTEGER NOT NULL,
  blockNumber INTEGER NOT NULL,
  PRIMARY KEY (documentIdAntigo, documentIdNovo)
);

CREATE TABLE IF NOT EXISTS indexador_estado (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
