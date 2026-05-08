# Guia de Migração: MedSuite — Plataforma Manus → VPS Hostinger

**Versão:** 1.0 — Maio 2026  
**Projeto:** MedSuite (Agente de Interpretação de Exames Laboratoriais e de Imagem)  
**Repositório:** `github.com/lzacher/medsuite`

---

## Visão Geral

O MedSuite foi desenvolvido sobre a plataforma Manus WebDev, que fornece um conjunto de serviços gerenciados: autenticação OAuth, armazenamento de arquivos (S3 proxy), banco de dados MySQL (TiDB), inferência de LLM e um runtime de hospedagem. Para executar o projeto de forma completamente independente em uma VPS Hostinger, cada um desses serviços precisa ser substituído por uma alternativa autogerenciada ou por um provedor de nuvem de terceiros.

Este guia detalha, camada por camada, quais integrações precisam ser substituídas, quais alternativas são recomendadas, e como realizar cada substituição no código.

---

## 1. Mapeamento das Integrações Manus

A tabela abaixo resume todas as dependências da plataforma Manus identificadas no projeto:

| Integração Manus | Arquivo(s) principal(is) | Variável de ambiente | Alternativa recomendada |
|---|---|---|---|
| **Autenticação OAuth** | `server/_core/sdk.ts`, `server/_core/oauth.ts` | `OAUTH_SERVER_URL`, `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL` | NextAuth.js / Auth.js com Google/GitHub OAuth |
| **LLM (inferência IA)** | `server/_core/llm.ts` | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | OpenAI API (GPT-4o) ou Groq API (gratuito) |
| **Armazenamento de arquivos** | `server/storage.ts` | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Cloudflare R2 (gratuito 10 GB) ou AWS S3 |
| **Banco de dados** | `drizzle/schema.ts`, `server/db.ts` | `DATABASE_URL` | MySQL 8 local na VPS ou PlanetScale (free tier) |
| **RAG (busca vetorial)** | `server/rag.ts` | `DATABASE_URL` | MySQL 8 com busca LIKE (já funciona sem vetor) |
| **Notificações ao dono** | `server/_core/notification.ts` | `BUILT_IN_FORGE_API_URL` | Nodemailer (SMTP) ou Resend API |
| **Runtime / hospedagem** | `vite-plugin-manus-runtime` | — | PM2 + Nginx na VPS |
| **JWT / sessão** | `server/_core/sdk.ts` | `JWT_SECRET` | Mantido igual (apenas gerar novo segredo) |

---

## 2. Pré-requisitos da VPS Hostinger

Antes de iniciar a migração, a VPS deve ter os seguintes componentes instalados:

```bash
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
npm install -g pnpm

# PM2 (gerenciador de processos)
npm install -g pm2

# MySQL 8
sudo apt-get install -y mysql-server
sudo mysql_secure_installation

# Nginx
sudo apt-get install -y nginx

# Certbot (SSL gratuito via Let's Encrypt)
sudo apt-get install -y certbot python3-certbot-nginx
```

A VPS Hostinger com plano **KVM 2** (2 vCPU, 8 GB RAM) ou superior é suficiente para uso clínico com até 20 usuários simultâneos.

---

## 3. Substituição 1: Autenticação OAuth

### Situação atual

O MedSuite usa o Manus OAuth como único provedor de autenticação. O fluxo depende de `OAUTH_SERVER_URL` (servidor proprietário Manus) e de um `VITE_APP_ID` registrado na plataforma.

### Alternativa recomendada: Auth.js (NextAuth.js v5) com Google OAuth

Auth.js é uma biblioteca de autenticação open-source amplamente adotada, compatível com Express e React. Ela suporta Google, GitHub, Microsoft, e-mail mágico, entre outros provedores.

**Passo 1 — Instalar Auth.js:**

```bash
pnpm add @auth/express @auth/core
```

**Passo 2 — Criar `server/auth.ts`** (substitui `server/_core/sdk.ts` e `server/_core/oauth.ts`):

```typescript
import { ExpressAuth } from "@auth/express";
import Google from "@auth/express/providers/google";

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.JWT_SECRET,
  callbacks: {
    async session({ session, token }) {
      // Mapeia o ID do Google para o campo openId usado no projeto
      if (session.user) {
        (session.user as any).openId = token.sub;
      }
      return session;
    },
  },
};

export const authHandler = ExpressAuth(authConfig);
```

**Passo 3 — Registrar no `server/index.ts`:**

