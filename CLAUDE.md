# lab-interpreter — Estado do Projeto

## Como retomar este projeto

Abra o Claude Code no diretório do projeto e diga:
> "Continuar o desenvolvimento do lab-interpreter. Leia o CLAUDE.md para contexto."

---

## Visão Geral

Aplicação web para análise de documentos médicos (laudos laboratoriais e de imagem).

**URL de produção:** https://drzacher.com  
**Branch de desenvolvimento:** `claude/analyze-vps-migration-FuYb0`  
**Repositório:** `lzacher/lab-interpreter`

## Stack

- **Frontend:** React + TypeScript + Vite + TailwindCSS + tRPC client
- **Backend:** Node.js + Express + tRPC + Auth.js (Google OAuth)
- **Banco:** MySQL (Hostinger) via Drizzle ORM
- **LLM:** Google Gemini 2.5 Flash (OCR + classificação + extração JSON)
- **Storage:** Filesystem local (`uploads/`) servido via Express static
- **Deploy:** PM2 na VPS Hostinger (Ubuntu 24.04), Traefik como reverse proxy

## Fluxo da aplicação

1. Login com Google OAuth
2. Upload de PDF/JPEG (até 10 arquivos)
3. Geração de thumbnails página por página
4. Classificação manual ou automática (Lab / Imagem / Indefinido)
5. OCR via Gemini Vision nas páginas selecionadas
6. Extração de dados estruturados em JSON
7. Apresentação dos resultados + exportação PDF

## VPS — Informações de acesso

- **IP:** 187.77.55.169
- **Usuário:** root
- **App:** `/var/www/lab-interpreter`
- **Logs:** `pm2 logs lab-interpreter`
- **Restart:** `pm2 restart lab-interpreter --update-env`

## VPS — Comandos úteis

```bash
# Ver status do app
pm2 status

# Ver logs em tempo real
pm2 logs lab-interpreter --lines 50

# Atualizar código e reiniciar
cd /var/www/lab-interpreter
git fetch origin && git reset --hard origin/claude/analyze-vps-migration-FuYb0
pnpm build
pm2 restart lab-interpreter --update-env

# Verificar variáveis de ambiente carregadas
pm2 env 0 | grep -E "LLM|DATABASE|GOOGLE|APP_URL"
```

## Variáveis de ambiente (.env na VPS)

Arquivo: `/var/www/lab-interpreter/.env`

| Variável | Descrição | Status |
|----------|-----------|--------|
| `DATABASE_URL` | MySQL Hostinger | ✅ Configurado |
| `JWT_SECRET` | Segredo da sessão | ✅ Configurado |
| `GOOGLE_CLIENT_ID` | OAuth Google | ✅ Configurado |
| `GOOGLE_CLIENT_SECRET` | OAuth Google | ✅ Configurado |
| `LLM_API_KEY` | Google Gemini (AI Studio) | ✅ Configurado |
| `LLM_API_URL` | Endpoint Gemini OpenAI-compat | ✅ Configurado |
| `APP_URL` | `https://drzacher.com` | ✅ Configurado |
| `CF_ACCOUNT_ID` | Cloudflare R2 (não usado) | ⬜ Não configurado |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 (não usado) | ⬜ Não configurado |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 (não usado) | ⬜ Não configurado |

## Infraestrutura Traefik

- Docker Compose: `/docker/traefik/docker-compose.yml`
- Config dinâmica: `/docker/traefik/dynamic/lab-interpreter.yml`
- Roteamento: `drzacher.com` → `localhost:3000`
- TLS: Let's Encrypt automático

## Tarefas pendentes / melhorias futuras

- [ ] Migrar storage para Cloudflare R2 (credenciais em `CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`)
- [ ] Resolver aviso "site suspeito" do Google Safe Browsing para drzacher.com
- [ ] Configurar `pm2 save` + `pm2 startup` para auto-iniciar após reboot da VPS
- [ ] Adicionar rate limiting nas chamadas ao Gemini (evitar quota exceeded)
- [ ] Remover variáveis VITE_ANALYTICS do index.html (warnings no build)

## Arquivos principais

```
server/
  _core/
    index.ts      — Express app, rotas, middleware
    context.ts    — tRPC context (autenticação)
    trpc.ts       — Procedures (public, protected, admin)
    env.ts        — Variáveis de ambiente
    llm.ts        — Cliente Gemini
  auth.ts         — Auth.js config (Google OAuth)
  storage.ts      — Armazenamento local (uploads/)
  classifier.ts   — Geração de thumbnails + OCR via Gemini
  jsonExtractor.ts — Extração de dados estruturados
  routers/
    documents.ts  — Upload, analyze, process, list
client/src/
  pages/
    Home.tsx      — Upload de arquivos
    Review.tsx    — Galeria de thumbnails + seleção
    Analysis.tsx  — Resultado exames laboratoriais
    ImagingResult.tsx — Resultado laudos de imagem
drizzle/
  schema.ts       — Schema do banco de dados
```

## Sessões anteriores

- **Sessão principal:** Migração completa de Manus → VPS Hostinger
  - Limpeza de 16 referências "manus" no código
  - Deploy na VPS com Traefik, PM2, MySQL
  - Correção OAuth Google (trust proxy, basePath)
  - Correção storage (local filesystem, sem R2)
  - Correção LLM (gemini-2.5-flash, chave válida)
  - **Resultado final:** Fluxo completo funcionando (upload → OCR → JSON → PDF)
