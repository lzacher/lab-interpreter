# MedSuite — Base de Conhecimento Clínico (RAG)

Esta pasta contém a base de conhecimento unificada utilizada pelo motor RAG do MedSuite
para enriquecer a interpretação de exames laboratoriais com contexto clínico baseado em
evidências.

## Arquivos

| Arquivo | Tamanho | Descrição |
|---------|---------|-----------|
| `unified_knowledge_base.json` | ~6 MB | **Base principal** — 6.432 conceitos unificados (usar este) |
| `wallachs_concepts.json` | ~3.8 MB | Base isolada do Wallach's (9ª ed.) — 6.363 conceitos em inglês |
| `caquet_concepts.json` | ~71 KB | Base isolada do Caquet (12ª ed.) — 113 conceitos em português |

## Fontes

### Wallach's Interpretation of Diagnostic Tests — 9ª Edição
- **Idioma:** Inglês
- **Cobertura:** 15 especialidades médicas, 6.363 conceitos
- **Referência:** Padrão-ouro internacional para interpretação laboratorial

### 250 Exames de Laboratório: Prescrição e Interpretação — 12ª Edição
- **Autor:** René Caquet
- **Idioma:** Português Brasileiro
- **Cobertura:** Valores de referência em unidades SI, orientações de coleta, alertas clínicos
- **Editora:** Thieme Revinter, 2017 (ISBN: 978-85-67661-45-2)

## Estrutura do JSON Unificado

```json
{
  "metadata": { ... },
  "indexes": {
    "byChapter": { ... },
    "bySpecialty": { ... },
    "byAlertLevel": { ... }
  },
  "concepts": [
    {
      "unified_id": "unified_1",
      "term": "Glucose",
      "definition": "...",
      "chapter": "Laboratory Tests",
      "specialty": "endocrinologia",
      "keywords": ["glucose", "diabetes", ...],
      "source": "Wallach's ...",
      "language": "en",
      "alert_level": "normal",
      "priority": 42,
      "context": "...",
      "context_pt": "...",          // Contexto em PT-BR (do Caquet, quando disponível)
      "reference_values": { ... },
      "reference_values_pt": { ... } // Valores SI em PT-BR (do Caquet)
    }
  ]
}
```

## Atualização da Base

Para adicionar novas fontes ou regenerar a base:

```bash
# 1. Processar nova fonte em Markdown
python3 scripts/process_caquet_guide.py   # exemplo para o Caquet

# 2. Mesclar com a base existente
python3 scripts/merge_knowledge_bases.py

# 3. Validar e gerar relatório
python3 scripts/validate_and_report.py

# 4. O arquivo unified_knowledge_base.json é atualizado automaticamente
```

## Cobertura

- **6.432 conceitos** em 14 especialidades médicas
- **87% de cobertura** dos exames laboratoriais mais comuns
- **44 conceitos bilíngues** (EN + PT-BR) com valores de referência em unidades SI
- Distribuição: Infectologia (31%), Geral (22%), Hematologia (10%), Gastroenterologia (8%)...
