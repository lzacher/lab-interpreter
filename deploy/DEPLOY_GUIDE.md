# Lab Interpreter — Guia de Implantação na VPS Hostinger

**VPS:** Ubuntu 24.04 | IP: `187.77.55.169` | Usuário: `root`  
**Domínio:** `labinterpreter.drzacher.com`  
**Infraestrutura:** Docker + Traefik (já instalados)

---

## Visão Geral da Arquitetura

O projeto roda como dois contêineres Docker integrados ao Traefik já existente na VPS:

| Contêiner | Imagem | Função |
|---|---|---|
| `lab-interpreter-app` | Build local do GitHub | Aplicação Node.js (porta 3000) |
| `lab-interpreter-db` | `mysql:8.0` | Banco de dados MySQL |

O Traefik gerencia automaticamente o SSL (Let's Encrypt) e o roteamento do subdomínio.

---

## Etapa 1 — Configurar o DNS

No painel da Hostinger, acesse **Domínios → drzacher.com → Gerenciar DNS** e adicione:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| `A` | `labinterpreter` | `187.77.55.169` | 300 |

Aguarde até 10 minutos para a propagação do DNS antes de prosseguir.

---

## Etapa 2 — Conectar à VPS via SSH

```bash
ssh root@187.77.55.169
```

---

## Etapa 3 — Clonar o Repositório

```bash
cd /opt
git clone https://github.com/lzacher/lab-interpreter.git
cd lab-interpreter
```

---

## Etapa 4 — Configurar as Variáveis de Ambiente

```bash
cd deploy
cp env.template .env
nano .env
```

Preencha os valores no arquivo `.env`:

```bash
# Banco de dados — escolha senhas fortes
MYSQL_ROOT_PASSWORD=MinhaS3nhaRoot!2024
MYSQL_DATABASE=lab_interpreter
MYSQL_USER=labuser
MYSQL_PASSWORD=MinhaS3nhaLab!2024

# Chave JWT — gere com o comando abaixo
JWT_SECRET=$(openssl rand -base64 64)
echo "JWT_SECRET gerado: $JWT_SECRET"
# Cole o valor gerado no .env

# Modos de operação (deixe como está)
AUTH_MODE=local
STORAGE_MODE=local
STORAGE_LOCAL_PATH=/app/uploads
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2
```

> **Importante:** Nunca compartilhe o arquivo `.env`. Ele contém senhas e chaves secretas.

---

## Etapa 5 — Verificar a Rede do Traefik

O Traefik já está rodando na sua VPS. Verifique o nome da rede que ele usa:

```bash
docker network ls | grep -i traefik
```

Se o nome for diferente de `traefik-net`, edite o arquivo `docker-compose.yml` e substitua `traefik-net` pelo nome correto. Caso a rede não exista:

```bash
docker network create traefik-net
```

---

## Etapa 6 — Verificar o Entrypoint do Traefik

O `docker-compose.yml` usa os entrypoints `web` (HTTP) e `websecure` (HTTPS). Confirme que o Traefik da sua VPS usa esses mesmos nomes:

```bash
docker exec traefik-traefik-1 traefik version 2>/dev/null
# Ou verifique o docker-compose do Traefik:
cat /opt/traefik/docker-compose.yml | grep entrypoints
```

Se os nomes forem diferentes (ex.: `http` e `https`), ajuste as labels no `docker-compose.yml` do lab-interpreter.

---

## Etapa 7 — Executar o Deploy

```bash
cd /opt/lab-interpreter/deploy
chmod +x deploy.sh
./deploy.sh
```

O script irá:
1. Verificar os pré-requisitos
2. Construir a imagem Docker da aplicação
3. Subir os contêineres (banco + aplicação)
4. Aguardar o banco ficar pronto
5. Executar as migrações do schema

---

## Etapa 8 — Aplicar as Migrações do Banco

Se as migrações não rodaram automaticamente no script, execute manualmente:

```bash
# Opção 1: via drizzle-kit (recomendado)
cd /opt/lab-interpreter
DATABASE_URL="mysql://labuser:SuaSenha@127.0.0.1:3306/lab_interpreter" \
  npx drizzle-kit push

# Opção 2: via MySQL direto
docker exec -it lab-interpreter-db mysql -u root -p lab_interpreter
# (cole as queries do arquivo drizzle/migrations/*.sql)
```

---

## Etapa 9 — Verificar o Deploy

```bash
# Status dos contêineres
docker ps | grep lab-interpreter

# Logs da aplicação
docker logs -f lab-interpreter-app

# Testar internamente
curl -I http://localhost:3000

# Testar via domínio (após DNS propagar)
curl -I https://labinterpreter.drzacher.com
```

---

## Comandos de Manutenção

```bash
# Atualizar para a versão mais recente do GitHub
cd /opt/lab-interpreter/deploy
./deploy.sh --update

# Reiniciar apenas a aplicação
docker restart lab-interpreter-app

# Ver logs em tempo real
docker logs -f lab-interpreter-app

# Acessar o banco de dados
docker exec -it lab-interpreter-db mysql -u labuser -p lab_interpreter

# Backup do banco de dados
docker exec lab-interpreter-db mysqldump -u root -p${MYSQL_ROOT_PASSWORD} lab_interpreter > backup_$(date +%Y%m%d).sql

# Parar tudo
cd /opt/lab-interpreter/deploy
docker compose -f docker-compose.yml down

# Parar e remover volumes (CUIDADO: apaga os dados!)
docker compose -f docker-compose.yml down -v
```

---

## Solução de Problemas

### Contêiner não sobe / erro de porta

```bash
docker logs lab-interpreter-app
# Verifique se a porta 3000 não está em uso por outro processo
```

### Erro de SSL / certificado não gerado

Verifique se o DNS já propagou e se o Traefik tem o `certresolver` configurado com o nome `letsencrypt`:

```bash
docker logs traefik-traefik-1 | grep -i "letsencrypt\|acme\|labinterpreter"
```

### Erro de conexão com o banco

```bash
# Verificar se o MySQL está saudável
docker inspect lab-interpreter-db | grep -A5 Health
# Testar conexão
docker exec lab-interpreter-db mysql -u labuser -p${MYSQL_PASSWORD} -e "SELECT 1"
```

### Aplicação retorna erro 502

O Traefik não consegue alcançar a aplicação. Verifique se ambos estão na mesma rede:

```bash
docker network inspect traefik-net | grep lab-interpreter
```

---

## Integração com Ollama (IA Local — Futura)

O Ollama já está rodando na sua VPS (`ollama-hdOv`). Quando for integrar a IA local ao lab-interpreter, o contêiner já consegue se comunicar com o Ollama via `http://ollama:11434` (se estiverem na mesma rede Docker) ou via `http://187.77.55.169:11434` (via IP da VPS).

Para adicionar o Ollama à mesma rede do lab-interpreter:

```bash
docker network connect lab-internal <nome_do_container_ollama>
```

---

## Estrutura dos Arquivos de Deploy

```
deploy/
├── docker-compose.yml   ← Definição dos serviços (app + banco)
├── env.template         ← Template das variáveis de ambiente
├── .env                 ← Suas variáveis (NÃO commitar no Git)
├── init.sql             ← Script SQL de inicialização do banco
├── entrypoint.sh        ← Aguarda MySQL, aplica migrações e inicia o servidor
├── deploy.sh            ← Script automatizado de deploy
└── DEPLOY_GUIDE.md      ← Este guia
```
