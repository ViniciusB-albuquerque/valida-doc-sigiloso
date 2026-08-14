# VerificaJus Sigilo

Idealizadora: **Ana Talita Ferreira Marinho**.

Plataforma de validação seletiva de documentos judiciais sigilosos por QR Code, hash de PDF, perfis institucionais e smart contract.

## O Que Cobre

- Registro on-chain de `documentId`, `documentHash`, emissor, emissão e expiração.
- Smart contract com estados: `Valido`, `Expirado`, `Revogado` e `Substituido`.
- QR Code dinâmico para `verificar.html?id=<documentId>`.
- Validação pública rápida via backend.
- Acesso detalhado com carteira cadastrada, assinatura sem gás e registro on-chain.
- Painel da Vara para emitir, buscar, auditar, revogar e substituir documentos.
- Visibilidade por perfil: Vara, Polícia Federal, companhia aérea e Conselho Tutelar.

## Como Rodar

Na raiz:

```bash
npm install
node node_modules/hardhat/internal/cli/cli.js compile
node node_modules/hardhat/internal/cli/cli.js test
```

Em terminais separados:

```bash
node node_modules/hardhat/internal/cli/cli.js node
node node_modules/hardhat/internal/cli/cli.js run scripts/etapa4-setup.js --network localhost
```

Configure `backend/.env` com o contrato impresso pelo setup:

```env
RPC_URL=http://127.0.0.1:8545
CONTRATO_ENDERECO=COLE_AQUI_O_CONTRATO
BACKEND_PRIVATE_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
JWT_SECRET=dev-secret
PORT=3001
```

Suba o backend:

```bash
cd backend
npm install
npm run dev
```

Acesse:

```text
http://localhost:3001/login.html
```

## Demonstração

Todos os logins usam a senha `senha123`.

- Vara: `juiz.exemplo@tjpb.jus.br`
- Polícia Federal: `pf.exemplo@dpf.gov.br`
- Companhia aérea: `aerea.exemplo@companhia.demo`
- Conselho Tutelar: `conselho.exemplo@ct.demo`

Carteiras Hardhat cadastradas:

- Vara: `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
- Polícia Federal: `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`
- Companhia aérea: `0x90f79bf6eb2c4f870365e785982e1f101e93b906`
- Conselho Tutelar: `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc`


<img width="1600" height="1040" alt="image" src="https://github.com/user-attachments/assets/453ffbf5-c447-4769-b7a5-79f9208f1e07" />
