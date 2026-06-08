#!/bin/bash
# ─── Lab Interpreter — Diagnóstico do Ambiente Docker na VPS ─────────────────
# Execute na VPS com: bash diagnostico_vps.sh
# Não modifica nada — apenas lê e exibe informações do ambiente.

# ─── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

sep() { echo -e "${BLUE}────────────────────────────────────────────────────${NC}"; }
header() { echo ""; sep; echo -e "${BOLD}${CYAN}  $1${NC}"; sep; }

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   Diagnóstico Docker — VPS Hostinger                 ║${NC}"
echo -e "${BOLD}${GREEN}║   $(date '+%d/%m/%Y %H:%M:%S')                              ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"

# ─── 1. Contêineres em execução ───────────────────────────────────────────────
header "1. CONTÊINERES EM EXECUÇÃO"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
  echo -e "${RED}Docker não encontrado ou sem permissão.${NC}"

# ─── 2. Portas expostas pelos contêineres ─────────────────────────────────────
header "2. PORTAS EXPOSTAS PELOS CONTÊINERES (host:container)"
echo -e "${YELLOW}Portas mapeadas para o host (NÃO use estas portas para novos projetos):${NC}"
docker ps --format "{{.Names}}: {{.Ports}}" 2>/dev/null | grep -v "^$" | while IFS= read -r line; do
  if echo "$line" | grep -q "0.0.0.0\|::"; then
    echo -e "  ${RED}●${NC} $line"
  else
    echo -e "  ${GREEN}○${NC} $line  (apenas interno)"
  fi
done

echo ""
echo -e "${YELLOW}Portas do sistema em uso (ss/netstat):${NC}"
ss -tlnp 2>/dev/null | grep LISTEN | awk '{print $4}' | sort -t: -k2 -n | while read addr; do
  port=$(echo "$addr" | rev | cut -d: -f1 | rev)
  echo -e "  ${RED}●${NC} Porta $port ocupada ($addr)"
done | head -30

# ─── 3. Portas livres sugeridas ───────────────────────────────────────────────
header "3. PORTAS LIVRES SUGERIDAS PARA O LAB-INTERPRETER"
echo -e "${YELLOW}Verificando disponibilidade das portas candidatas...${NC}"
for port in 3001 3002 3003 4000 4001 8080 8081 8082 9000 9001; do
  if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
    echo -e "  ${RED}✗${NC} Porta $port — OCUPADA"
  else
    echo -e "  ${GREEN}✓${NC} Porta $port — LIVRE (pode usar)"
  fi
done

# ─── 4. Redes Docker ──────────────────────────────────────────────────────────
header "4. REDES DOCKER EXISTENTES"
docker network ls --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}" 2>/dev/null
echo ""
echo -e "${YELLOW}Contêineres por rede (para identificar a rede do Traefik):${NC}"
docker network ls -q 2>/dev/null | while read netid; do
  netname=$(docker network inspect "$netid" --format "{{.Name}}" 2>/dev/null)
  containers=$(docker network inspect "$netid" --format "{{range .Containers}}{{.Name}} {{end}}" 2>/dev/null | tr ' ' '\n' | grep -v "^$" | head -5 | tr '\n' ', ' | sed 's/,$//')
  if [ -n "$containers" ]; then
    echo -e "  ${CYAN}$netname${NC}: $containers"
  fi
done

# ─── 5. Identificar rede do Traefik ───────────────────────────────────────────
header "5. CONFIGURAÇÃO DO TRAEFIK"
traefik_container=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -i traefik | head -1)
if [ -n "$traefik_container" ]; then
  echo -e "${GREEN}✓ Traefik encontrado: $traefik_container${NC}"
  echo ""
  echo -e "${YELLOW}Redes do Traefik:${NC}"
  docker inspect "$traefik_container" --format "{{range \$k, \$v := .NetworkSettings.Networks}}  • {{\$k}}\n{{end}}" 2>/dev/null
  echo ""
  echo -e "${YELLOW}Entrypoints configurados (portas HTTP/HTTPS):${NC}"
  docker inspect "$traefik_container" --format "{{.Args}}" 2>/dev/null | tr ' ' '\n' | grep -i "entrypoint\|port\|web" | head -10
  echo ""
  echo -e "${YELLOW}Variáveis de ambiente relevantes:${NC}"
  docker inspect "$traefik_container" --format "{{range .Config.Env}}{{println .}}{{end}}" 2>/dev/null | grep -i "entrypoint\|cert\|acme\|email" | head -10
