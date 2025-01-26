import json
import logging
import argparse
import logging.config
from pathlib import Path
from typing import Dict, List
from datetime import datetime
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
import os

# Import our processors
from chunking.parallel_processor import ParallelMedicalDocumentProcessor
from chunking.chunker import MedicalDocumentChunker, MedicalChunk

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ParallelMedicalDocumentPipeline:
    """Orchestrates the complete document processing pipeline with watermark removal and parallel processing"""
    
    def __init__(self, 
                 data_dir: str = 'data',
                 output_dir: str = 'processed',
                 chunk_size: int = 500,
                 max_workers: int = None):
        
        # Validate directories
        self.data_dir = Path(data_dir)
        if not self.data_dir.exists():
            raise FileNotFoundError(f"Data directory {data_dir} not found")
            
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True, parents=True)
        
        # Configure workers
        self.max_workers = max_workers or min(os.cpu_count(), 4)  # Prevent over-subscription
        logger.info(f"Initializing pipeline with {self.max_workers} workers")
        
        # Initialize processors
        self.doc_processor = ParallelMedicalDocumentProcessor(
            output_dir=str(output_dir),
            max_workers=self.max_workers
        )
        self.chunker = MedicalDocumentChunker(max_chunk_size=chunk_size)

    def process_document(self, pdf_path: Path) -> Dict:
        """Process a single document with watermark removal and enhanced error handling"""
        logger.info(f"Starting processing of {pdf_path.name}")
        document_data = None
        
        try:
            # Step 1: Parallel OCR Processing with watermark removal
            sections = self.doc_processor.process_pdf(str(pdf_path))
            logger.info(f"Found {len(sections)} sections in {pdf_path.name}")
            
            # Step 2: Parallel Chunking with process pool
            with ProcessPoolExecutor(max_workers=self.max_workers) as executor:
                futures = [executor.submit(self.chunker.chunk_section, section) 
                          for section in sections]
                
                all_chunks = []
                for future in as_completed(futures):
                    try:
                        chunks = future.result()
                        all_chunks.extend(chunks)
                    except Exception as e:
                        logger.error(f"Chunking error in {pdf_path.name}: {e}")
                        
            logger.info(f"Created {len(all_chunks)} chunks from {pdf_path.name}")
            
            # Step 3: Prepare output
            document_data = {
                'document_info': {
                    'filename': pdf_path.name,
                    'processed_at': datetime.utcnow().isoformat(),
                    'total_sections': len(sections),
                    'total_chunks': len(all_chunks)
                },
                'chunks': [self._serialize_chunk(chunk) for chunk in all_chunks]
            }

        except Exception as e:
            logger.error(f"Critical error processing {pdf_path.name}: {str(e)}")
            raise
        
        return document_data
    
    def _serialize_chunk(self, chunk: MedicalChunk) -> Dict:
        """Ensure datetime serialization in metadata"""
        return {
            'content': chunk.content,
            'section_type': chunk.section_type,
            'page_num': chunk.page_num,
            'chunk_id': chunk.chunk_id,
            'metadata': {
                **chunk.metadata,
                'created_at': chunk.metadata['created_at']  # Already ISO formatted
            }
        }

def process_single_file(pdf_path: Path, pipeline: ParallelMedicalDocumentPipeline) -> bool:
    """Wrapper function for parallel file processing"""
    try:
        output_path = pipeline.output_dir / f"{pdf_path.stem}_processed.json"
        
        if output_path.exists():
            logger.info(f"Skipping already processed file: {pdf_path.name}")
            return True
            
        processed_data = pipeline.process_document(pdf_path)
        pipeline.save_processed_data(processed_data, output_path)
        return True
    except Exception as e:
        logger.error(f"Failed to process {pdf_path.name}: {str(e)}")
        return False

def main():
    # Configure command line arguments
    parser = argparse.ArgumentParser(description='Medical Document Processing Pipeline')
    parser.add_argument('--data-dir', default='data', help='Input directory for PDFs')
    parser.add_argument('--output-dir', default='processed', help='Output directory')
    parser.add_argument('--chunk-size', type=int, default=500, help='Maximum chunk size')
    parser.add_argument('--max-workers', type=int, default=None, help='Maximum parallel workers')
    args = parser.parse_args()
    
    # Initialize pipeline
    pipeline = ParallelMedicalDocumentPipeline(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        chunk_size=args.chunk_size,
        max_workers=args.max_workers
    )
    
    # Get all PDF files
    pdf_files = list(pipeline.data_dir.glob('*.pdf'))
    if not pdf_files:
        logger.warning(f"No PDF files found in {pipeline.data_dir}")
        return
    
    # Process files in parallel
    with ProcessPoolExecutor(max_workers=pipeline.max_workers) as executor:
        futures = {
            executor.submit(process_single_file, pdf_path, pipeline): pdf_path
            for pdf_path in pdf_files
        }
        
        for future in as_completed(futures):
            pdf_path = futures[future]
            try:
                success = future.result()
                if success:
                    logger.info(f"Completed processing: {pdf_path.name}")
            except Exception as e:
                logger.error(f"Unexpected error with {pdf_path.name}: {str(e)}")

if __name__ == "__main__":
    main()