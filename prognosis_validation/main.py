# main.py
import json
import logging
from pathlib import Path
from typing import Dict, List
from datetime import datetime

# Import our processor and chunker
from ocr.pdf_processor import MedicalDocumentProcessor
from chunking.chunker import MedicalDocumentChunker, MedicalChunk

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MedicalDocumentPipeline:
    """Orchestrates the complete document processing pipeline"""
    
    def __init__(self, 
                 data_dir: str = 'data',
                 output_dir: str = 'processed',
                 chunk_size: int = 500):
        # Initialize paths
        self.data_dir = Path(data_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        # Initialize processors
        self.doc_processor = MedicalDocumentProcessor(output_dir=str(output_dir))
        self.chunker = MedicalDocumentChunker(max_chunk_size=chunk_size)
        
    def process_document(self, pdf_path: Path) -> Dict:
        """Process a single medical document"""
        logger.info(f"Starting processing of {pdf_path}")
        
        try:
            # Step 1: OCR Processing
            sections = self.doc_processor.process_pdf(str(pdf_path))
            logger.info(f"Found {len(sections)} sections in document")
            
            # Step 2: Chunking
            all_chunks = []
            for section in sections:
                chunks = self.chunker.chunk_section(section)
                all_chunks.extend(chunks)
            
            logger.info(f"Created {len(all_chunks)} chunks from sections")
            
            # Step 3: Prepare output data
            document_data = {
                'document_info': {
                    'filename': pdf_path.name,
                    'processed_at': datetime.now().isoformat(),
                    'total_sections': len(sections),
                    'total_chunks': len(all_chunks)
                },
                'chunks': [self._serialize_chunk(chunk) for chunk in all_chunks]
            }
            
            return document_data
            
        except Exception as e:
            logger.error(f"Error processing document {pdf_path}: {e}")
            raise
    
    def _serialize_chunk(self, chunk: MedicalChunk) -> Dict:
        """Convert a chunk object to serializable dictionary"""
        return {
            'content': chunk.content,
            'section_type': chunk.section_type,
            'page_num': chunk.page_num,
            'chunk_id': chunk.chunk_id,
            'metadata': chunk.metadata
        }
    
    def save_processed_data(self, data: Dict, output_path: Path) -> None:
        """Save processed document data to JSON"""
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved processed data to {output_path}")
        except Exception as e:
            logger.error(f"Error saving data to {output_path}: {e}")
            raise

def main():
    # Initialize pipeline
    pipeline = MedicalDocumentPipeline()
    
    # Process all PDFs in data directory
    for pdf_path in pipeline.data_dir.glob('*.pdf'):
        try:
            # Generate output path
            output_path = pipeline.output_dir / f"{pdf_path.stem}_processed.json"
            
            # Process document
            processed_data = pipeline.process_document(pdf_path)
            
            # Save results
            pipeline.save_processed_data(processed_data, output_path)
            
            logger.info(f"Successfully processed {pdf_path}")
            
        except Exception as e:
            logger.error(f"Failed to process {pdf_path}: {e}")
            continue

if __name__ == "__main__":
    main()