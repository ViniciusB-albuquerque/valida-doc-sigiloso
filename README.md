# VerificaJus Sigilo — Projeto 2 (Documentos Sigilosos, Vara da Infância)

Disciplina Aplicações e Tecnologias de Registro Distribuído (2026.1).

> Este README substitui a versão da Entrega 1 — o projeto cresceu bastante
> desde então (contrato + backend + indexador de eventos + login + painel +
> busca). Detalhes de arquitetura e decisões de design estão em
> `docs/05-fluxo-e-plano.md`.

## Visão geral do que roda

| Peça | O quê | Onde |
|---|---|---|
| Contrato | `DocumentoSigilosoRegistry.sol` | `contracts/` |
| Rede local de teste | Hardhat Node | — |
| Backend | API Node/Express (login, busca, verificação, indexador) | `backend/` |
| Frontend | Páginas HTML estáticas | `interface/` |

## Pré-requisitos

- Node.js e npm instalados.
- Nada de Docker/Besu necessário pra rodar localmente — isso só entra na
  hora de publicar numa rede real (ver seção final).

## Como rodar (primeira vez)

### 1. Instalar dependências — duas pastas, dois `package.json`

```bash
npm install               # raiz do projeto (Hardhat, contrato, testes)
cd backend && npm install && cd ..
```

### 2. Compilar e testar o contrato

```bash
npx hardhat compile
npx hardhat test          # deve dar 23 passing
```

### 3. Subir a rede local (deixe rodando, terminal próprio)

```bash
npx hardhat node
```

### 4. Implantar o contrato (outro terminal)

```bash
npx hardhat run scripts/deploy.js --network localhost
```

Anota o endereço impresso — você vai usar no próximo passo.

### 5. Configurar o backend

```bash
cd backend
cp .env.example .env
```

Edita `backend/.env`:
- `CONTRATO_ENDERECO` → o endereço do passo 4
- `BACKEND_PRIVATE_KEY` → qualquer chave de teste (ex.: uma das contas
  impressas pelo `npx hardhat node`) — nunca uma chave com valor real
- `JWT_SECRET` → gere um valor de verdade:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `RPC_URL` e `PORT` já vêm certos por padrão, não precisa mexer

### 6. Autorizar e financiar o backend no contrato

```bash
cd ..   # de volta pra raiz do projeto
npx hardhat run scripts/configurar-backend.js --network localhost
```

Esse script lê `backend/.env` sozinho, autoriza o endereço do backend a
chamar `registrarAcesso` no contrato, e garante que ele tenha saldo pra
pagar gas. Pode rodar quantas vezes quiser — se já estiver tudo certo, ele
só confirma e não faz nada de novo.

### 7. Subir o backend (deixe rodando, terminal próprio)

```bash
cd backend
npm start
```

Confirma que subiu certo:
```bash
curl http://localhost:3001/api/saude
```

### 8. Servir a interface (outro terminal)

```bash
npx serve interface
```

### 9. Acessar

Abre `http://localhost:3000/login.html`.

Conta de exemplo já pronta pra testar:
- **email:** `juiz.exemplo@tjpb.jus.br`
- **senha:** `senha123`

## Como rodar (depois da primeira vez / dia a dia)

Só os passos 3, 4, 6, 7 e 8 mudam a cada sessão (o resto — instalar
dependências, compilar, configurar `.env` — só precisa ser feito uma vez,
a menos que o contrato mude):

```bash
# Terminal 1
npx hardhat node

# Terminal 2 (depois que o Terminal 1 subir)
npx hardhat run scripts/deploy.js --network localhost
# copia o endereço novo pra CONTRATO_ENDERECO em backend/.env
npx hardhat run scripts/configurar-backend.js --network localhost

# Terminal 3
cd backend && npm start

# Terminal 4
npx serve interface
```

> **Por que precisa reimplantar toda vez?** O Hardhat local não guarda
> estado entre reinicializações — cada `npx hardhat node` novo é uma
> blockchain zerada. Por isso o endereço do contrato muda a cada sessão, e
> o `.env` precisa ser atualizado antes de subir o backend.

## Estrutura de pastas

```
contracts/     — o smart contract
test/          — testes Hardhat (Mocha/Chai)
scripts/       — deploy, configuração do backend
interface/     — login.html, painel.html, index.html (Vara),
                 buscar.html, verificar.html (pública), util.js
backend/       — API Node/Express (projeto próprio, com seu package.json)
docs/          — arquitetura, decisões de produto, plano de etapas
```

## Rodando os testes automatizados do contrato

```bash
npx hardhat test
```

## Publicando na rede da disciplina (Besu) — quando chegar a hora

Ainda não é o caso agora (ambiente local é suficiente pro desenvolvimento
e para demos), mas quando for a hora:

1. Clonar e subir a rede do professor: https://github.com/ccufcg/bc101-dev-env
2. Parar o Hardhat local antes (os dois brigam pela porta 8545)
3. `npx hardhat run scripts/deploy.js --network besu`
4. Atualizar `backend/.env` com o novo `CONTRATO_ENDERECO`
5. `npx hardhat run scripts/configurar-backend.js --network besu`
6. **Editar à mão** as constantes `RPC_URL` e `CONTRATO_ENDERECO` dentro do
   `<script>` de `interface/verificar.html` — essas duas, por segurança
   (ver `docs/05-fluxo-e-plano.md` § 3.8), não são mais configuráveis por
   fora, só direto no código da página pública.
