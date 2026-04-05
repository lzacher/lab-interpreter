# MedSuite — Scripts de Manutenção da Base de Conhecimento RAG

Scripts Python para processar, mesclar e validar as fontes de conhecimento clínico
utilizadas pelo motor RAG do MedSuite.

## Pré-requisitos

```bash
pip3 install beautifulsoup4 html2text chardet
```

## Scripts Disponíveis

### `prepare_wallachs_for_rag.py`
Converte o CSV de conceitos do Wallach's (gerado pelo `process_wallachs_final.py`)
para o formato JSON otimizado para o motor RAG.

```bash
python3 scripts/prepare_wallachs_for_rag.py
# Entrada:  wallachs_ai_training/clinical_concepts.csv
# Saída:    data/wallachs_concepts.json
```

### `process_caquet_guide.py`
Extrai conceitos clínicos estruturados do Guia Caquet em formato Markdown.
Processa tabelas de valores de referência, biomarcadores e princípios de interpretação.

```bash
python3 scripts/process_caquet_guide.py
# Entrada:  GuiaCompleto_InterpretaçãodeExamesLaboratoriais.md
# Saída:    data/caquet_concepts.json
```

### `merge_knowledge_bases.py`
Mescla as bases do Wallach's e do Caquet em uma base unificada bilíngue.
Realiza deduplicação por similaridade de Jaccard e enriquecimento cruzado.

```bash
python3 scripts/merge_knowledge_bases.py
# Entrada:  data/wallachs_concepts.json + data/caquet_concepts.json
# Saída:    data/unified_knowledge_base.json
```

### `validate_and_report.py`
Valida a integridade da base unificada e gera relatório de cobertura clínica.

```bash
python3 scripts/validate_and_report.py
# Entrada:  data/unified_knowledge_base.json
# Saída:    data/validation_report.md
```

## Fluxo Completo de Atualização

```bash
# Ao adicionar uma nova fonte de conhecimento:
python3 scripts/process_nova_fonte.py     # 1. Processar nova fonte
python3 scripts/merge_knowledge_bases.py  # 2. Mesclar bases
python3 scripts/validate_and_report.py    # 3. Validar resultado
```
