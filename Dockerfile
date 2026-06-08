# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Instalar dependências (incluindo devDependencies para o build)
RUN pnpm install --frozen-lockfile

# Copiar código fonte
COPY . .

# Build do frontend (Vite) e backend (esbuild)
RUN pnpm build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Instalar pnpm e dependências do sistema necessárias para pdfjs-dist e canvas
RUN npm install -g pnpm && \
    apk add --no-cache \
        cairo-dev \
        pango-dev \
        jpeg-dev \
        giflib-dev \
        librsvg-dev \
        python3 \
        make \
        g++

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Instalar apenas dependências de produção
RUN pnpm install --frozen-lockfile --prod

# Copiar artefatos do build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/shared ./shared

# Copiar entrypoint
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expor porta da aplicação
EXPOSE 3000

# Variável de ambiente de produção
ENV NODE_ENV=production

# Usar entrypoint que aguarda o banco e aplica migrações
ENTRYPOINT ["/entrypoint.sh"]