```typescript
import { authHandler } from "./auth";
app.use("/api/auth/*", authHandler);
```

**Passo 4 — Adaptar `server/_core/context.ts`** para ler a sessão do Auth.js em vez do JWT Manus:

```typescript
import { getSession } from "@auth/express";
import { authConfig } from "../auth";

export async function createContext({ req, res }: { req: Request; res: Response }) {
  const session = await getSession(req, authConfig);
  const user = session?.user ? await db.getUserByOpenId((session.user as any).openId) : null;
  return { req, res, user };
}
```

**Passo 5 — Variáveis de ambiente necessárias:**

```env
GOOGLE_CLIENT_ID=seu_client_id_aqui
GOOGLE_CLIENT_SECRET=seu_client_secret_aqui
JWT_SECRET=uma_string_aleatoria_longa_e_segura
```

> **Como obter as credenciais Google:** Acesse [console.cloud.google.com](https://console.cloud.google.com), crie um projeto, ative a API "Google Identity", e em "Credenciais" crie um OAuth 2.0 Client ID com o redirect URI `https://seudominio.com/api/auth/callback/google`.

**Passo 6 — Atualizar o frontend** (`client/src/const.ts` e `client/src/_core/hooks/useAuth.ts`) para usar os endpoints do Auth.js (`/api/auth/signin`, `/api/auth/session`) em vez dos endpoints Manus.

---

## 4. Substituição 2: LLM (Inferência de Inteligência Artificial)

### Situação atual

O arquivo `server/_core/llm.ts` envia requisições para `${BUILT_IN_FORGE_API_URL}/v1/chat/completions` com autenticação Bearer. A interface já é compatível com o padrão OpenAI.

### Alternativa recomendada: OpenAI API ou Groq API

Como o código já usa o formato OpenAI (`/v1/chat/completions`), a substituição é mínima — basta alterar a URL base e a chave de API.

**Opção A — OpenAI (GPT-4o):** Custo aproximado de US$ 0,01–0,03 por análise de laudo (dependendo do tamanho). Recomendado para uso clínico pela qualidade das respostas.

**Opção B — Groq API (gratuito):** Oferece modelos como `llama-3.3-70b-versatile` com 14.400 requisições/dia gratuitas. Ideal para começar sem custo.

**Alteração no `server/_core/llm.ts`** (apenas 2 linhas):

```typescript
// Antes (Manus):
const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

// Depois (OpenAI ou Groq):
const resolveApiUrl = () => process.env.LLM_API_URL ?? "https://api.openai.com/v1/chat/completions";
```

**Alteração no `server/_core/env.ts`:**

```typescript
export const ENV = {
  // ... campos existentes ...
  llmApiUrl: process.env.LLM_API_URL ?? "https://api.openai.com/v1/chat/completions",
  llmApiKey: process.env.LLM_API_KEY ?? "",
};
```

**Atualizar os headers em `server/_core/llm.ts`:**

```typescript
headers: {
  "content-type": "application/json",
  authorization: `Bearer ${ENV.llmApiKey}`,
},
```

**Variáveis de ambiente:**

```env
# Para OpenAI:
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=sk-...

# Para Groq (gratuito):
LLM_API_URL=https://api.groq.com/openai/v1/chat/completions
LLM_API_KEY=gsk_...
```

**Adicionar o modelo explicitamente** nos payloads do `server/jsonExtractor.ts` e `server/routers.ts`, pois o Manus selecionava o modelo automaticamente:

```typescript
// Em cada chamada invokeLLM, adicionar o campo model:
const response = await invokeLLM({
  model: "gpt-4o",  // ou "llama-3.3-70b-versatile" para Groq
  messages: [...],
});
```

---

## 5. Substituição 3: Armazenamento de Arquivos (S3)

### Situação atual

O `server/storage.ts` usa um proxy proprietário Manus (`/v1/storage/upload` e `/v1/storage/downloadUrl`) que internamente faz upload para um bucket S3 gerenciado pela plataforma.

### Alternativa recomendada: Cloudflare R2

O Cloudflare R2 oferece 10 GB de armazenamento gratuito por mês e é compatível com a API AWS S3. O projeto já tem `@aws-sdk/client-s3` instalado como dependência.

**Passo 1 — Criar bucket no Cloudflare R2:**

Acesse [dash.cloudflare.com](https://dash.cloudflare.com), vá em **R2 Object Storage**, crie um bucket chamado `medsuite-docs`, e gere um par de chaves de API R2 (Access Key ID + Secret Access Key).

**Passo 2 — Reescrever `server/storage.ts`:**

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? "medsuite-docs";

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: data as Buffer,
    ContentType: contentType,
  }));
  // URL pública (configure o bucket como público no R2 ou use presigned URL)
  const url = `https://pub-${process.env.CF_ACCOUNT_ID}.r2.dev/${key}`;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 }
  );
  return { key, url };
}
```

**Variáveis de ambiente:**

```env
CF_ACCOUNT_ID=seu_account_id_cloudflare
R2_ACCESS_KEY_ID=sua_access_key
R2_SECRET_ACCESS_KEY=sua_secret_key
R2_BUCKET_NAME=medsuite-docs
```

---

## 6. Substituição 4: Banco de Dados

### Situação atual

O projeto usa MySQL/TiDB via `DATABASE_URL`. O Drizzle ORM é o ORM utilizado, e o schema está em `drizzle/schema.ts`.

### Alternativa: MySQL 8 local na VPS

Como o Drizzle ORM é agnóstico ao provedor, basta instalar o MySQL 8 na VPS e apontar a `DATABASE_URL` para o banco local.

**Criar o banco e usuário:**

```sql
CREATE DATABASE medsuite CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'medsuite_user'@'localhost' IDENTIFIED BY 'senha_forte_aqui';
GRANT ALL PRIVILEGES ON medsuite.* TO 'medsuite_user'@'localhost';
FLUSH PRIVILEGES;
```

**Variável de ambiente:**

```env
DATABASE_URL=mysql://medsuite_user:senha_forte_aqui@localhost:3306/medsuite
```

**Aplicar as migrações:**

```bash
cd /var/www/medsuite
pnpm drizzle-kit generate
# Copiar o SQL gerado e executar no MySQL:
mysql -u medsuite_user -p medsuite < drizzle/migrations/0000_initial.sql
```

> **Nota sobre o RAG:** O módulo `server/rag.ts` já usa busca por palavras-chave (LIKE) em vez de busca vetorial, portanto funciona nativamente com qualquer MySQL 8 sem extensões adicionais. Os dados da base de conhecimento (tabela `knowledge_base`) precisam ser exportados do banco Manus e importados no banco local.

**Exportar dados do banco Manus** (via painel Database do Manus → botão de exportação) e importar:

```bash
mysql -u medsuite_user -p medsuite < knowledge_base_export.sql
```

---

## 7. Substituição 5: Notificações ao Proprietário

### Situação atual

O `server/_core/notification.ts` usa o endpoint interno Manus para enviar notificações push ao dono do projeto.

### Alternativa: Nodemailer com SMTP

```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

