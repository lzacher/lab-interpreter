#!/bin/bash
# ─── Lab Interpreter — Script de Deploy na VPS Hostinger ─────────────────────
# Uso: ./deploy.sh [--update]
#   Sem argumentos: primeira instalação completa
#   --update: atualiza apenas a imagem da aplicação (sem recriar o banco)
#
# Pré-requisitos:
#   - Docker e Docker Compose instalados
#   - Traefik rodando na rede "traefik-net"
#   - Arquivo .env preenchido (copie de env.template)
#   - Subdomínio labinterpreter.drzacher.com apontando para 187.77.55.169

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOY_DIR="$SCRIPT_DIR"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE="$DEPLOY_DIR/.env"
GITHUB_IMAGE="ghcr.io/lzacher/lab-interpreter:latest"

# ─── Cores para output ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── Verificações iniciais ────────────────────────────────────────────────────
check_requirements() {
  log_info "Verificando pré-requisitos..."

  command -v docker >/dev/null 2>&1 || log_error "Docker não encontrado. Instale com: curl -fsSL https://get.docker.com | sh"
  command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1 || log_error "Docker Compose não encontrado."

  if [ ! -f "$ENV_FILE" ]; then
    log_error "Arquivo .env não encontrado em $DEPLOY_DIR. Copie env.template para .env e preencha os valores."
  fi

  # Verificar variáveis obrigatórias
  source "$ENV_FILE"
  [ -z "$MYSQL_ROOT_PASSWORD" ] && log_error "MYSQL_ROOT_PASSWORD não definida no .env"
  [ -z "$MYSQL_PASSWORD" ]      && log_error "MYSQL_PASSWORD não definida no .env"
  [ -z "$JWT_SECRET" ]          && log_error "JWT_SECRET não definida no .env"

  log_success "Pré-requisitos OK"
}

# ─── Rede Traefik ─────────────────────────────────────────────────────────────
ensure_traefik_network() {
  log_info "Verificando rede traefik-net..."
  if ! docker network inspect traefik-net >/dev/null 2>&1; then
    log_warn "Rede traefik-net não encontrada. Criando..."
    docker network create traefik-net
    log_success "Rede traefik-net criada"
  else
    log_success "Rede traefik-net já existe"
  fi
}

# ─── Build da imagem ──────────────────────────────────────────────────────────
build_image() {
  log_info "Construindo imagem Docker do lab-interpreter..."
  cd "$PROJECT_DIR"
  docker build -t "$GITHUB_IMAGE" -f Dockerfile .
  log_success "Imagem construída: $GITHUB_IMAGE"
}

# ─── Deploy completo (primeira instalação) ────────────────────────────────────
deploy_full() {
  log_info "Iniciando deploy completo..."

  ensure_traefik_network
  build_image

  cd "$DEPLOY_DIR"
  log_info "Subindo contêineres..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

  log_info "Aguardando banco de dados ficar pronto..."
  sleep 15

  log_info "Executando migrações do banco de dados..."
  docker exec lab-interpreter-app node -e "
    const { drizzle } = require('drizzle-orm/mysql2');
    const mysql = require('mysql2/promise');
    const { migrate } = require('drizzle-orm/mysql2/migrator');
    (async () => {
      const conn = await mysql.createConnection(process.env.DATABASE_URL);
      const db = drizzle(conn);
      await migrate(db, { migrationsFolder: './drizzle' });
      await conn.end();
      console.log('Migrações aplicadas com sucesso!');
    })().catch(e => { console.error(e); process.exit(1); });
  " 2>/dev/null || run_drizzle_migrate

  log_success "Deploy completo finalizado!"
  show_status
}

# ─── Migração via drizzle-kit ─────────────────────────────────────────────────
run_drizzle_migrate() {
  log_info "Executando migrações via drizzle-kit..."
  cd "$PROJECT_DIR"
  # Exportar DATABASE_URL para o ambiente local temporariamente
  source "$ENV_FILE"
  export DATABASE_URL="mysql://${MYSQL_USER:-labuser}:${MYSQL_PASSWORD}@127.0.0.1:3306/${MYSQL_DATABASE:-lab_interpreter}"
  npx drizzle-kit push 2>/dev/null || log_warn "Migração automática falhou. Execute manualmente: docker exec -it lab-interpreter-db mysql -u root -p"
}

# ─── Atualização (sem recriar banco) ─────────────────────────────────────────
deploy_update() {
  log_info "Atualizando aplicação (mantendo banco de dados)..."

  # Baixar código mais recente
  cd "$PROJECT_DIR"
  git pull origin main

  # Rebuild apenas da aplicação
  build_image

  cd "$DEPLOY_DIR"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps --build lab-app

  log_success "Atualização concluída!"
  show_status
}

# ─── Status ───────────────────────────────────────────────────────────────────
show_status() {
  echo ""
  echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Lab Interpreter — Status do Deploy${NC}"
  echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
  echo ""
  echo -e "  ${BLUE}URL:${NC} https://labinterpreter.drzacher.com"
  echo -e "  ${BLUE}Logs:${NC} docker logs -f lab-interpreter-app"
  echo -e "  ${BLUE}DB:${NC}   docker exec -it lab-interpreter-db mysql -u labuser -p lab_interpreter"
  echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║   Lab Interpreter — Deploy Script v1.0           ║${NC}"
  echo -e "${BLUE}║   VPS: 187.77.55.169 (Ubuntu 24.04)              ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
  echo ""

  check_requirements

  if [ "$1" == "--update" ]; then
    deploy_update
  else
    deploy_full
  fi
}

main "$@"
