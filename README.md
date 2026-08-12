# VerificaJus Sigilo — Projeto 2 (Documentos Sigilosos, Vara da Infância)

Entrega 1 (LAB 04 — Arquitetura e Primeiros Contratos) da disciplina
Aplicações e Tecnologias de Registro Distribuído (2026.1).

## Como rodar

```bash
npm install
npx hardhat compile
npx hardhat test
```

```bash
# Terminal 1
npx hardhat node

# Terminal 2
npx hardhat run scripts/deploy.js --network localhost

# Terminal 3
npx serve interface

# ciclo doc completo
npx hardhat run scripts/demo.js --network localhost
```