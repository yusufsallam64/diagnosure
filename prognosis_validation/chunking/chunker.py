# chunker.py
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
        
        self.combined_break_pattern = regex.compile('|'.join([
            r'(?<=\.)\s+(?=[A-Z])',
            r'(?<=:)\s+',
            r'\n\s*\n',
            r'(?<=\))\s+(?=[A-Z])',
            r'•\s*|\*\s*|[\d]+\.\s*'
        ]), regex.V1)
    
    def _compile_patterns(self):
        self.preserve_patterns = [
            (regex.compile(pattern), f'__PROTECT_{i}__') for i, pattern in enumerate([
                r'\b\d{1,2}/\d{1,2}/\d{2,4}\b',
                r'\b\d+\s*(?:mg|ml|g|kg|mm|cm)\b',
                r'\b(?:Mr\.|Mrs\.|Dr\.|Prof\.)\s+\w+',
                r'\b[A-Z]\d+\.\d+\b',
            ])
        ]
        
        self.measurement_pattern = self.preserve_patterns[1][0]
        self.date_pattern = self.preserve_patterns[0][0]

    @lru_cache(maxsize=1024)
    def _protect_patterns(self, text: str) -> str:
        protected_text = text
        for pattern, replacement in self.preserve_patterns:
            protected_text = pattern.sub(replacement, protected_text)
        return protected_text
    
    @lru_cache(maxsize=1024)
    def _restore_patterns(self, text: str) -> str:
        for i in range(len(self.preserve_patterns)):
            text = text.replace(f'__PROTECT_{i}__', ' ')
        return text

    def chunk_section(self, section) -> List[MedicalChunk]:
        if not section.content.strip():
            return []

        segments = [s.strip() for s in self.combined_break_pattern.split(section.content) if s.strip()]
        
        chunks = []
        current_segments = []
        current_length = 0
        
        for segment in segments:
            segment_length = len(segment)
            
            if current_length + segment_length > self.max_chunk_size and current_segments:
                chunk_content = ' '.join(current_segments)
                chunks.append(self._create_chunk(
                    chunk_content,
                    section.title,
                    section.page_num
                ))
                current_segments = []
                current_length = 0
            
            current_segments.append(segment)
            current_length += segment_length
        
        if current_segments:
            chunk_content = ' '.join(current_segments)
            chunks.append(self._create_chunk(
                chunk_content,
                section.title,
                section.page_num
            ))
        
        return chunks
    
    def _create_chunk(self, 
                     content: str, 
                     section_type: str,
                     page_num: int) -> MedicalChunk:
        chunk_id = f"{section_type}_{page_num}_{int(datetime.now().timestamp())}"
        
        metadata = {
            'section_type': section_type,
            'page_num': page_num,
            'chunk_length': len(content),
            'created_at': datetime.now().isoformat(),
            'contains_measurements': bool(self.measurement_pattern.search(content)),
            'contains_dates': bool(self.date_pattern.search(content))
        }
        
        return MedicalChunk(
            content=content,
            section_type=section_type,
            page_num=page_num,
            chunk_id=chunk_id,
            metadata=metadata
        )