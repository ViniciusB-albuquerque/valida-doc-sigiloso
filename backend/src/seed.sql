-- Seed versionado da tabela `identidades` e dos dados off-chain de demo.
-- Roda automaticamente na inicializacao do backend (ver src/db.js) —
-- idempotente (CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE), seguro de
-- rodar toda vez que o servidor sobe.
--
-- Os enderecos de exemplo abaixo sao contas padrao do Hardhat. Eles existem
-- para demonstrar a validacao seletiva por perfil:
--   conta #1: Policia Federal
--   conta #2: Conselho Tutelar
--   conta #3: Companhia Aerea
--   conta #0: Vara da Infancia e Juventude
--
-- Substitua/complete com identidades reais quando for alem do ambiente de
-- desenvolvimento.

CREATE TABLE IF NOT EXISTS identidades (
  endereco TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  instituicao TEXT NOT NULL,
  perfil TEXT NOT NULL DEFAULT 'verificador'
);

-- INSERT OR IGNORE preserva cadastros ja existentes. Os UPDATEs abaixo
-- corrigem o perfil quando a base local veio de um seed antigo sem essa coluna.
INSERT OR IGNORE INTO identidades (endereco, nome, instituicao, perfil) VALUES
  ('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', 'Ana Silva', 'Policia Federal', 'policia_federal'),
  ('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', 'Carlos Souza', 'Conselho Tutelar', 'conselho_tutelar'),
  ('0x90f79bf6eb2c4f870365e785982e1f101e93b906', 'Marina Costa', 'Companhia Aerea', 'companhia_aerea'),
  ('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', 'Vara da Infancia e Juventude', 'TJPB', 'vara');

UPDATE identidades SET perfil = 'policia_federal' WHERE endereco = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
UPDATE identidades SET perfil = 'conselho_tutelar' WHERE endereco = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
UPDATE identidades SET perfil = 'companhia_aerea' WHERE endereco = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';
UPDATE identidades SET perfil = 'vara' WHERE endereco = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

-- Dados sensiveis ficam off-chain. A blockchain guarda apenas hash, emissor,
-- datas e status; esta tabela simula o banco protegido da Vara para a demo.
CREATE TABLE IF NOT EXISTS documentos_dados_offchain (
  documentId TEXT PRIMARY KEY,
  tipoDocumento TEXT NOT NULL,
  numeroControle TEXT NOT NULL,
  nomeCrianca TEXT NOT NULL,
  responsavelLegal TEXT NOT NULL,
  acompanhante TEXT,
  destino TEXT,
  periodoViagem TEXT,
  autorizacaoResumo TEXT NOT NULL,
  medidasProtecao TEXT,
  contatoInstitucional TEXT
);

-- Documentos de exemplo para demonstrar que o mesmo QR libera campos diferentes
-- conforme a carteira: PF, companhia aerea, Conselho Tutelar ou Vara.
INSERT OR IGNORE INTO documentos_dados_offchain (
  documentId,
  tipoDocumento,
  numeroControle,
  nomeCrianca,
  responsavelLegal,
  acompanhante,
  destino,
  periodoViagem,
  autorizacaoResumo,
  medidasProtecao,
  contatoInstitucional
) VALUES
  (
    '0xf84ef5cfdbfa0f44f9fbd9d7ded46e2ed2fda52b285057a0ef3075ad18500659',
    'Alvara de viagem',
    'VJ-2026-0001',
    'L. M. S.',
    'Maria Santos',
    'Joao Santos',
    'Lisboa, Portugal',
    '2026-09-10 a 2026-09-25',
    'Autorizada viagem internacional acompanhada pelo responsavel indicado.',
    'Nao ha medida restritiva ativa cadastrada para esta autorizacao.',
    'vara-infancia-demo@tjpb.jus.br'
  ),
  (
    '0x072d6147d78714af5e82ca2324fb92dc433681d232d30c5976a75857972505da',
    'Termo de guarda',
    'VJ-2026-0007',
    'R. A. P.',
    'Carlos Pereira',
    NULL,
    NULL,
    NULL,
    'Guarda provisoria concedida ao responsavel legal indicado.',
    'Acompanhamento pelo Conselho Tutelar por 90 dias.',
    'vara-infancia-demo@tjpb.jus.br'
  );
