# VerificaJus Sigilo

Plataforma de validacao seletiva de documentos judiciais sigilosos por QR Code.

## O que cobre

- Registro on-chain de `documentId`, `documentHash`, emissor, data de emissao e expiracao.
- Smart contract com estados efetivos: `Valido`, `Expirado`, `Revogado`, `Substituido`.
- QR Code dinamico apontando para `verificar.html?id=<documentId>`.
- Validacao publica rapida via backend: o leitor ve se o documento e valido, expirado, revogado ou substituido.
- Acesso detalhado com carteira cadastrada, assinatura sem gas e registro on-chain do acesso.
- Painel administrativo da Vara para emitir, buscar, auditar, revogar e substituir documentos.
- Frontend institucional integrado ao backend Express, usando o layout e padrao de cores da branch `base-frontend`.

## Perfis e visibilidade

- `vara`: `N4 - Administracao integral`, com todos os metadados off-chain cadastrados.
- `policia_federal`: `N3 - Validacao migratoria completa`, com dados de viagem, crianca/adolescente, responsavel e acompanhante.
- `companhia_aerea`: `N2 - Conferencia operacional de embarque`, com dados operacionais de embarque e sem medidas protetivas.
- `conselho_tutelar`: `N3 - Protecao e acompanhamento`, com dados de protecao/acompanhamento e sem destino quando nao pertinente.

## Como rodar

Na raiz do projeto:

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
<<<<<<< HEAD
<img width="1600" height="1040" alt="image" src="https://github.com/user-attachments/assets/f2aef1da-660c-46a8-ab5a-3fa6e1963362" />
=======

Configure `backend/.env` a partir de `backend/.env.example`. Use o endereco de contrato impresso pelo setup e a chave privada do backend de demo:

```env
RPC_URL=http://127.0.0.1:8545
CONTRATO_ENDERECO=COLE_AQUI_O_CONTRATO
BACKEND_PRIVATE_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
JWT_SECRET=dev-secret
PORT=3001
```

Depois suba o backend:

```bash
cd backend
npm install
npm run dev
```

O proprio backend serve API e frontend. Acesse:

```text
http://localhost:3001/login.html
```

## Logins de demonstracao

Todos usam a senha `senha123`:

- Vara: `juiz.exemplo@tjpb.jus.br`
- Policia Federal: `pf.exemplo@dpf.gov.br`
- Companhia Aerea: `aerea.exemplo@companhia.demo`
- Conselho Tutelar: `conselho.exemplo@ct.demo`

## Carteiras Hardhat cadastradas

- Policia Federal: `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`
- Conselho Tutelar: `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc`
- Companhia Aerea: `0x90f79bf6eb2c4f870365e785982e1f101e93b906`
- Vara: `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
>>>>>>> adequacao
