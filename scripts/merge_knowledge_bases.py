#!/usr/bin/env python3
"""
MedSuite — Mesclagem das Bases de Conhecimento RAG

Combina os conceitos do Wallach's Interpretation of Diagnostic Tests (inglês)
com os conceitos do Guia Caquet 250 Exames (português) em uma base unificada,
enriquecida e deduplicada para o motor RAG do MedSuite.

Estratégia de mesclagem:
- Wallach's: base principal (6.363 conceitos em inglês)
- Caquet: base complementar (113 conceitos em português, com valores SI)
- Deduplicação: por similaridade de termos (> 85% de sobreposição de tokens)
- Enriquecimento: conceitos Caquet com alertas são promovidos em prioridade
- Resultado: base bilíngue unificada com metadados de fonte

Uso:
    python3 scripts/merge_knowledge_bases.py

Saída:
    data/unified_knowledge_base.json
    data/unified_index_stats.json
"""

import json
import re
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# ─── Configuração ─────────────────────────────────────────────────────────────

DATA_DIR = Path("/home/ubuntu/medsuite_rag/data")
WALLACHS_JSON = DATA_DIR / "wallachs_concepts.json"
CAQUET_JSON = DATA_DIR / "caquet_concepts.json"
OUTPUT_JSON = DATA_DIR / "unified_knowledge_base.json"
STATS_JSON = DATA_DIR / "unified_index_stats.json"

# Limiar de similaridade para deduplicação (0.0 a 1.0)
DEDUP_THRESHOLD = 0.75


# ─── Utilitários ──────────────────────────────────────────────────────────────

def normalize_term(term: str) -> str:
    """Normaliza um termo para comparação"""
    # Remover parênteses e conteúdo entre parênteses
    term = re.sub(r'\([^)]*\)', '', term)
    # Remover caracteres especiais
    term = re.sub(r'[^a-záéíóúàâêôãõüç\s]', ' ', term.lower())
    # Normalizar espaços
    return ' '.join(term.split())


def tokenize(text: str) -> set:
    """Tokeniza texto em conjunto de palavras"""
    words = re.findall(r'\b[a-záéíóúàâêôãõüç]{3,}\b', text.lower())
    # Remover stop words básicas
    stop_words = {
        'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
        'uma', 'uns', 'para', 'com', 'por', 'que', 'dos', 'das', 'nos',
        'seu', 'sua', 'como', 'mais', 'mas', 'isso', 'este', 'esse',
        'ser', 'ter', 'pode', 'deve', 'caso', 'valor', 'nível',
    }
    return {w for w in words if w not in stop_words}


def jaccard_similarity(set_a: set, set_b: set) -> float:
    """Calcula similaridade de Jaccard entre dois conjuntos"""
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


def is_duplicate(term_a: str, term_b: str, threshold: float = DEDUP_THRESHOLD) -> bool:
    """Verifica se dois termos são duplicatas"""
    norm_a = normalize_term(term_a)
    norm_b = normalize_term(term_b)
    
    # Correspondência exata após normalização
    if norm_a == norm_b:
        return True
    
    # Um contém o outro
    if norm_a in norm_b or norm_b in norm_a:
        return True
    
    # Similaridade de Jaccard
    tokens_a = tokenize(norm_a)
    tokens_b = tokenize(norm_b)
    
    if len(tokens_a) == 0 or len(tokens_b) == 0:
        return False
    
    sim = jaccard_similarity(tokens_a, tokens_b)
    return sim >= threshold


def assign_priority(concept: dict) -> int:
    """
    Atribui prioridade ao conceito para ordenação no RAG.
    Maior número = maior prioridade na recuperação.
    """
    priority = 0
    
    # Alertas clínicos têm alta prioridade
    alert = concept.get('alert_level', 'normal')
    if alert == 'critical':
        priority += 100
    elif alert == 'warning':
        priority += 50
    
    # Conceitos com valores de referência têm prioridade
    if concept.get('reference_values'):
        priority += 30
    
    # Conceitos em português têm prioridade para o contexto brasileiro
    if concept.get('language') == 'pt-BR':
        priority += 20
    
    # Conceitos com mais keywords têm prioridade
    priority += len(concept.get('keywords', [])) * 2
    
    # Conceitos com contexto adicional têm prioridade
    if concept.get('context'):
        priority += 10
    
    return priority


# ─── Mesclagem ────────────────────────────────────────────────────────────────

def load_base(filepath: Path, source_name: str) -> list:
    """Carrega uma base de conhecimento JSON"""
    if not filepath.exists():
        print(f"[Merge] AVISO: {filepath} não encontrado")
        return []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    concepts = data.get('concepts', [])
    print(f"[Merge] Carregado: {source_name} — {len(concepts)} conceitos")
    return concepts


