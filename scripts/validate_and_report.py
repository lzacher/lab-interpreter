#!/usr/bin/env python3
"""
MedSuite — Validação e Relatório da Base Unificada

Valida a integridade da base de conhecimento unificada e gera um relatório
comparativo detalhado sobre a cobertura clínica das duas fontes.

Uso:
    python3 scripts/validate_and_report.py

Saída:
    data/validation_report.md
"""

import json
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

DATA_DIR = Path("/home/ubuntu/medsuite_rag/data")
UNIFIED_JSON = DATA_DIR / "unified_knowledge_base.json"
REPORT_MD = DATA_DIR / "validation_report.md"

# Exames laboratoriais mais comuns para verificar cobertura
COMMON_EXAMS = [
    # Bioquímica básica
    "glucose", "glicose", "creatinine", "creatinina", "urea", "ureia",
    "sodium", "sódio", "potassium", "potássio", "calcium", "cálcio",
    "albumin", "albumina", "bilirubin", "bilirrubina",
    # Lipídios
    "cholesterol", "colesterol", "triglycerides", "triglicerídeos", "hdl", "ldl",
    # Enzimas hepáticas
    "alt", "ast", "ggt", "alkaline phosphatase", "fosfatase alcalina",
    # Hematologia
    "hemoglobin", "hemoglobina", "hematocrit", "hematócrito",
    "platelets", "plaquetas", "leukocytes", "leucócitos",
    # Endocrinologia
    "tsh", "t4", "cortisol", "insulin", "insulina",
    # Marcadores inflamatórios
    "crp", "pcr", "ferritin", "ferritina", "esr",
    # Coagulação
    "inr", "prothrombin", "protrombina", "fibrinogen", "fibrinogênio",
    # Urina
    "creatinine clearance", "clearance de creatinina",
    # Marcadores cardíacos
    "troponin", "troponina", "bnp",
]


def load_unified_base():
    """Carrega a base unificada"""
    with open(UNIFIED_JSON, 'r', encoding='utf-8') as f:
        return json.load(f)


def check_coverage(concepts: list, exam_list: list) -> dict:
    """Verifica cobertura dos exames mais comuns"""
    coverage = {}
    all_terms = ' '.join([c['term'].lower() + ' ' + c.get('definition', '')[:100].lower() 
                          for c in concepts])
    
    for exam in exam_list:
        found = exam.lower() in all_terms
        coverage[exam] = found
    
    return coverage


def validate_concept(concept: dict) -> list:
    """Valida um conceito e retorna lista de problemas"""
    issues = []
    
    if not concept.get('term'):
        issues.append("term_missing")
    elif len(concept['term']) < 3:
        issues.append("term_too_short")
    
    if not concept.get('definition'):
        issues.append("definition_missing")
    elif len(concept['definition']) < 15:
        issues.append("definition_too_short")
    
    if not concept.get('chapter'):
        issues.append("chapter_missing")
    
    if not concept.get('specialty'):
        issues.append("specialty_missing")
    
    return issues


def analyze_quality(concepts: list) -> dict:
    """Analisa a qualidade dos conceitos"""
    quality = {
        'total': len(concepts),
        'valid': 0,
        'with_issues': 0,
        'with_reference_values': 0,
        'with_context': 0,
        'with_context_pt': 0,
        'with_keywords': 0,
        'bilingual': 0,
        'issues_breakdown': defaultdict(int),
    }
    
    for concept in concepts:
        issues = validate_concept(concept)
        if issues:
            quality['with_issues'] += 1
            for issue in issues:
                quality['issues_breakdown'][issue] += 1
        else:
            quality['valid'] += 1
        
        if concept.get('reference_values') or concept.get('reference_values_pt'):
            quality['with_reference_values'] += 1
        
        if concept.get('context'):
            quality['with_context'] += 1
        
        if concept.get('context_pt'):
            quality['with_context_pt'] += 1
            quality['bilingual'] += 1
        
        if concept.get('keywords'):
            quality['with_keywords'] += 1
    
    return quality


def find_top_terms(concepts: list, n: int = 20) -> list:
    """Encontra os termos mais ricos (com mais informação)"""
    scored = []
    for c in concepts:
        score = 0
        score += len(c.get('definition', ''))
        score += len(c.get('context', '')) * 2
        score += len(c.get('context_pt', '')) * 3
        score += len(c.get('keywords', [])) * 10
        if c.get('reference_values'):
            score += 50
        if c.get('reference_values_pt'):
            score += 75
        if c.get('alert_level') == 'critical':
            score += 200
        elif c.get('alert_level') == 'warning':
            score += 100
        scored.append((c['term'], score, c.get('specialty', 'geral'), c.get('language', 'en')))
    
    return sorted(scored, key=lambda x: x[1], reverse=True)[:n]


