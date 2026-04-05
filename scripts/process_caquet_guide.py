#!/usr/bin/env python3
"""
MedSuite — Processador do Guia Caquet para RAG

Extrai conceitos clínicos estruturados do arquivo Markdown do Guia Completo
de Interpretação de Exames Laboratoriais (René Caquet, 12ª edição) e gera
um JSON compatível com o motor RAG do MedSuite.

Uso:
    python3 scripts/process_caquet_guide.py

Entrada:  /home/ubuntu/upload/GuiaCompleto_InterpretaçãodeExamesLaboratoriais.md
Saída:    data/caquet_concepts.json
"""

import json
import re
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# ─── Configuração ─────────────────────────────────────────────────────────────

INPUT_MD = Path("/home/ubuntu/upload/GuiaCompleto_InterpretaçãodeExamesLaboratoriais.md")
OUTPUT_DIR = Path("/home/ubuntu/medsuite_rag/data")
OUTPUT_JSON = OUTPUT_DIR / "caquet_concepts.json"

# Mapeamento de seções para especialidades médicas
SECTION_SPECIALTIES = {
    "Exames de Laboratórios Comuns": "geral",
    "Parâmetros Bioquímicos": "bioquímica",
    "Gasometria Arterial": "pneumologia",
    "Ionograma Plasmático": "nefrologia",
    "Eletroforese de Proteínas": "hematologia",
    "Urina": "nefrologia",
    "Líquido Cefalorraquidiano": "neurologia",
    "Numeração Globular": "hematologia",
    "Hormônios": "endocrinologia",
    "Ácido": "bioquímica",
    "Albumina": "bioquímica",
    "Anticorpo": "imunologia",
    "Antígeno": "imunologia",
    "Bilirrubina": "gastroenterologia",
    "Cálcio": "endocrinologia",
    "Cloro": "nefrologia",
    "Colesterol": "cardiologia",
    "Cortisol": "endocrinologia",
    "Creatinina": "nefrologia",
    "Ferritina": "hematologia",
    "Ferro": "hematologia",
    "Fator": "hematologia",
    "Glicose": "endocrinologia",
    "Hemoglobina": "hematologia",
    "Infecção": "infectologia",
    "Leucócitos": "hematologia",
    "Lipídios": "cardiologia",
    "Potássio": "nefrologia",
    "Proteína": "bioquímica",
    "Sódio": "nefrologia",
    "Tireoide": "endocrinologia",
    "TSH": "endocrinologia",
    "Ureia": "nefrologia",
    "Vitamina": "bioquímica",
    "CMV": "infectologia",
    "Citomegalovírus": "infectologia",
    "Porfiria": "hematologia",
    "Hemocromatose": "hematologia",
    "Fibrose": "gastroenterologia",
    "von Willebrand": "hematologia",
    "Reumatoide": "imunologia",
    "Lúpus": "imunologia",
    "Antifosfolipídio": "imunologia",
    "Lactato": "bioquímica",
    "Láctico": "bioquímica",
}

MEDICAL_KEYWORDS_PT = {
    "glicose", "hemoglobina", "creatinina", "ureia", "sódio", "potássio",
    "cálcio", "fósforo", "magnésio", "cloreto", "bicarbonato",
    "colesterol", "triglicerídeos", "hdl", "ldl", "vldl",
    "tsh", "t3", "t4", "cortisol", "insulina", "estradiol", "testosterona",
    "psa", "cea", "afp", "ca125", "ferritina", "transferrina", "ferro",
    "leucócitos", "eritrócitos", "hematócrito", "plaquetas",
    "alt", "ast", "ggt", "bilirrubina", "albumina", "fosfatase",
    "pcr", "vhs", "proteína", "imunoglobulina",
    "ácido", "enzima", "anticorpo", "antígeno", "hormônio",
    "anemia", "diabetes", "hipotireoidismo", "hipertireoidismo",
    "renal", "hepático", "cardíaco", "infecção", "inflamação",
    "hipertensão", "cardiovascular", "autoimune", "deficiência",
    "síndrome", "doença", "distúrbio", "insuficiência",
    "elevado", "diminuído", "normal", "anormal", "aumentado", "baixo", "alto",
    "referência", "valor", "interpretação", "diagnóstico",
}

MEDICAL_KEYWORDS_EN = {
    "glucose", "hemoglobin", "creatinine", "urea", "sodium", "potassium",
    "calcium", "cholesterol", "triglycerides", "ferritin", "albumin",
    "elevated", "decreased", "normal", "abnormal", "increased", "low", "high",
}