def merge_bases(wallachs: list, caquet: list) -> tuple[list, dict]:
    """
    Mescla as duas bases de conhecimento.
    
    Retorna:
        - Lista de conceitos unificados
        - Estatísticas da mesclagem
    """
    stats = {
        'wallachs_total': len(wallachs),
        'caquet_total': len(caquet),
        'caquet_added': 0,
        'caquet_duplicates': 0,
        'caquet_enriched': 0,
        'total_unified': 0,
    }
    
    # Começar com todos os conceitos do Wallach's (base principal)
    unified = []
    
    # Enriquecer conceitos do Wallach's com metadados
    for i, concept in enumerate(wallachs):
        enriched = {
            **concept,
            'source': 'Wallach\'s Interpretation of Diagnostic Tests - 9th Edition',
            'language': 'en',
            'alert_level': concept.get('alert_level', 'normal'),
            'priority': assign_priority(concept),
        }
        unified.append(enriched)
    
    print(f"[Merge] Base Wallach's: {len(unified)} conceitos carregados")
    
    # Construir índice de termos do Wallach's para deduplicação eficiente
    wallachs_terms = [normalize_term(c['term']) for c in unified]
    wallachs_tokens = [tokenize(t) for t in wallachs_terms]
    
    # Adicionar conceitos do Caquet que não são duplicatas
    print(f"[Merge] Verificando {len(caquet)} conceitos do Caquet para mesclagem...")
    
    for caquet_concept in caquet:
        caquet_term = caquet_concept['term']
        caquet_norm = normalize_term(caquet_term)
        caquet_tokens = tokenize(caquet_norm)
        
        # Verificar se é duplicata de algum conceito do Wallach's
        is_dup = False
        best_match_idx = -1
        best_match_score = 0.0
        
        for j, (w_term, w_tokens) in enumerate(zip(wallachs_terms, wallachs_tokens)):
            # Verificação rápida: correspondência exata
            if caquet_norm == w_term:
                is_dup = True
                best_match_idx = j
                best_match_score = 1.0
                break
            
            # Verificação por contenção
            if caquet_norm in w_term or w_term in caquet_norm:
                sim = 0.9
                if sim > best_match_score:
                    best_match_score = sim
                    best_match_idx = j
            
            # Verificação por Jaccard (apenas se tokens suficientes)
            if len(caquet_tokens) >= 2 and len(w_tokens) >= 2:
                sim = jaccard_similarity(caquet_tokens, w_tokens)
                if sim > best_match_score:
                    best_match_score = sim
                    best_match_idx = j
        
        if best_match_score >= DEDUP_THRESHOLD and best_match_idx >= 0:
            # É uma duplicata — enriquecer o conceito do Wallach's com dados do Caquet
            stats['caquet_duplicates'] += 1
            
            # Adicionar valores de referência em português se disponíveis
            if caquet_concept.get('reference_values'):
                if 'reference_values_pt' not in unified[best_match_idx]:
                    unified[best_match_idx]['reference_values_pt'] = caquet_concept['reference_values']
                    stats['caquet_enriched'] += 1
            
            # Adicionar definição em português como contexto adicional
            if caquet_concept.get('definition') and len(caquet_concept['definition']) > 30:
                existing_context = unified[best_match_idx].get('context_pt', '')
                if not existing_context:
                    unified[best_match_idx]['context_pt'] = caquet_concept['definition'][:300]
                    stats['caquet_enriched'] += 1
            
            # Promover nível de alerta se o Caquet identificou algo crítico
            caquet_alert = caquet_concept.get('alert_level', 'normal')
            current_alert = unified[best_match_idx].get('alert_level', 'normal')
            alert_levels = {'normal': 0, 'warning': 1, 'critical': 2}
            if alert_levels.get(caquet_alert, 0) > alert_levels.get(current_alert, 0):
                unified[best_match_idx]['alert_level'] = caquet_alert
                unified[best_match_idx]['priority'] = assign_priority(unified[best_match_idx])
        
        else:
            # Não é duplicata — adicionar como novo conceito
            new_concept = {
                **caquet_concept,
                'priority': assign_priority(caquet_concept),
            }
            unified.append(new_concept)
            stats['caquet_added'] += 1
    
    stats['total_unified'] = len(unified)
    
    # Ordenar por prioridade (maior prioridade primeiro)
    unified.sort(key=lambda x: x.get('priority', 0), reverse=True)
    
    # Reatribuir IDs sequenciais
    for i, concept in enumerate(unified):
        concept['unified_id'] = f"unified_{i + 1}"
    
    return unified, stats


def generate_chapter_index(unified: list) -> dict:
    """Gera índice de capítulos para navegação rápida"""
    index = defaultdict(list)
    for concept in unified:
        chapter = concept.get('chapter', 'Unknown')
        # Simplificar nome do capítulo
        chapter_key = chapter.split(' - ')[0].strip()[:50]
        index[chapter_key].append(concept['unified_id'])
    return dict(index)