def generate_report(data: dict) -> str:
    """Gera o relatório Markdown"""
    
    meta = data['metadata']
    concepts = data['concepts']
    indexes = data['indexes']
    merge_stats = meta['mergeStats']
    
    # Análises
    coverage = check_coverage(concepts, COMMON_EXAMS)
    quality = analyze_quality(concepts)
    top_terms = find_top_terms(concepts, 15)
    
    # Distribuição por especialidade
    specialty_dist = defaultdict(int)
    for c in concepts:
        specialty_dist[c.get('specialty', 'geral')] += 1
    
    # Distribuição por fonte
    source_dist = defaultdict(int)
    for c in concepts:
        lang = c.get('language', 'en')
        source_dist['pt-BR' if lang == 'pt-BR' else 'en'] += 1
    
    # Conceitos bilíngues
    bilingual = [c for c in concepts if c.get('context_pt')]
    
    covered = sum(1 for v in coverage.values() if v)
    coverage_pct = (covered / len(COMMON_EXAMS)) * 100
    
    lines = [
        "# MedSuite — Relatório de Validação da Base de Conhecimento Unificada",
        "",
        f"**Gerado em:** {datetime.now().strftime('%d/%m/%Y %H:%M')}  ",
        f"**Versão da base:** {meta.get('version', '2.0.0')}",
        "",
        "---",
        "",
        "## 1. Resumo Executivo",
        "",
        "A base de conhecimento unificada do MedSuite combina duas fontes complementares:",
        "",
        "| Fonte | Idioma | Conceitos | Cobertura |",
        "|-------|--------|-----------|-----------|",
        f"| Wallach's Interpretation of Diagnostic Tests (9ª ed.) | Inglês | {merge_stats['wallachs_total']:,} | Abrangente, referência mundial |",
        f"| 250 Exames de Laboratório — René Caquet (12ª ed.) | Português | {merge_stats['caquet_total']:,} | Valores SI, contexto brasileiro |",
        f"| **Base Unificada** | **Bilíngue** | **{merge_stats['total_unified']:,}** | **Cobertura ampliada** |",
        "",
        "---",
        "",
        "## 2. Estatísticas da Mesclagem",
        "",
        f"| Métrica | Valor |",
        f"|---------|-------|",
        f"| Conceitos do Wallach's (base principal) | {merge_stats['wallachs_total']:,} |",
        f"| Conceitos do Caquet (base complementar) | {merge_stats['caquet_total']:,} |",
        f"| Conceitos novos adicionados do Caquet | {merge_stats['caquet_added']:,} |",
        f"| Duplicatas identificadas e enriquecidas | {merge_stats['caquet_duplicates']:,} |",
        f"| Campos enriquecidos com dados do Caquet | {merge_stats['caquet_enriched']:,} |",
        f"| **Total unificado** | **{merge_stats['total_unified']:,}** |",
        f"| Conceitos bilíngues (EN + PT-BR) | {len(bilingual):,} |",
        "",
        "---",
        "",
        "## 3. Cobertura por Especialidade Médica",
        "",
        "| Especialidade | Conceitos | Percentual |",
        "|---------------|-----------|------------|",
    ]
    
    total = len(concepts)
    for specialty, count in sorted(specialty_dist.items(), key=lambda x: x[1], reverse=True):
        pct = (count / total) * 100
        lines.append(f"| {specialty.capitalize()} | {count:,} | {pct:.1f}% |")
    
    lines += [
        "",
        "---",
        "",
        "## 4. Cobertura de Exames Laboratoriais Comuns",
        "",
        f"**Cobertura geral:** {covered}/{len(COMMON_EXAMS)} exames ({coverage_pct:.0f}%)",
        "",
        "| Exame | Coberto |",
        "|-------|---------|",
    ]
    
    for exam, found in sorted(coverage.items(), key=lambda x: (not x[1], x[0])):
        status = "✓ Sim" if found else "✗ Não"
        lines.append(f"| {exam} | {status} |")
    
    lines += [
        "",
        "---",
        "",
        "## 5. Qualidade dos Dados",
        "",
        f"| Métrica de Qualidade | Quantidade | Percentual |",
        f"|----------------------|------------|------------|",
        f"| Conceitos válidos | {quality['valid']:,} | {(quality['valid']/total*100):.1f}% |",
        f"| Com valores de referência | {quality['with_reference_values']:,} | {(quality['with_reference_values']/total*100):.1f}% |",
        f"| Com contexto adicional | {quality['with_context']:,} | {(quality['with_context']/total*100):.1f}% |",
        f"| Com contexto em PT-BR | {quality['with_context_pt']:,} | {(quality['with_context_pt']/total*100):.1f}% |",
        f"| Com palavras-chave | {quality['with_keywords']:,} | {(quality['with_keywords']/total*100):.1f}% |",
        f"| Bilíngues (EN + PT-BR) | {quality['bilingual']:,} | {(quality['bilingual']/total*100):.1f}% |",
        "",
        "---",
        "",
        "## 6. Top 15 Conceitos Mais Ricos",
        "",
        "Conceitos com maior densidade de informação clínica (definição + contexto + valores de referência):",
        "",
        "| # | Termo | Especialidade | Idioma |",
        "|---|-------|---------------|--------|",
    ]
    
    for i, (term, score, specialty, lang) in enumerate(top_terms, 1):
        lang_label = "PT-BR" if lang == 'pt-BR' else "EN"
        lines.append(f"| {i} | {term[:60]} | {specialty} | {lang_label} |")
    
    lines += [
        "",
        "---",
        "",
        "## 7. Vantagens da Base Bilíngue para o MedSuite",
        "",
        "A combinação das duas fontes oferece benefícios específicos para o contexto clínico brasileiro:",
        "",
        "**Do Wallach's (inglês):**",
        "- Cobertura abrangente de 6.363 conceitos em 15 especialidades",
        "- Referência padrão-ouro internacional para interpretação laboratorial",
        "- Valores de referência em unidades americanas (mg/dL, etc.)",
        "- Contexto clínico detalhado para condições raras",
        "",
        "**Do Caquet (português):**",
        "- Valores de referência em unidades SI e tradicionais brasileiras",
        "- Texto em português brasileiro, facilitando a geração de laudos",
        "- Orientações de coleta específicas (tubos, jejum, interferentes)",
        "- Alertas clínicos explícitos para urgências laboratoriais",
        "- Abreviações padronizadas usadas em laudos brasileiros",
        "",
        "**Da combinação:**",
        "- O LLM recebe contexto em ambos os idiomas, melhorando a qualidade das respostas em PT-BR",
        "- Conceitos enriquecidos com valores de referência em múltiplas unidades",
        "- Cobertura de 44 conceitos com dados complementares de ambas as fontes",
        "",
        "---",
        "",
        "## 8. Instruções de Atualização",
        "",
        "Para adicionar novas fontes à base de conhecimento:",
        "",
        "```bash",
        "# 1. Processar nova fonte",
        "python3 scripts/process_nova_fonte.py",
        "",
        "# 2. Mesclar com a base existente",
        "python3 scripts/merge_knowledge_bases.py",
        "",
        "# 3. Validar resultado",
        "python3 scripts/validate_and_report.py",
        "",
        "# 4. Copiar para o projeto MedSuite",
        "cp data/unified_knowledge_base.json ../medsuite/data/wallachs_concepts.json",
        "```",
        "",
        "> **Nota:** O motor RAG (`wallachsRag.ts`) usa o campo `concepts` do JSON, independente",
        "> do nome do arquivo. Ao substituir `wallachs_concepts.json` pela base unificada,",
        "> o sistema automaticamente passa a usar as 6.432 entradas combinadas.",
        "",
        "---",
        "",
        f"*Relatório gerado automaticamente pelo pipeline RAG do MedSuite em {datetime.now().strftime('%d/%m/%Y')}.*",
    ]
    
    return '\n'.join(lines)


def main():
    print("[Validação] Carregando base unificada...")
    data = load_unified_base()
    
    print("[Validação] Gerando relatório...")
    report = generate_report(data)
    
    with open(REPORT_MD, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"[Validação] Relatório salvo em: {REPORT_MD}")
    
    # Resumo no terminal
    meta = data['metadata']
    concepts = data['concepts']
    coverage = check_coverage(concepts, COMMON_EXAMS)
    covered = sum(1 for v in coverage.values() if v)
    
    print(f"\n[Validação] Resumo:")
    print(f"  Total de conceitos: {len(concepts):,}")
    print(f"  Cobertura de exames comuns: {covered}/{len(COMMON_EXAMS)} ({covered/len(COMMON_EXAMS)*100:.0f}%)")
    print(f"  Tamanho do arquivo: {UNIFIED_JSON.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
