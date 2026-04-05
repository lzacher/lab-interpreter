#!/usr/bin/env python3
"""
MedSuite — Preparação dos Dados do Wallach's para RAG

Converte o clinical_concepts.csv em um JSON estruturado otimizado
para o motor RAG do MedSuite, com filtragem de qualidade e enriquecimento.

Uso:
    python3 scripts/prepare_wallachs_for_rag.py

Entrada:  /home/ubuntu/wallachs_ai_training/clinical_concepts.csv
Saída:    data/wallachs_concepts.json
"""

import json
import csv
import re
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# ─── Configuração ─────────────────────────────────────────────────────────────

INPUT_CSV = Path("/home/ubuntu/wallachs_ai_training/clinical_concepts.csv")
OUTPUT_DIR = Path("data")
OUTPUT_JSON = OUTPUT_DIR / "wallachs_concepts.json"

# Termos médicos para extração de palavras-chave
MEDICAL_KEYWORDS = {
    # Testes laboratoriais
    "glucose", "hemoglobin", "creatinine", "urea", "sodium", "potassium",
    "calcium", "phosphorus", "magnesium", "chloride", "bicarbonate",
    "cholesterol", "triglycerides", "hdl", "ldl", "vldl",
    "tsh", "t3", "t4", "cortisol", "insulin", "estradiol", "testosterone",
    "psa", "cea", "afp", "ca125", "ca199",
    "wbc", "rbc", "hematocrit", "platelets", "neutrophils", "lymphocytes",
    "alt", "ast", "ggt", "bilirubin", "albumin", "alkaline",
    "crp", "esr", "ferritin", "transferrin", "iron",
    "uric", "amylase", "lipase", "troponin", "bnp", "creatine",
    # Condições clínicas
    "anemia", "diabetes", "hypothyroidism", "hyperthyroidism",
    "renal", "hepatic", "cardiac", "infection", "inflammation",
    "hypertension", "cardiovascular", "autoimmune", "deficiency",
    "syndrome", "disease", "disorder", "failure",
    # Status
    "elevated", "decreased", "normal", "abnormal", "increased", "low", "high",
    "reference", "range", "values", "interpretation",
}

# Capítulos do Wallach's mapeados para especialidades
CHAPTER_SPECIALTIES = {
    "Introduction to Laboratory Medicine": "geral",
    "Laboratory Tests": "geral",
    "Infectious Diseases Assays": "infectologia",
    "Cardiovascular Disorders": "cardiologia",
    "Central Nervous System Disorders": "neurologia",
    "Digestive Diseases": "gastroenterologia",
    "Endocrine Diseases": "endocrinologia",
    "Renal & Urinary Tract Diseases": "nefrologia",
    "Gynecologic & Obstetric Disorders": "ginecologia",
    "Hematologic Disorders": "hematologia",
    "Hereditary & Genetic Diseases": "genetica",
    "Immune & Autoimmune Diseases": "imunologia",
    "Infectious Diseases": "infectologia",
    "Respiratory, Metabolic & Acid-Base Disorders": "pneumologia",
    "Toxicology & Therapeutic Drug Monitoring": "toxicologia",
}


def extract_keywords(term: str, definition: str) -> list[str]:
    """Extrai palavras-chave médicas relevantes"""
    combined = f"{term} {definition}".lower()
    found = []
    for keyword in MEDICAL_KEYWORDS:
        if keyword in combined:
            found.append(keyword)
    return found[:8]


def is_quality_concept(term: str, definition: str) -> bool:
    """Verifica se um conceito tem qualidade suficiente para indexação"""
    if not term or not definition:
        return False
    if len(term.strip()) < 3 or len(term.strip()) > 200:
        return False
    if len(definition.strip()) < 15:
        return False
    # Filtrar linhas que são apenas números ou símbolos
    if re.match(r'^[\d\s\.\,\-\+\%]+$', term.strip()):
        return False
    # Filtrar termos que começam com caracteres especiais
    if term.strip()[0] in '.,;:!?()[]{}':
        return False
    return True


def normalize_chapter(chapter: str) -> str:
    """Normaliza o nome do capítulo removendo entidades HTML"""
    chapter = chapter.replace("&amp;", "&")
    chapter = chapter.replace("&lt;", "<")
    chapter = chapter.replace("&gt;", ">")
    chapter = chapter.replace("&nbsp;", " ")
    return chapter.strip()


def prepare_concepts():
    """Prepara e exporta os conceitos para JSON"""
    
    if not INPUT_CSV.exists():
        print(f"[Erro] Arquivo não encontrado: {INPUT_CSV}")
        print("[Erro] Execute primeiro: python3 process_wallachs_final.py")
        return
    
    print(f"[RAG Prep] Lendo {INPUT_CSV}...")
    
    concepts = []
    skipped = 0
    chapter_counts = defaultdict(int)
    
    with open(INPUT_CSV, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        
        for i, row in enumerate(reader):
            term = row.get('term', '').strip()
            definition = row.get('definition', '').strip()
            chapter = normalize_chapter(row.get('chapter', 'Unknown'))
            context = row.get('context', '').strip()[:300]
            
            if not is_quality_concept(term, definition):
                skipped += 1
                continue
            
            keywords = extract_keywords(term, definition)
            specialty = CHAPTER_SPECIALTIES.get(chapter, "geral")
            
            concept = {
                "id": f"wallachs_{i}",
                "term": term,
                "definition": definition,
                "chapter": chapter,
                "specialty": specialty,
                "context": context,
                "keywords": keywords,
            }
            
            concepts.append(concept)
            chapter_counts[chapter] += 1
    
    print(f"[RAG Prep] {len(concepts)} conceitos válidos ({skipped} descartados)")
    
    # Criar diretório de saída
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Salvar JSON
    output = {
        "metadata": {
            "source": "Wallach's Interpretation of Diagnostic Tests - 9th Edition",
            "totalConcepts": len(concepts),
            "generatedAt": datetime.now().isoformat(),
            "version": "1.0.0",
            "chapters": list(chapter_counts.keys()),
        },
        "concepts": concepts,
    }
    
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"[RAG Prep] Conceitos salvos em: {OUTPUT_JSON}")
    print(f"[RAG Prep] Tamanho: {OUTPUT_JSON.stat().st_size / 1024 / 1024:.1f} MB")
    
    # Estatísticas por capítulo
    print("\n[RAG Prep] Distribuição por capítulo:")
    for chapter, count in sorted(chapter_counts.items(), key=lambda x: x[1], reverse=True):
        specialty = CHAPTER_SPECIALTIES.get(chapter, "geral")
        print(f"  [{specialty}] {chapter}: {count} conceitos")
    
    # Estatísticas de palavras-chave
    all_keywords = []
    for concept in concepts:
        all_keywords.extend(concept['keywords'])
    
    keyword_freq = defaultdict(int)
    for kw in all_keywords:
        keyword_freq[kw] += 1
    
    print("\n[RAG Prep] Top 10 palavras-chave:")
    for kw, count in sorted(keyword_freq.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {kw}: {count}")
    
    print("\n[RAG Prep] Preparação concluída com sucesso!")
    print("[RAG Prep] Próximo passo: copie 'data/wallachs_concepts.json' para o projeto MedSuite")


if __name__ == "__main__":
    prepare_concepts()