def generate_specialty_index(unified: list) -> dict:
    """Gera índice por especialidade médica"""
    index = defaultdict(list)
    for concept in unified:
        specialty = concept.get('specialty', 'geral')
        index[specialty].append(concept['unified_id'])
    return dict(index)


def generate_alert_index(unified: list) -> dict:
    """Gera índice de conceitos com alertas clínicos"""
    index = {'critical': [], 'warning': [], 'normal': []}
    for concept in unified:
        level = concept.get('alert_level', 'normal')
        if level in index:
            index[level].append({
                'id': concept['unified_id'],
                'term': concept['term'],
                'specialty': concept.get('specialty', 'geral'),
            })
    return index


def main():
    """Função principal de mesclagem"""
    
    print("=" * 60)
    print("MedSuite — Mesclagem de Bases de Conhecimento RAG")
    print("=" * 60)
    
    # Carregar bases
    wallachs = load_base(WALLACHS_JSON, "Wallach's")
    caquet = load_base(CAQUET_JSON, "Caquet")
    
    if not wallachs:
        print("[Merge] ERRO: Base do Wallach's não encontrada. Execute prepare_wallachs_for_rag.py primeiro.")
        return
    
    if not caquet:
        print("[Merge] AVISO: Base do Caquet não encontrada. Usando apenas Wallach's.")
        caquet = []
    
    # Mesclar
    print(f"\n[Merge] Iniciando mesclagem...")
    unified, stats = merge_bases(wallachs, caquet)
    
    # Gerar índices auxiliares
    chapter_index = generate_chapter_index(unified)
    specialty_index = generate_specialty_index(unified)
    alert_index = generate_alert_index(unified)
    
    # Estatísticas por especialidade
    specialty_counts = defaultdict(int)
    source_counts = defaultdict(int)
    for concept in unified:
        specialty_counts[concept.get('specialty', 'geral')] += 1
        source = 'caquet' if concept.get('language') == 'pt-BR' else 'wallachs'
        source_counts[source] += 1
    
    # Salvar base unificada
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    output = {
        "metadata": {
            "title": "MedSuite Unified Clinical Knowledge Base",
            "sources": [
                {
                    "name": "Wallach's Interpretation of Diagnostic Tests - 9th Edition",
                    "language": "en",
                    "concepts": stats['wallachs_total'],
                },
                {
                    "name": "250 Exames de Laboratório: Prescrição e Interpretação - 12ª ed.",
                    "author": "René Caquet",
                    "language": "pt-BR",
                    "concepts": stats['caquet_total'],
                },
            ],
            "totalConcepts": stats['total_unified'],
            "mergeStats": stats,
            "generatedAt": datetime.now().isoformat(),
            "version": "2.0.0",
        },
        "indexes": {
            "byChapter": chapter_index,
            "bySpecialty": specialty_index,
            "byAlertLevel": alert_index,
        },
        "concepts": unified,
    }
    
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    # Salvar estatísticas separadas
    stats_output = {
        "generatedAt": datetime.now().isoformat(),
        "mergeStats": stats,
        "specialtyDistribution": dict(specialty_counts),
        "sourceDistribution": dict(source_counts),
        "alertDistribution": {
            k: len(v) for k, v in alert_index.items()
        },
        "chapterCount": len(chapter_index),
        "specialtyCount": len(specialty_index),
    }
    
    with open(STATS_JSON, 'w', encoding='utf-8') as f:
        json.dump(stats_output, f, ensure_ascii=False, indent=2)
    
    # Relatório final
    print("\n" + "=" * 60)
    print("RELATÓRIO DE MESCLAGEM")
    print("=" * 60)
    print(f"  Wallach's (base principal):   {stats['wallachs_total']:>6} conceitos")
    print(f"  Caquet (base complementar):   {stats['caquet_total']:>6} conceitos")
    print(f"  ─────────────────────────────────────────")
    print(f"  Adicionados do Caquet:        {stats['caquet_added']:>6} conceitos novos")
    print(f"  Duplicatas enriquecidas:      {stats['caquet_duplicates']:>6} conceitos")
    print(f"  Enriquecimentos aplicados:    {stats['caquet_enriched']:>6} campos")
    print(f"  ─────────────────────────────────────────")
    print(f"  TOTAL UNIFICADO:              {stats['total_unified']:>6} conceitos")
    print()
    print("  Distribuição por especialidade:")
    for specialty, count in sorted(specialty_counts.items(), key=lambda x: x[1], reverse=True):
        bar = '█' * (count // 100)
        print(f"    {specialty:<25} {count:>5}  {bar}")
    print()
    print(f"  Alertas críticos:  {len(alert_index.get('critical', []))}")
    print(f"  Alertas de aviso:  {len(alert_index.get('warning', []))}")
    print()
    print(f"  Arquivo gerado: {OUTPUT_JSON}")
    print(f"  Tamanho: {OUTPUT_JSON.stat().st_size / 1024 / 1024:.1f} MB")
    print("=" * 60)


if __name__ == "__main__":
    main()
