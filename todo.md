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

## Visualização direta no browser (substituir thumbnails server-side)
- [x] Instalar pdfjs-dist no frontend
- [x] Criar componente PdfPageCanvas que renderiza cada página do PDF no canvas do browser
- [x] Reescrever Review.tsx v5: recebe documentId da URL, busca arquivo do S3, renderiza no browser
- [x] Exibir páginas como pequenas janelas clicáveis (canvas 180px de largura)
- [x] Modal de zoom ao clicar mostra a página em tamanho maior (560px)
- [x] Classificação e seleção permanecem funcionando igual ao anterior
- [x] Ao clicar "Processar", chama trpc.documents.process com páginas selecionadas
- [x] Corrigido: @import do Google Fonts movido para index.html (elimina warning de CSS)
- [x] 36 testes passando

## Bug: Erro de inserção no banco — campo `status` dos exames
- [x] Diagnosticar: campo `status` no schema do banco era varchar(30) mas LLM retornava texto longo
- [x] Corrigir: migração aplicada — campo `status` alterado para TEXT
- [x] Corrigir: função normalizeStatus() adicionada ao jsonExtractor.ts (mapeia texto → palavra curta)
- [x] Corrigir: prompt do LLM atualizado para instruir status em formato curto
- [x] 49 testes passando (13 novos testes de normalizeStatus)

## Bug: Erro de inserção — campo `result` dos exames recebe texto longo
- [x] Ampliar campo `result` de varchar(100) para TEXT no banco
- [x] Ampliar campo `unit` de varchar(50) para TEXT no banco
- [x] Ampliar campo `referenceRange` já era TEXT — OK
- [x] Corrigido: classificações manuais do frontend agora são enviadas ao backend no payload do process
- [x] Backend usa classificações do frontend com prioridade sobre as do banco
- [x] 49 testes passando

## Bug: Seleção manual de páginas não funciona no Review.tsx
- [x] Corrigido: o canvas do PDF.js não propagava cliques para o card pai
- [x] Solução: overlay transparente (z-20) sobre o preview captura o clique e chama onToggleSelect
- [x] Botão de zoom elevado para z-30 para ficar acima do overlay

## Bug: Processamento seletivo de páginas não funciona corretamente
- [x] Causa raiz: extractNativeTextPerPage carregava TODAS as páginas do PDF (pdfjs-dist)
      podendo falhar silenciosamente em PDFs grandes e cair em fallback incorreto
- [x] Correção: nova função extractNativeTextSinglePage usa pdftotext (poppler) com -f/-l
      para extrair APENAS a página solicitada, sem carregar o PDF inteiro
- [x] Logs detalhados adicionados ao OCR para facilitar diagnóstico futuro
- [x] 49 testes passando

## Bug: Classificação de páginas não pré-preenchida com dados do banco
- [x] Corrigido: Review.tsx agora usa docData.pages para pré-preencher type de cada página ao carregar
- [x] Classificação automática do LLM (feita durante o upload) é exibida corretamente na tela de revisão
- [x] Laudo de imagem agora é detectado como "imagem" sem intervenção manual do usuário
- [x] 49 testes passando

## Bug: Laudo de Mamografia não extrai dados em nenhuma classificação
- [x] Causa raiz encontrada: o procedure `analyze` NUNCA era chamado após o upload
      O Home.tsx navegava direto para /review sem chamar analyze, então totalPages=0 e
      document_pages ficava vazio — o OCR não tinha páginas para processar
- [x] Correção: Review.tsx agora chama analyze automaticamente ao carregar se não há páginas no banco
- [x] Banner amarelo exibido durante a classificação automática ("Classificando páginas...")
- [x] Botão Processar desabilitado enquanto analyze está em andamento
- [x] 49 testes passando

## Bug CRÍTICO CORRIGIDO: OCR não funcionava em produção — binários do sistema indisponíveis
- [x] Causa raiz: pdftotext e pdftoppm (poppler-utils) usados no classifier.ts não existem em produção
- [x] Substituir pdftotext por pdfjs-dist (Node.js puro) — função extractNativeTextSinglePage reescrita
- [x] Substituir pdftoppm por pdfjs-dist + @napi-rs/canvas — função renderPdfPageToJpeg reescrita
- [x] Removidos todos os imports de child_process, execFile, os do classifier.ts
- [x] classifier.ts v2.0: 100% Node.js, sem dependência de binários do sistema
- [x] TypeScript: 0 erros | 49 testes passando

