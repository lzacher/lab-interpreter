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

## Exportação PDF
- [x] Instalar jsPDF + jspdf-autotable no frontend
- [x] Criar função de geração de PDF no cliente (sem dependência de servidor)
- [x] Botão "Exportar PDF" no header da página de análise
- [x] PDF gerado com cabeçalho azul, dados do paciente em 2 colunas, tabela de resultados e rodapé com página
- [x] Nome do arquivo: paciente_data.pdf
- [x] 20 testes passando

## Destaque visual de resultados alterados
- [x] Colorir linhas da tabela: amber para elevado, azul para baixo, vermelho para alterado
- [x] Badge de status com ícone na coluna Resultado
- [x] Destaque de cores refletido no PDF via didParseCell
- [x] Legenda de cores exibida acima da tabela
- [x] 20 testes passando

## MedSuite — Integração Unificada
- [ ] Instalar dependências do classificador (pdf-parse, pdfjs-dist, sharp, @napi-rs/canvas)
- [ ] Schema unificado: documents, document_pages, imaging_reports (+ manter exam_sessions/exams)
- [ ] Migrar classifier.ts do Medical Document Classifier
- [ ] Criar jsonExtractor.ts: extração de JSON estruturado via LLM (lab e imagem)
- [ ] Criar routers/documents.ts: upload, analyze, process com roteamento por tipo
- [ ] Criar routers/imaging.ts: laudos de imagem (eco/TC/RM)
- [ ] Criar routers/history.ts: histórico unificado
- [ ] Página Home: upload drag-and-drop de PDF/JPG/JPEG
- [ ] Página Review: thumbnails + classificação por página
- [ ] Página Processing: status de progresso OCR
- [ ] Página LabResult: tabela com destaque visual + exportar PDF
- [ ] Página ImagingResult: técnica, descrição, conclusão + exportar PDF
- [ ] Página History: histórico unificado (lab + imagem)
- [ ] Testes unitários backend
- [ ] Checkpoint final + repositório GitHub medsuite

## Etapa de Revisão pelo Usuário (reimplementação)
- [x] Reescrever Review.tsx com grade de thumbnails completa
- [x] Badges de classificação com cores (laudo/imagem/indefinido)
- [x] Correção manual da classificação por página (dropdown)
- [x] Seleção individual de páginas para OCR (checkbox)
- [x] Botões de seleção rápida: Laudos / Todas / Nenhuma
- [x] Botão "Processar selecionadas" no header e no rodapé (mobile-friendly)
- [x] Overlay de processamento com spinner e mensagem
- [x] Indicador de etapas (Upload → Revisão → Processamento → Resultado)
- [x] Banner de instrução contextual
- [x] 36 testes passando

## Melhoria de Visualização de Páginas (Revisão)
- [x] Backend: renderização real via pdfjs para TODOS os PDFs (removido SVG de texto)
- [x] Backend: resolução do thumbnail aumentada para 800px, qualidade JPEG 88%
- [x] Frontend: grade de miniaturas com 5 colunas em desktop
- [x] Frontend: botão de zoom (lupa) aparece ao passar o mouse sobre cada miniatura
- [x] Frontend: modal de zoom com imagem em tamanho ampliado
- [x] Frontend: navegação por teclado (← →) e botão Prev/Next no modal
- [x] Frontend: seleção e reclassificação direto do modal de zoom
- [x] 36 testes passando

## Bug: Thumbnail vazio em PDFs com fontes incorporadas
- [x] Substituir pdfjs-dist por poppler-utils (pdftoppm) para renderização de thumbnails
- [x] Imports movidos para o topo do arquivo (compatível com esbuild)
- [x] Servidor reiniciado sem erros
- [x] 36 testes passando
- [ ] Testar com laudo de ressonância magnética (aguardando arquivo do usuário)
