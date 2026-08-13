-- Seed versionado da tabela `identidades`. Roda automaticamente na
-- inicialização do backend (ver src/db.js) — idempotente (INSERT OR IGNORE),
-- seguro de rodar toda vez que o servidor sobe.
--
-- Os dois endereços de exemplo abaixo são as contas #1 e #2 padrão do
-- Hardhat (as mesmas já usadas nos testes do contrato, ex.: "atendente1" e
-- "atendente2" do cenário do aeroporto) — só pra ter algo pronto pra testar
-- localmente. Substitua/complete com identidades reais quando for além do
-- ambiente de desenvolvimento.

CREATE TABLE IF NOT EXISTS identidades (
  endereco TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  instituicao TEXT NOT NULL
);

INSERT OR IGNORE INTO identidades (endereco, nome, instituicao) VALUES
  ('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', 'Ana Silva', 'Polícia Federal'),
  ('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', 'Carlos Souza', 'Conselho Tutelar'),
  ('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', 'Vara da Infância e Juventude', 'TJPB');
