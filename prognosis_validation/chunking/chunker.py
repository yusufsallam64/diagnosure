from typing import List, Dict, Any
import regex
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache

@dataclass
class MedicalChunk:
    content: str
    section_type: str
    page_num: int
    chunk_id: str
    metadata: Dict[str, Any]

class MedicalDocumentChunker:
    def __init__(self, 
                 max_chunk_size: int = 500,
                 min_chunk_size: int = 100):
        self.max_chunk_size = max_chunk_size
        self.min_chunk_size = min_chunk_size
        
        self._compile_patterns()
        
        self.combined_break_pattern = regex.compile(
            r'(?<=\.)\s+(?=[A-Z])|(?<=:)\s+|\n\s*\n|(?<=\))\s+(?=[A-Z])|•\s*|\*\s*|[\d]+\.\s*',
            regex.V1
        )

    def _compile_patterns(self):
        self.preserve_patterns = [
            (regex.compile(pattern), f'__PROTECT_{i}__') for i, pattern in enumerate([
                r'\b\d{1,2}/\d{1,2}/\d{2,4}\b',
                r'\b\d+\s*(?:mg|ml|g|kg|mm|cm|%)\b',
                r'\b(?:Dr\.|Pt\.|Rx)\s+\w+',
                r'\b[A-Z]{2,5}\d{3,}\b',
                r'\b(?:qid|bid|tid|qd|prn)\b',
                r'\b\d+\s*(?:x|times)\s*per\s+day\b',
                r'\b(?:BP|HR|RR|SpO2)\s*:\s*\d+',
                r'\b[A-Z]\d+\.\d+\b',
            ])
        ]
        
        self.measurement_pattern = regex.compile(r'\b\d+\s*(?:mg|ml|g|kg)\b')
        self.date_pattern = regex.compile(r'\b\d{1,2}/\d{1,2}/\d{2,4}\b')
        self.code_pattern = regex.compile(r'\b[A-Z]\d+\.\d+\b')

    @lru_cache(maxsize=1024)
    def _protect_patterns(self, text: str) -> str:
        protected_text = text
        for pattern, replacement in self.preserve_patterns:
            protected_text = pattern.sub(replacement, protected_text)
        return protected_text

    @lru_cache(maxsize=1024)
    def _restore_patterns(self, text: str) -> str:
        restored_text = text
        for i in range(len(self.preserve_patterns)):
            restored_text = restored_text.replace(f'__PROTECT_{i}__', ' ')
        return restored_text

    def chunk_section(self, section) -> List[MedicalChunk]:
        if not section.content.strip():
            return []

        if section.title == "table":
            return [self._create_chunk(
                f"TABLE:\n{section.content}",
                "table",
                section.page_num
            )]

        protected_text = self._protect_patterns(section.content)
        segments = [s.strip() for s in self.combined_break_pattern.split(protected_text) if s.strip()]
        
        chunks = []
        current_chunk = []
        current_length = 0
        
        for segment in segments:
            restored_segment = self._restore_patterns(segment)
            seg_length = len(restored_segment)
            
            if current_length + seg_length > self.max_chunk_size and current_chunk:
                chunks.append(self._create_chunk(
                    " ".join(current_chunk),
                    section.title,
                    section.page_num
                ))
                current_chunk = []
                current_length = 0
            
            current_chunk.append(restored_segment)
            current_length += seg_length
            
            if any(p.search(restored_segment) for p in [self.measurement_pattern, self.date_pattern]):
                chunks.append(self._create_chunk(
                    " ".join(current_chunk),
                    section.title,
                    section.page_num
                ))
                current_chunk = []
                current_length = 0
        
        if current_chunk:
            chunks.append(self._create_chunk(
                " ".join(current_chunk),
                section.title,
                section.page_num
            ))
        
        return chunks

    def _create_chunk(self, content: str, section_type: str, page_num: int) -> MedicalChunk:
        metadata = {
            'section_type': section_type,
            'page_num': page_num,
            'chunk_length': len(content),
            'created_at': datetime.now().isoformat(),
            'contains_measurements': bool(self.measurement_pattern.search(content)),
            'contains_dates': bool(self.date_pattern.search(content)),
            'contains_codes': bool(self.code_pattern.search(content)),
            'is_table': section_type == "table"
        }
        
        return MedicalChunk(
            content=content,
            section_type=section_type,
            page_num=page_num,
            chunk_id=f"{section_type}_{page_num}_{hash(content)}",
            metadata=metadata
        )