# VerificaJus Sigilo

Plataforma de validacao seletiva de documentos judiciais sigilosos por QR Code.

## O que ja cobre

- Registro on-chain de `documentId`, `documentHash`, emissor, data de emissao e expiracao.
- Smart contract com estados efetivos: `Valido`, `Expirado`, `Revogado`, `Substituido`.
- QR Code dinamico apontando para `interface/verificar.html?id=<documentId>`.
- Validacao publica rapida via backend: o leitor do QR ve se o documento e valido, expirado, revogado ou substituido.
- Acesso detalhado com carteira cadastrada, assinatura sem gas e registro on-chain do acesso.
- Filtragem off-chain por perfil:
  - `policia_federal`: dados de viagem, crianca/adolescente, responsavel e acompanhante.
  - `companhia_aerea`: dados operacionais de embarque, sem medidas protetivas.
  - `conselho_tutelar`: dados de protecao/acompanhamento, sem destino quando nao pertinente.
- Painel administrativo da Vara para registrar e revogar documentos.

## Como rodar

```bash
npm install
node node_modules/hardhat/internal/cli/cli.js compile
node node_modules/hardhat/internal/cli/cli.js test
```

Em terminais separados:

```bash
node node_modules/hardhat/internal/cli/cli.js node
node node_modules/hardhat/internal/cli/cli.js run scripts/deploy.js --network localhost
```

Depois configure `backend/.env` a partir de `backend/.env.example`, instale as dependencias do backend e suba:

```bash
cd backend
npm install
npm run dev
```

Sirva a interface:

```bash
npx serve interface
```

## Demo de perfis

Enderecos Hardhat cadastrados no seed:

- Policia Federal: `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`
- Conselho Tutelar: `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc`
- Companhia Aerea: `0x90f79bf6eb2c4f870365e785982e1f101e93b906`
- Vara: `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