def extract_keywords(text: str) -> list:
    """Extrai palavras-chave médicas do texto"""
    text_lower = text.lower()
    found = set()
    for kw in MEDICAL_KEYWORDS_PT | MEDICAL_KEYWORDS_EN:
        if kw in text_lower:
            found.add(kw)
    return list(found)[:10]


def detect_specialty(term: str, section: str) -> str:
    """Detecta a especialidade médica com base no termo e seção"""
    combined = f"{term} {section}"
    for key, specialty in SECTION_SPECIALTIES.items():
        if key.lower() in combined.lower():
            return specialty
    return "geral"


def parse_reference_values(text: str) -> dict:
    """Extrai valores de referência do texto"""
    values = {}
    
    # Padrão: "X a Y unidade"
    ranges = re.findall(r'(\d+(?:[.,]\d+)?)\s*a\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zμ/²³]+(?:/[a-zA-Z]+)?)', text)
    if ranges:
        values['ranges'] = [{'min': r[0], 'max': r[1], 'unit': r[2]} for r in ranges[:3]]
    
    # Padrão: "< X unidade" ou "> X unidade"
    limits = re.findall(r'([<>≤≥])\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zμ/²³]+(?:/[a-zA-Z]+)?)', text)
    if limits:
        values['limits'] = [{'operator': l[0], 'value': l[1], 'unit': l[2]} for l in limits[:3]]
    
    return values


def extract_alert_level(text: str) -> str:
    """Determina o nível de alerta clínico do conceito"""
    text_lower = text.lower()
    critical_terms = [
        'urgência', 'hospitalização imediata', 'urgente', 'crítico',
        'intervenção imediata', 'emergência', 'fatal', 'alerta clínico',
        'implica hospitalização', 'paralisias', 'morte', 'risco de vida',
        'anticoagulação urgente', 'valores críticos'
    ]
    warning_terms = [
        'atenção', 'alerta', 'cuidado', 'monitorar', 'vigilância',
        'contraindicado', 'contraindicadas', 'risco', 'complicações',
        'deve ser considerada', 'não tratada'
    ]
    
    for term in critical_terms:
        if term in text_lower:
            return 'critical'
    for term in warning_terms:
        if term in text_lower:
            return 'warning'
    return 'normal'