else
  echo -e "${RED}✗ Traefik não encontrado nos contêineres em execução.${NC}"
fi

# ─── 6. Ollama ────────────────────────────────────────────────────────────────
header "6. OLLAMA — IA LOCAL"
ollama_container=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -i ollama | grep -v webui | head -1)
if [ -n "$ollama_container" ]; then
  echo -e "${GREEN}✓ Ollama encontrado: $ollama_container${NC}"
  ollama_port=$(docker ps --format "{{.Names}}: {{.Ports}}" 2>/dev/null | grep -i ollama | grep -v webui)
  echo -e "  Portas: $ollama_port"
  ollama_nets=$(docker inspect "$ollama_container" --format "{{range \$k, \$v := .NetworkSettings.Networks}}{{\$k}} {{end}}" 2>/dev/null)
  echo -e "  Redes: $ollama_nets"
  echo ""
  echo -e "${YELLOW}Modelos disponíveis no Ollama:${NC}"
  docker exec "$ollama_container" ollama list 2>/dev/null || echo "  (não foi possível listar modelos)"
else
  echo -e "${YELLOW}○ Ollama não encontrado em execução.${NC}"
fi

# ─── 7. Volumes Docker ────────────────────────────────────────────────────────
header "7. VOLUMES DOCKER (dados persistentes)"
docker volume ls --format "table {{.Name}}\t{{.Driver}}" 2>/dev/null | head -20

# ─── 8. Recursos do sistema ───────────────────────────────────────────────────
header "8. RECURSOS DO SISTEMA"
echo -e "${YELLOW}CPU e Memória:${NC}"
echo -e "  CPUs: $(nproc)"
free -h | awk '/^Mem:/ {printf "  RAM: %s total, %s usada, %s livre\n", $2, $3, $4}'
df -h / | awk 'NR==2 {printf "  Disco (/): %s total, %s usado, %s livre (%s)\n", $2, $3, $4, $5}'

echo ""
echo -e "${YELLOW}Uso de memória por contêiner:${NC}"
docker stats --no-stream --format "  {{.Name}}: CPU {{.CPUPerc}} | MEM {{.MemUsage}}" 2>/dev/null | head -15

# ─── 9. Resumo e recomendações ────────────────────────────────────────────────
header "9. RESUMO — O QUE FAZER COM O LAB-INTERPRETER"
echo -e "${GREEN}Com base no diagnóstico acima:${NC}"
echo ""
echo -e "  ${BOLD}Para testes locais (sem Traefik):${NC}"
echo -e "  Use a primeira porta LIVRE listada na seção 3 acima."
echo -e "  Exemplo: http://187.77.55.169:3001"
echo ""
echo -e "  ${BOLD}Para produção (com Traefik):${NC}"
echo -e "  1. Use a rede do Traefik listada na seção 5"
echo -e "  2. NÃO exponha a porta 3000 para o host (deixe apenas interno)"
echo -e "  3. Adicione as labels do Traefik no docker-compose.yml"
echo ""
echo -e "  ${BOLD}Para usar o Ollama:${NC}"
echo -e "  Conecte o lab-interpreter à mesma rede do Ollama (seção 6)"
echo -e "  docker network connect <rede_ollama> lab-interpreter-app"
echo ""
sep
echo -e "${GREEN}  Diagnóstico concluído. Nenhuma alteração foi feita.${NC}"
sep
echo ""
