# Lab Interpreter Web — TODO

## Backend
- [x] Schema do banco: tabelas `exam_sessions` e `exams`
- [x] Migração SQL aplicada
- [x] Procedure `lab.upload` — recebe JSON, persiste sessão e exames
- [x] Procedure `lab.listSessions` — lista histórico de sessões do usuário
- [x] Procedure `lab.getSession` — retorna sessão completa com exames
- [x] Procedure `lab.deleteSession` — remove sessão do histórico
- [x] Lógica de processamento em `labProcessor.ts` com base de conhecimento clínico

## Frontend
- [x] Paleta de cores clínica minimalista em index.css (azul-ardósia + Inter)
- [x] Página Home — hero com upload de JSON (drag-and-drop + click)
- [x] Página Dashboard — histórico de sessões com delete
- [x] Página Análise — visualização completa de uma sessão
  - [x] Card de informações do paciente
  - [x] Resumo executivo (cards: total, alterados, normais, % normal)
  - [x] Gráficos interativos (Recharts BarChart) por exame
  - [x] Painel de interpretação clínica detalhada (expansível)
  - [x] Busca e filtro de exames (todos / alterados / normais)
  - [x] Observações do laudo (expansível)

## Testes
- [x] 27 testes Vitest passando (parseNumericResult, parseReferenceRange, classifyExam, getClinicalInterpretation, processLabJson)

## Correções (bug report — laudo Marcondes)
- [x] Corrigir `parseReferenceRange` para extrair faixa correta de intervalos multi-sexo/multi-faixa etária
- [x] Ampliar base de conhecimento clínico: PCR ultra-sensível, Estradiol, Testosterona Total/Livre/Biodisponível, SHBG
- [x] Melhorar `classifyExam` para usar o campo `status` do JSON quando o intervalo não for parseável
- [x] Atualizar testes unitários para cobrir os novos casos (39 testes passando)

## Simplificação (solicitação do usuário)
- [x] Remover classificação automática (elevado/baixo/normal) da exibição
- [x] Exibir tabela com: nome, resultado, unidade, valor de referência, interpretação clínica
- [x] Remover gráficos de barras e badges de status da página de análise
- [x] Manter resumo executivo simplificado (total de exames)
- [x] 39 testes passando

## Bug crítico (laudo Marcondes — exibição CSV bruto)
- [x] Causa raiz: campo `referenceRange` era varchar(255) — truncava textos longos corrompendo o dado
- [x] Migração aplicada: `name` e `referenceRange` agora são TEXT no banco
- [x] Coluna `interpretation` removida do schema, do backend e do frontend
- [x] labProcessor.ts removido — sem classificação automática
- [x] Tabela exibe: nome, resultado, unidade, valor de referência
- [x] 20 testes passando
