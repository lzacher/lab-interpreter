# Instruções de Deploy - Lab Interpreter

## Resumo das Mudanças (Storage Local)

O sistema de storage foi reescrito para funcionar **sem o proxy S3 da Manus**. Quando as variáveis `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY` não estão definidas, o sistema automaticamente usa storage local em disco.

### O que foi corrigido:
1. **Storage local em disco** — arquivos são salvos em `/app/uploads` (volume Docker)
2. **Express static middleware** — serve os arquivos em `/storage/*`
3. **Variável `STORAGE_LOCAL_PATH`** — define o diretório de storage (padrão: `/app/uploads`)
4. **Volume Docker `lab-uploads`** — persiste os uploads entre restarts do container

---

## Deploy na VPS (Atualização)

### 1. Atualizar o código

```bash
cd /opt/lab-interpreter
git pull origin main
```

### 2. Rebuild da imagem Docker

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env build --no-cache lab-app
```

### 3. Reiniciar o container

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env stop lab-app
docker compose -f deploy/docker-compose.yml --env-file deploy/.env rm -f lab-app
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d lab-app
```

### 4. Verificar se está funcionando

```bash
# Verificar logs
docker logs lab-interpreter-app --tail 20

# Deve mostrar:
# Server running on http://localhost:3000/
# [RAG] Using keyword-based search (no external dependencies)
```

### 5. Testar o upload de exames

1. Acesse https://labinterpreter.drzacher.com
2. Faça login com admin@drzacher.com / Lz@ch3r
3. Faça upload de um PDF de exame
4. Verifique se o arquivo foi salvo:

```bash
docker exec lab-interpreter-app ls -la /app/uploads/
```

---

## Variáveis de Ambiente (.env)

O arquivo `deploy/.env` deve conter:

```env
MYSQL_ROOT_PASSWORD=<senha-root-mysql>
MYSQL_DATABASE=lab_interpreter
MYSQL_USER=labuser
MYSQL_PASSWORD=MinhaS3nhaLab2024!
JWT_SECRET=<seu-jwt-secret>
DOMAIN=labinterpreter.drzacher.com
```

**Nota:** As variáveis `STORAGE_MODE=local` e `STORAGE_LOCAL_PATH=/app/uploads` já estão definidas diretamente no `docker-compose.yml`.

---

## Troubleshooting

### Erro "Storage proxy credentials missing"
- Isso significa que o código antigo (sem o fix de storage) ainda está rodando
- Faça `git pull` e rebuild conforme os passos acima

### Se o upload falhar com erro de permissão
```bash
docker exec lab-interpreter-app mkdir -p /app/uploads
docker exec lab-interpreter-app chmod 777 /app/uploads
```

### Se o login retornar "E-mail ou senha incorretos"
- Verifique se o seed SQL foi executado: `docker exec -i lab-interpreter-db mysql -u labuser -pMinhaS3nhaLab2024! lab_interpreter < deploy/seed-admin.sql`

### Se o servidor não iniciar
- Verifique os logs: `docker logs lab-interpreter-app --tail 50`
- Confirme que todas as dependências estão no `package.json`
