from typing import List, Dict, Any
import re
from dataclasses import dataclass
from datetime import datetime

@dataclass
class MedicalChunk:
    """Represents a chunk of medical text with metadata"""
    content: str
    section_type: str
    page_num: int
    chunk_id: str
    metadata: Dict[str, Any]

class MedicalDocumentChunker:
    """Handles chunking of medical documents with domain-specific logic"""
    
    def __init__(self, 
                 max_chunk_size: int = 500,
                 min_chunk_size: int = 100):
        self.max_chunk_size = max_chunk_size
        self.min_chunk_size = min_chunk_size
        
        # Patterns that should not be split
        self.preserve_patterns = [
            r'\b\d{1,2}/\d{1,2}/\d{2,4}\b',  # Dates
            r'\b\d+\s*(?:mg|ml|g|kg|mm|cm)\b',  # Measurements
            r'\b(?:Mr\.|Mrs\.|Dr\.|Prof\.)\s+\w+',  # Titles
            r'\b[A-Z]\d+\.\d+\b',  # Medical codes
        ]
        
        # Patterns that indicate logical breaks
        self.break_patterns = [
            r'(?<=\.)\s+(?=[A-Z])',  # Sentence endings
            r'(?<=:)\s+',  # After colons
            r'\n\s*\n',  # Double line breaks
            r'(?<=\))\s+(?=[A-Z])',  # After closing parentheses
            r'•\s*|\*\s*|[\d]+\.\s*',  # List markers
        ]

    def chunk_section(self, section: 'MedicalSection') -> List[MedicalChunk]:
        """Convert a medical section into appropriate chunks"""
        chunks = []
        content = section.content
        
        # Protect patterns that shouldn't be split
        protected_content = self._protect_patterns(content)
        
        # Split into initial segments
        segments = self._split_into_segments(protected_content)
        
        # Combine segments into appropriate chunks
        current_chunk = []
        current_length = 0
        
        for segment in segments:
            # Restore protected patterns
            segment = self._restore_patterns(segment)
            segment_length = len(segment)
            
            if current_length + segment_length > self.max_chunk_size and current_chunk:
                # Create chunk from accumulated segments
                chunks.append(self._create_chunk(
                    ' '.join(current_chunk),
                    section.title,
                    section.page_num
                ))
                current_chunk = []
                current_length = 0
            
            current_chunk.append(segment)
            current_length += segment_length
        
        # Don't forget the last chunk
        if current_chunk:
            chunks.append(self._create_chunk(
                ' '.join(current_chunk),
                section.title,
                section.page_num
            ))
        
        return chunks
    
    def _protect_patterns(self, text: str) -> str:
        """Protect certain patterns from being split"""
        protected_text = text
        for pattern in self.preserve_patterns:
            protected_text = re.sub(
                pattern,
                lambda m: m.group().replace(' ', '█'),
                protected_text
            )
        return protected_text
    
    def _restore_patterns(self, text: str) -> str:
        """Restore protected patterns"""
        return text.replace('█', ' ')
    
    def _split_into_segments(self, text: str) -> List[str]:
        """Split text into logical segments"""
        segments = [text]
        
        for pattern in self.break_patterns:
            new_segments = []
            for segment in segments:
                splits = re.split(pattern, segment)
                new_segments.extend(s.strip() for s in splits if s.strip())
            segments = new_segments
        
        return segments
    
    def _create_chunk(self, 
                     content: str, 
                     section_type: str,
                     page_num: int) -> MedicalChunk:
        """Create a chunk with appropriate metadata"""
        chunk_id = f"{section_type}_{page_num}_{datetime.now().timestamp()}"
        
        metadata = {
            'section_type': section_type,
            'page_num': page_num,
            'chunk_length': len(content),
            'created_at': datetime.now().isoformat(),
            'contains_measurements': bool(re.search(self.preserve_patterns[1], content)),
            'contains_dates': bool(re.search(self.preserve_patterns[0], content))
        }
        
        return MedicalChunk(
            content=content,
            section_type=section_type,
            page_num=page_num,
            chunk_id=chunk_id,
            metadata=metadata
        )