class CaquetParser:
    """Parser do Guia Caquet para extração de conceitos clínicos"""
    
    def __init__(self, filepath: Path):
        self.filepath = filepath
        self.concepts = []
        self.current_exam = None
        self.current_section = ""
        self.concept_id = 0
    
    def parse(self) -> list:
        """Processa o arquivo Markdown e extrai todos os conceitos"""
        with open(self.filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Extrair tabelas de valores normais (Seção 2)
        self._extract_reference_tables(content)
        
        # Extrair biomarcadores específicos (Seção 3)
        self._extract_biomarkers(content)
        
        # Extrair princípios de interpretação (Seção 4)
        self._extract_principles(content)
        
        # Extrair abreviações (Seção 5)
        self._extract_abbreviations(content)
        
        return self.concepts
    
    def _add_concept(self, term: str, definition: str, section: str, 
                     context: str = "", alert_level: str = "normal",
                     reference_values: dict = None, source_section: str = ""):
        """Adiciona um conceito à lista"""
        if not term or not definition or len(definition) < 15:
            return
        
        self.concept_id += 1
        specialty = detect_specialty(term, section)
        keywords = extract_keywords(f"{term} {definition}")
        
        concept = {
            "id": f"caquet_{self.concept_id}",
            "term": term.strip(),
            "definition": definition.strip(),
            "chapter": section.strip(),
            "specialty": specialty,
            "context": context.strip()[:300],
            "keywords": keywords,
            "source": "Caquet - 250 Exames de Laboratório (12ª ed.)",
            "language": "pt-BR",
            "alert_level": alert_level,
        }
        
        if reference_values:
            concept["reference_values"] = reference_values
        
        self.concepts.append(concept)
    
    def _extract_reference_tables(self, content: str):
        """Extrai valores de referência das tabelas da Seção 2"""
        
        # Tabela 2.1 - Parâmetros Bioquímicos
        table_section = re.search(
            r'### 2\.1 Sangue.*?(?=### 2\.2)', content, re.DOTALL
        )
        if table_section:
            rows = re.findall(
                r'\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|',
                table_section.group()
            )
            for row in rows[1:]:  # Pular cabeçalho
                param, unit_trad, unit_si, significance = [r.strip() for r in row]
                if param and param != '---' and not param.startswith(':'):
                    definition = (
                        f"Valores de referência: {unit_trad} (unidades tradicionais) / "
                        f"{unit_si} (SI). Significado clínico: {significance}."
                    )
                    self._add_concept(
                        term=param,
                        definition=definition,
                        section="Parâmetros Bioquímicos - Sangue",
                        reference_values=parse_reference_values(unit_trad),
                        source_section="2.1"
                    )
        
        # Tabela 2.2 - Gasometria Arterial
        gasometry = re.search(r'### 2\.2 Gasometria Arterial.*?(?=### 2\.3)', content, re.DOTALL)
        if gasometry:
            rows = re.findall(r'\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|', gasometry.group())
            for row in rows[1:]:
                param, values = [r.strip() for r in row]
                if param and param != '---' and not param.startswith(':'):
                    self._add_concept(
                        term=param,
                        definition=f"Valores normais na gasometria arterial: {values}. "
                                   f"Parâmetro fundamental para avaliação do equilíbrio ácido-base e oxigenação.",
                        section="Gasometria Arterial",
                        source_section="2.2"
                    )
        
        # Seção 2.3 - Ionograma
        ionogram_text = (
            "Ionograma plasmático normal: Sódio 137-143 mEq/L, Potássio 3,5-4,5 mEq/L, "
            "Cálcio 95-105 mg/L, Cloretos 100-110 mEq/L, Bicarbonatos 22-26 mEq/L. "
            "Total de ânions e cátions: 155 mEq cada."
        )
        self._add_concept(
            term="Ionograma Plasmático",
            definition=ionogram_text,
            section="Ionograma Plasmático",
            source_section="2.3"
        )
        
        # Seção 2.4 - Eletroforese de Proteínas
        self._add_concept(
            term="Eletroforese de Proteínas Séricas",
            definition=(
                "Frações normais: Albumina 60% (43 g/L), α₁-globulinas 2,5-6% (3 g/L), "
                "α₂-globulinas 6-10% (6 g/L), β-globulinas 10-15% (9 g/L), "
                "γ-globulinas 14-20% (12 g/L). Alterações indicam disproteinemias, "
                "inflamação, doenças hepáticas ou hematológicas."
            ),
            section="Eletroforese de Proteínas Séricas",
            source_section="2.4"
        )
        
        # Tabela 2.5 - Urina
        urine_section = re.search(r'### 2\.5 Urina.*?(?=### 2\.6)', content, re.DOTALL)
        if urine_section:
            rows = re.findall(
                r'\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|',
                urine_section.group()
            )
            for row in rows[1:]:
                param, unit_trad, unit_si = [r.strip() for r in row]
                if param and param != '---' and not param.startswith(':'):
                    self._add_concept(
                        term=f"{param} (urina)",
                        definition=f"Valores de referência urinários: {unit_trad} (unidades tradicionais) / {unit_si} (SI).",
                        section="Parâmetros Urinários",
                        reference_values=parse_reference_values(unit_trad),
                        source_section="2.5"
                    )
        
        # Seção 2.7 - Numeração Globular
        blood_count = re.search(r'### 2\.7 Numeração Globular.*?(?=### 2\.8)', content, re.DOTALL)
        if blood_count:
            rows = re.findall(r'\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|', blood_count.group())
            for row in rows[1:]:
                param, values = [r.strip() for r in row]
                if param and param != '---' and not param.startswith(':'):
                    self._add_concept(
                        term=param,
                        definition=f"Valores normais no hemograma: {values}. "
                                   f"Parâmetro do hemograma completo para avaliação hematológica.",
                        section="Hemograma - Numeração Globular",
                        reference_values=parse_reference_values(values),
                        source_section="2.7"
                    )
        
        # Tabela 2.8 - Hormônios
        hormones = re.search(r'### 2\.8 Hormônios.*?(?=---)', content, re.DOTALL)
        if hormones:
            rows = re.findall(r'\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|', hormones.group())
            for row in rows[1:]:
                param, values = [r.strip() for r in row]
                if param and param != '---' and not param.startswith(':'):
                    self._add_concept(
                        term=param,
                        definition=f"Valores hormonais normais: {values}.",
                        section="Hormônios - Valores de Referência",
                        reference_values=parse_reference_values(values),
                        source_section="2.8"
                    )
    
    def _extract_biomarkers(self, content: str):
        """Extrai biomarcadores específicos da Seção 3"""
        
        # Encontrar todos os biomarcadores (subseções ### 3.x)
        biomarker_sections = re.findall(
            r'### (3\.\d+\s+[^\n]+)\n(.*?)(?=###|\Z)',
            content,
            re.DOTALL
        )
        
        for section_title, section_content in biomarker_sections:
            section_title = section_title.strip()
            # Extrair número e nome do exame
            match = re.match(r'3\.\d+\s+(.*)', section_title)
            if not match:
                continue
            exam_name = match.group(1).strip()
            
            # Extrair significado clínico
            significance_match = re.search(
                r'\*\*Significado Clínico:\*\*\s*\n(.*?)(?=\*\*|\Z)',
                section_content,
                re.DOTALL
            )
            significance = significance_match.group(1).strip() if significance_match else ""
            
            # Extrair valores de referência
            ref_match = re.search(
                r'\*\*Valores de Referência:\*\*\s*\n(.*?)(?=\*\*|\Z)',
                section_content,
                re.DOTALL
            )
            ref_text = ref_match.group(1).strip() if ref_match else ""
            
            # Extrair orientações de coleta
            collection_match = re.search(
                r'\*\*Orientações sobre Coleta:\*\*\s*\n(.*?)(?=\*\*|\Z)',
                section_content,
                re.DOTALL
            )
            collection_text = collection_match.group(1).strip() if collection_match else ""
            
            # Extrair interpretações clínicas
            interp_match = re.search(
                r'\*\*Interpretações Clínicas:\*\*\s*\n(.*?)(?=---|\Z)',
                section_content,
                re.DOTALL
            )
            interp_text = interp_match.group(1).strip() if interp_match else ""
            
            # Montar definição principal
            definition_parts = []
            if significance:
                definition_parts.append(f"Significado clínico: {significance}")
            if ref_text:
                # Limpar formatação markdown
                ref_clean = re.sub(r'[-*]\s+', '', ref_text).replace('\n', '; ')
                definition_parts.append(f"Valores de referência: {ref_clean[:200]}")
            
            if definition_parts:
                definition = ". ".join(definition_parts)
                alert_level = extract_alert_level(section_content)
                
                self._add_concept(
                    term=exam_name,
                    definition=definition,
                    section=f"Biomarcadores Específicos - {exam_name}",
                    context=collection_text[:200] if collection_text else "",
                    alert_level=alert_level,
                    reference_values=parse_reference_values(ref_text) if ref_text else None,
                    source_section=section_title
                )
            
            # Extrair sub-condições clínicas (####)
            sub_conditions = re.findall(
                r'#### ([^\n]+)\n(.*?)(?=####|###|\Z)',
                section_content,
                re.DOTALL
            )
            
            for condition_name, condition_content in sub_conditions:
                condition_name = condition_name.strip()
                condition_content = condition_content.strip()
                
                if len(condition_content) < 30:
                    continue
                
                # Criar conceito para cada condição clínica
                full_definition = (
                    f"{exam_name} — {condition_name}: "
                    f"{condition_content[:400].strip()}"
                )
                
                alert_level = extract_alert_level(condition_content)
                
                self._add_concept(
                    term=f"{exam_name} — {condition_name}",
                    definition=full_definition,
                    section=f"Interpretação Clínica - {exam_name}",
                    alert_level=alert_level,
                    source_section=section_title
                )
    
    def _extract_principles(self, content: str):
        """Extrai princípios fundamentais de interpretação (Seção 4)"""
        
        principles_section = re.search(
            r'## 4\. Princípios Fundamentais.*?(?=## 5\.)',
            content,
            re.DOTALL
        )
        
        if not principles_section:
            return
        
        principles_text = principles_section.group()
        
        # Extrair subseções
        subsections = re.findall(
            r'### (4\.\d+\s+[^\n]+)\n(.*?)(?=###|\Z)',
            principles_text,
            re.DOTALL
        )
        
        for title, body in subsections:
            title = title.strip()
            body = body.strip()
            
            if len(body) < 50:
                continue
            
            # Limpar markdown
            clean_body = re.sub(r'\*\*([^*]+)\*\*', r'\1', body)
            clean_body = re.sub(r'[-*]\s+', '', clean_body)
            clean_body = re.sub(r'\n+', ' ', clean_body).strip()
            
            match = re.match(r'4\.\d+\s+(.*)', title)
            term = match.group(1) if match else title
            
            self._add_concept(
                term=f"Princípio: {term}",
                definition=clean_body[:500],
                section="Princípios de Interpretação Laboratorial",
                source_section=title
            )
    
    def _extract_abbreviations(self, content: str):
        """Extrai tabela de abreviações (Seção 5)"""
        
        abbrev_section = re.search(
            r'## 5\. Abreviações.*?(?=## 6\.)',
            content,
            re.DOTALL
        )
        
        if not abbrev_section:
            return
        
        rows = re.findall(
            r'\|\s*([A-ZÁÉÍÓÚ/\-\d]+)\s*\|\s*([^|]+?)\s*\|',
            abbrev_section.group()
        )
        
        for abbrev, meaning in rows:
            abbrev = abbrev.strip()
            meaning = meaning.strip()
            if abbrev and meaning and abbrev != 'Abreviação' and not abbrev.startswith(':'):
                self._add_concept(
                    term=abbrev,
                    definition=f"Abreviação laboratorial: {abbrev} = {meaning}. "
                               f"Termo utilizado em exames e laudos médicos.",
                    section="Abreviações e Terminologia Laboratorial",
                    source_section="5"
                )
        
        # Adicionar conceito consolidado de abreviações críticas
        self._add_concept(
            term="Abreviações Laboratoriais Essenciais",
            definition=(
                "Principais abreviações em laudos: ALT/ALAT (alanina aminotransferase), "
                "AST/ASAT (aspartato aminotransferase), BNP (fator natriurético tipo B), "
                "CK/CPK (creatinoquinase), CRP/PCR (proteína C-reativa), "
                "DFG (taxa de filtração glomerular), FSH (hormônio folículo-estimulante), "
                "GH (hormônio do crescimento), HDL/LDL (lipoproteínas), "
                "INR (razão normalizada internacional), LDH (desidrogenase láctica), "
                "PSA (antígeno prostático específico), TSH (hormônio tireoestimulante), "
                "VS/VHS (velocidade de sedimentação globular)."
            ),
            section="Abreviações e Terminologia Laboratorial",
            source_section="5"
        )


def process_caquet():
    """Função principal de processamento"""
    
    if not INPUT_MD.exists():
        print(f"[Erro] Arquivo não encontrado: {INPUT_MD}")
        return
    
    print(f"[Caquet] Processando: {INPUT_MD.name}")
    print(f"[Caquet] Tamanho: {INPUT_MD.stat().st_size / 1024:.1f} KB")
    
    parser = CaquetParser(INPUT_MD)
    concepts = parser.parse()
    
    print(f"[Caquet] {len(concepts)} conceitos extraídos")
    
    # Estatísticas por especialidade
    by_specialty = defaultdict(int)
    by_alert = defaultdict(int)
    for c in concepts:
        by_specialty[c['specialty']] += 1
        by_alert[c['alert_level']] += 1
    
    print("\n[Caquet] Distribuição por especialidade:")
    for specialty, count in sorted(by_specialty.items(), key=lambda x: x[1], reverse=True):
        print(f"  {specialty}: {count} conceitos")
    
    print("\n[Caquet] Níveis de alerta:")
    for level, count in sorted(by_alert.items(), key=lambda x: x[1], reverse=True):
        print(f"  {level}: {count} conceitos")
    
    # Salvar JSON
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    output = {
        "metadata": {
            "source": "250 Exames de Laboratório: Prescrição e Interpretação - 12ª edição",
            "author": "René Caquet",
            "translator": "Laís Medeiros, Bruna Steffens, Janyne Martini",
            "publisher": "Thieme Revinter Publicações, 2017",
            "isbn": "978-85-67661-45-2",
            "language": "pt-BR",
            "totalConcepts": len(concepts),
            "generatedAt": datetime.now().isoformat(),
            "version": "1.0.0",
        },
        "concepts": concepts,
    }
    
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n[Caquet] Conceitos salvos em: {OUTPUT_JSON}")
    print(f"[Caquet] Tamanho: {OUTPUT_JSON.stat().st_size / 1024:.1f} KB")
    
    # Mostrar amostra
    print("\n[Caquet] Amostra de conceitos extraídos:")
    for concept in concepts[:5]:
        print(f"  [{concept['specialty']}] {concept['term']}")
        print(f"    → {concept['definition'][:100]}...")
    
    return concepts


if __name__ == "__main__":
    process_caquet()