**Reescrever `server/_core/notification.ts`:**

```typescript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT ?? "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function notifyOwner({ title, content }: { title: string; content: string }): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: `"MedSuite" <${process.env.SMTP_USER}>`,
      to: process.env.OWNER_EMAIL,
      subject: title,
      text: content,
    });
    return true;
  } catch (error) {
    console.error("[notification] Email failed:", error);
    return false;
  }
}
```

**Variáveis de ambiente:**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_de_app_gmail
OWNER_EMAIL=seu_email@gmail.com
```

> Para Gmail, use uma **Senha de App** (não a senha da conta). Acesse Conta Google → Segurança → Verificação em duas etapas → Senhas de app.

---

## 8. Configuração do Ambiente de Produção na VPS

### 8.1 Clonar o repositório e instalar dependências

```bash
cd /var/www
git clone https://github.com/lzacher/medsuite.git
cd medsuite
pnpm install
```

### 8.2 Criar o arquivo `.env`

Crie `/var/www/medsuite/.env` com todas as variáveis:

```env
# Banco de dados
DATABASE_URL=mysql://medsuite_user:senha@localhost:3306/medsuite

# Autenticação
JWT_SECRET=string_aleatoria_de_64_caracteres
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# LLM
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=sk-...

# Storage (Cloudflare R2)
CF_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=medsuite-docs

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu@email.com
SMTP_PASS=senha_de_app
OWNER_EMAIL=seu@email.com

