# VerificaJus Sigilo

Plataforma de validacao seletiva de documentos judiciais sigilosos por QR Code.

## O que ja cobre

- Registro on-chain de `documentId`, `documentHash`, emissor, data de emissao e expiracao.
- Smart contract com estados efetivos: `Valido`, `Expirado`, `Revogado`, `Substituido`.
- QR Code dinamico apontando para `interface/verificar.html?id=<documentId>`.
- Validacao publica rapida via backend: o leitor do QR ve se o documento e valido, expirado, revogado ou substituido.
- Acesso detalhado com carteira cadastrada, assinatura sem gas e registro on-chain do acesso.
- Filtragem off-chain por perfil:
  - `policia_federal`: `N3 - Validacao migratoria completa`, com dados de viagem, crianca/adolescente, responsavel e acompanhante.
  - `companhia_aerea`: `N2 - Conferencia operacional de embarque`, com dados operacionais de embarque e sem medidas protetivas.
  - `conselho_tutelar`: `N3 - Protecao e acompanhamento`, com dados de protecao/acompanhamento e sem destino quando nao pertinente.
  - `vara`: `N4 - Administracao integral`, com todos os metadados off-chain cadastrados.
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

O proprio backend serve a API e o front estatico. Acesse:

```text
http://localhost:3001/login
http://localhost:3001/painel
http://localhost:3001/verificar
```

Ainda e possivel servir `interface/` separadamente para testes, mas o fluxo integrado recomendado e abrir as telas pelo backend.

## Demo de perfis

Logins de demonstracao no painel, todos com senha `senha123`:

- Vara: `juiz.exemplo@tjpb.jus.br`
- Policia Federal: `pf.exemplo@dpf.gov.br`
- Companhia Aerea: `aerea.exemplo@companhia.demo`
- Conselho Tutelar: `conselho.exemplo@ct.demo`

Enderecos Hardhat cadastrados no seed:

- Policia Federal: `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`
- Conselho Tutelar: `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc`
- Companhia Aerea: `0x90f79bf6eb2c4f870365e785982e1f101e93b906`
- Vara: `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
