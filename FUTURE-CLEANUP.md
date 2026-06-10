# Limpeza Futura — Remover dependência Forge/Manus

**Quando solicitar:** Quando o sistema estiver rodando 100% na VPS e não precisar mais do preview no sandbox Manus.

---

## O que remover

### 1. `server/_core/llm.ts`
- Remover toda a função `invokeForge()` (linhas ~190–230)
- Remover a função `isForgeAvailable()`
- Remover as funções auxiliares: `normalizeMessage`, `normalizeToolChoice`, `resolveForgeApiUrl`, `normalizeResponseFormat`
- Simplificar `invokeLLM()` para chamar diretamente `invokeOllama()`

### 2. `server/_core/env.ts`
- Remover as variáveis:
  - `forgeApiUrl` (lê `BUILT_IN_FORGE_API_URL`)
  - `forgeApiKey` (lê `BUILT_IN_FORGE_API_KEY`)

### 3. Verificar se há outros arquivos referenciando `ENV.forgeApiKey` ou `ENV.forgeApiUrl`
```bash
grep -rn "forgeApi" server/ --include="*.ts"
```

---

## Por que existe hoje

O código do Forge é mantido para que o projeto funcione no sandbox da Manus (onde não há Ollama). Na VPS, esse código **nunca é executado** porque `BUILT_IN_FORGE_API_KEY` não está definida no `.env`.

---

## Impacto da remoção

- O projeto deixará de funcionar no sandbox/preview da Manus
- Zero impacto na VPS (já usa exclusivamente Ollama)
- Redução de ~100 linhas de código no `llm.ts`
