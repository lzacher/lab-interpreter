#!/bin/sh
# ─── Lab Interpreter — Entrypoint do Container ───────────────────────────────
# Aguarda o MySQL ficar disponível, aplica migrações e inicia o servidor.

set -e

echo "[entrypoint] Iniciando Lab Interpreter..."

# ─── Aguardar MySQL ───────────────────────────────────────────────────────────
MAX_RETRIES=30
RETRY_INTERVAL=2
count=0

echo "[entrypoint] Aguardando banco de dados MySQL..."

# Extrair host e porta do DATABASE_URL
# Formato: mysql://user:pass@host:port/dbname
DB_HOST=$(echo "$DATABASE_URL" | sed 's|mysql://[^@]*@||' | sed 's|:.*||' | sed 's|/.*||')
DB_PORT=$(echo "$DATABASE_URL" | sed 's|mysql://[^@]*@[^:]*:||' | sed 's|/.*||')
DB_PORT=${DB_PORT:-3306}

until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  count=$((count + 1))
  if [ $count -ge $MAX_RETRIES ]; then
    echo "[entrypoint] ERRO: MySQL ($DB_HOST:$DB_PORT) não ficou disponível após ${MAX_RETRIES} tentativas."
    exit 1
  fi
  echo "[entrypoint] MySQL não disponível ainda ($DB_HOST:$DB_PORT). Tentativa $count/$MAX_RETRIES..."
  sleep $RETRY_INTERVAL
done

echo "[entrypoint] MySQL disponível! Aguardando mais 3s para inicialização completa..."
sleep 3

# ─── Aplicar Migrações Drizzle ────────────────────────────────────────────────
echo "[entrypoint] Aplicando migrações do banco de dados..."

# Criar script de migração temporário (ESM)
cat > /tmp/run-migrate.mjs << 'MIGRATE_EOF'
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[migrate] DATABASE_URL não definido');
  process.exit(0);
}

try {
  const connection = await mysql.createConnection(dbUrl);
  const db = drizzle(connection);
  await migrate(db, { migrationsFolder: './drizzle' });
  await connection.end();
  console.log('[migrate] Migrações aplicadas com sucesso!');
} catch (err) {
  // Não falha o container — o banco pode já estar atualizado
  console.warn('[migrate] Aviso:', err.message);
}
MIGRATE_EOF

node /tmp/run-migrate.mjs || echo "[entrypoint] Aviso: migração falhou, continuando..."

# ─── Iniciar Servidor ─────────────────────────────────────────────────────────
echo "[entrypoint] Iniciando servidor Node.js..."
exec node dist/index.js