# Configurações da aplicação
NODE_ENV=production
VITE_APP_TITLE=MedSuite
```

### 8.3 Build da aplicação

```bash
cd /var/www/medsuite
pnpm build
```

### 8.4 Configurar PM2

```bash
pm2 start dist/server/index.js --name medsuite --env production
pm2 save
pm2 startup  # Configura o PM2 para iniciar com o sistema
```

### 8.5 Configurar Nginx como proxy reverso

Crie `/etc/nginx/sites-available/medsuite`:

```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    # Redirecionar HTTP → HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name seudominio.com www.seudominio.com;

    ssl_certificate /etc/letsencrypt/live/seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seudominio.com/privkey.pem;

    # Limite de tamanho para upload de PDFs
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;  # Necessário para OCR de PDFs longos
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/medsuite /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL gratuito via Let's Encrypt
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

---

## 9. Remoção da Dependência do Plugin Manus Runtime

O `vite-plugin-manus-runtime` é um plugin Vite proprietário da plataforma Manus. Ele precisa ser removido do `vite.config.ts`:

```typescript
// Antes:
import manusRuntime from "vite-plugin-manus-runtime";
plugins: [react(), manusRuntime()],

// Depois:
plugins: [react()],
```

Remover também do `package.json`:

```bash
pnpm remove vite-plugin-manus-runtime
```

---

## 10. Resumo das Variáveis de Ambiente

| Variável | Origem Manus | Substituto | Obrigatória |
|---|---|---|---|
| `DATABASE_URL` | TiDB gerenciado | MySQL local | Sim |
| `JWT_SECRET` | Gerado pela plataforma | Gerar manualmente | Sim |
| `OAUTH_SERVER_URL` | Servidor Manus | Remover (Auth.js não usa) | Não |
| `VITE_APP_ID` | ID do app Manus | Remover | Não |
| `VITE_OAUTH_PORTAL_URL` | Portal Manus | Remover | Não |
| `BUILT_IN_FORGE_API_URL` | API Manus | Remover | Não |
| `BUILT_IN_FORGE_API_KEY` | Chave Manus | Remover | Não |
| `GOOGLE_CLIENT_ID` | — | Google Cloud Console | Sim |
| `GOOGLE_CLIENT_SECRET` | — | Google Cloud Console | Sim |
| `LLM_API_KEY` | — | OpenAI ou Groq | Sim |
| `LLM_API_URL` | — | URL do provedor LLM | Sim |
| `CF_ACCOUNT_ID` | — | Cloudflare Dashboard | Sim |
| `R2_ACCESS_KEY_ID` | — | Cloudflare R2 | Sim |
| `R2_SECRET_ACCESS_KEY` | — | Cloudflare R2 | Sim |
| `SMTP_HOST` | — | Provedor SMTP | Sim |
| `SMTP_USER` / `SMTP_PASS` | — | Conta de e-mail | Sim |

---

## 11. Estimativa de Custos Mensais na VPS

| Serviço | Plano | Custo estimado |
|---|---|---|
| VPS Hostinger KVM 2 | 2 vCPU, 8 GB RAM | ~US$ 10–15/mês |
| Cloudflare R2 | Até 10 GB grátis | US$ 0 |
| Groq API (LLM) | 14.400 req/dia grátis | US$ 0 |
| OpenAI GPT-4o (alternativa) | ~100 análises/mês | ~US$ 2–5/mês |
| Let's Encrypt (SSL) | Gratuito | US$ 0 |
| **Total estimado** | | **~US$ 10–20/mês** |

---

## 12. Checklist de Migração

- [ ] VPS provisionada com Node.js 22, MySQL 8, Nginx, PM2
- [ ] Repositório clonado em `/var/www/medsuite`
- [ ] `server/storage.ts` reescrito para Cloudflare R2
- [ ] `server/_core/llm.ts` atualizado para OpenAI/Groq
- [ ] `server/_core/notification.ts` reescrito para Nodemailer
- [ ] Autenticação OAuth migrada para Auth.js + Google
- [ ] `server/_core/context.ts` adaptado para Auth.js
- [ ] `client/src/const.ts` e `useAuth.ts` atualizados para Auth.js
- [ ] `vite-plugin-manus-runtime` removido do `vite.config.ts`
- [ ] Banco de dados MySQL criado e migrações aplicadas
- [ ] Dados da `knowledge_base` exportados do Manus e importados
- [ ] Arquivo `.env` criado com todas as variáveis
- [ ] `pnpm build` executado sem erros
- [ ] PM2 configurado e iniciado
- [ ] Nginx configurado como proxy reverso
- [ ] SSL configurado via Let's Encrypt
- [ ] Teste de upload de PDF e análise de laudo
- [ ] Teste de exportação de PDF (lab e imagem)
- [ ] Teste de login via Google OAuth

---

*Documento gerado por Manus AI — Maio 2026*