## Feature: Indicador de progresso do OCR
- [x] Backend: campo ocrStatus adicionado à tabela document_pages (pending/processing/done/error)
- [x] Backend: procedure getProgress retorna status de cada página + contadores done/total
- [x] Backend: extractTextFromPages atualiza ocrStatus via callback onPageProgress
- [x] Frontend: overlay de processamento com lista de páginas e status em tempo real
- [x] Frontend: polling automático a cada 1.5s via trpc.documents.getProgress
- [x] Frontend: barra de progresso geral (X de Y páginas concluídas, %)
- [x] Frontend: ícones visuais por status (○ aguardando, spinner lendo, ✓ concluído, ⚠ erro)
- [x] 49 testes passando

## Feature: Mover analyze para o fluxo de upload
- [x] Home.tsx: chama analyze após upload (antes de navegar para /review)
- [x] Home.tsx: indicador de 3 etapas: Upload → Classificação IA → Revisão (com spinner e check)
- [x] Review.tsx: banner amarelo removido — páginas já chegam classificadas
- [x] Review.tsx: fallback silencioso mantido para documentos antigos sem páginas
- [x] 49 testes passando

## Feature: Limpar histórico
- [ ] Backend: procedure clearHistory que exclui todos os documentos, páginas e exames do usuário
- [ ] Frontend: botão "Limpar histórico" na tela de histórico com dialog de confirmação
- [ ] Frontend: feedback visual após limpeza (toast de sucesso + lista vazia)

## Feature: Upload múltiplo de arquivos do mesmo paciente
- [ ] Frontend: aceitar múltiplos arquivos no input (multiple attribute)
- [ ] Frontend: exibir lista de arquivos selecionados com opção de remover cada um
- [ ] Backend: procedure uploadMultiple que recebe array de arquivos e os mescla em um único documento
- [ ] Backend: mesclar páginas de todos os arquivos em ordem, mantendo rastreabilidade por arquivo de origem
- [ ] Frontend: indicador de progresso por arquivo durante o upload múltiplo
- [ ] Testar fluxo completo com 2+ PDFs do mesmo paciente

## Feature: Resumo Clínico por IA (editável)
- [ ] Adicionar campo clinical_summary na tabela exam_sessions (schema + migration)
- [ ] Criar procedure generateClinicalSummary no backend (invokeLLM com os exames extraídos)
- [ ] Criar procedure saveClinicalSummary para persistir edições do usuário
- [ ] Implementar seção de resumo clínico editável na tela Analysis.tsx
- [ ] Incluir resumo clínico no PDF exportado

## Feature: RAG com livros médicos de referência
- [x] Extrair texto dos livros Wallach's e Guia Completo de Exames Laboratoriais (PDFs)
- [x] Criar tabela knowledge_base no TiDB com suporte a VECTOR(384)
- [x] Indexar 787 chunks dos livros com embeddings all-MiniLM-L6-v2 (Python)
- [x] Criar microserviço Python de embeddings (embedding_service.py, porta 5001)
- [x] Criar módulo server/rag.ts com busca vetorial via mysql2 diretamente
- [x] Integrar RAG na procedure generateClinicalSummary do routers.ts
- [x] Servidor inicia microserviço de embeddings automaticamente (server/_core/index.ts)
- [x] Testes validados: busca vetorial retorna chunks relevantes para exames renais, hepáticos, etc.

## Feature: Feedback de trechos RAG (👍/👎)
- [x] Schema: tabela rag_feedback (id, chunk_id, session_id, user_id, vote, created_at)
- [x] Schema: adicionar campo id à tabela knowledge_base (se não existir)
- [x] Backend: procedure submitRagFeedback (salva voto no banco)
- [x] Backend: procedure getRagFeedback (retorna votos por sessão)
- [x] RAG: retornar chunks com id e texto junto ao resumo clínico
- [x] Backend: generateClinicalSummary retorna também os chunks usados (com id, source, text)
- [x] Frontend: exibir seção "Fontes consultadas" abaixo do resumo clínico
- [x] Frontend: cada fonte mostra: nome do livro, trecho truncado, botões 👍/👎
- [x] Frontend: estado de feedback persiste (botão ativo após votar)
- [x] Frontend: feedback enviado via trpc.lab.submitRagFeedback
- [x] RAG refatorado para busca por palavras-chave (funciona em produção)
- [x] Modal de seleção de seções antes de exportar PDF
- [ ] Substituir classificação IA por seleção manual do usuário (thumbnails + tipo + páginas)

## Feature: Exportar PDF do exame de imagem a partir da aba de resultados
- [x] Implementar função exportPdfImaging no Analysis.tsx (reutiliza lógica do ImagingResult.tsx)
- [x] Botão "Exportar PDF" no header detecta aba ativa e chama a função correta (lab ou imagem)
- [x] PDF de imagem inclui: cabeçalho azul, dados do paciente, técnica, descrição, conclusão (destaque), observações, rodapé
- [x] TypeScript: 0 erros | 60 testes passando

## Feature: Remover módulo de IA dos exames laboratoriais (preparação para migração VPS)
- [x] Frontend Analysis.tsx: remover seção de Resumo Clínico (geração, edição, salvar)
- [x] Frontend Analysis.tsx: remover seção de Fontes RAG (chunks + botões 👍/👎)
- [x] Frontend Analysis.tsx: remover estados e hooks relacionados (summaryText, ragChunks, localVotes, etc.)
- [x] Frontend Analysis.tsx: simplificar modal de exportação PDF (remover opção "Resumo Clínico")
- [x] Frontend Analysis.tsx: simplificar exportPdf (remover seção summary do PDF)
- [x] Backend routers.ts: remover procedures generateClinicalSummary, saveClinicalSummary, submitRagFeedback, getRagFeedback
- [x] Backend: remover imports de invokeLLM e rag.ts do routers.ts
- [x] Manter: tabela de resultados, exportação PDF (lab e imagem), histórico, dual-tab

## Remoção do módulo de IA dos exames laboratoriais (preparação para migração VPS)
- [x] Remover bloco de Resumo Clínico e RAG do labContent (Analysis.tsx)
- [x] Remover states e hooks de IA (summaryText, ragChunks, localVotes, etc.)
- [x] Remover seção "Resumo Clínico" da função exportPdf
- [x] Remover opção "Resumo Clínico" do modal de exportação PDF
- [x] Remover procedures generateClinicalSummary, saveClinicalSummary, submitRagFeedback, getRagFeedback do routers.ts
- [x] Remover imports de invokeLLM, rag.ts e saveClinicalSummary do routers.ts
- [x] TypeScript: 0 erros | 60 testes passando
- [x] Guia de migração VPS salvo em references/medsuite_migracao_vps.md

## Feature: Autenticação JWT Local (substituição do OAuth Manus)
- [x] Instalar dependências: bcryptjs, jsonwebtoken, @types/bcryptjs, @types/jsonwebtoken
- [x] Criar server/_core/localAuth.ts: helpers signToken, verifyToken, hashPassword, comparePassword
- [x] Atualizar drizzle/schema.ts: adicionar campo passwordHash na tabela users
- [x] Aplicar migração SQL (passwordHash incluído no init.sql completo)
- [x] Atualizar server/db.ts: helpers getUserByEmail, createLocalUser
- [x] Criar server/routers/localAuth.ts: procedures login, register, logout, me
- [x] Atualizar server/_core/context.ts: verificar JWT do cookie em vez do Manus OAuth
- [x] Criar client/src/pages/Login.tsx: tela de login com email/senha
- [x] Criar client/src/pages/Register.tsx: integrada na Login.tsx (modo toggle login/registro)
- [x] Atualizar client/src/hooks/useAuth.ts: usar trpc.auth.me local
- [x] Atualizar client/src/App.tsx: rota /login e proteção de rotas
- [x] Remover dependência do vite-plugin-manus-runtime do vite.config.ts
- [x] Escrever testes para as procedures de autenticação local (auth.logout.test.ts)
