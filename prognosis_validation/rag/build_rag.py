import asyncio
import json
import logging
import torch
from pathlib import Path
import time
from sentence_transformers import SentenceTransformer
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete
from lightrag.utils import EmbeddingFunc
from chromadb_manager import start_chroma_server
from dotenv import load_dotenv
from collections import defaultdict
import os
os.environ["TOKENIZERS_PARALLELISM"] = "false"  

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('logs/rag_build.log')
    ]
)
logger = logging.getLogger(__name__)

class AsyncSentenceTransformer:
    """Async wrapper for SentenceTransformer"""
    def __init__(self, model_name: str, device: str = None):
        self.model = SentenceTransformer(model_name)
        if device:
            self.model = self.model.to(device)
        self.model.max_seq_length = 512
        
    async def encode_batch(self, texts: list[str]) -> list:
        """Async encoding of text batches"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.model.encode, texts)

def load_chunks(file_path: str) -> tuple[dict, list]:
    """Load chunks and metadata from JSON file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        return data.get('document_info', {}), data.get('chunks', [])

def format_chunk(chunk: dict) -> str:
    return f"""### MEDICAL DOCUMENT CHUNK
        CONTENT: {chunk['content']}
        SECTION: {chunk['section_type']}
        PAGE: {chunk['page_num']}
        PATIENT_ID: {chunk.get('metadata', {}).get('patient_id', 'N/A')}
        DOC_DATE: {chunk.get('metadata', {}).get('date', 'N/A')}
        KEY_TERMS: {", ".join(chunk.get('metadata', {}).get('keywords', []))}"""


async def create_embedding_function(device: str) -> EmbeddingFunc:
    """Create embedding function using BAAI model"""
    logger.info(f"Initializing BAAI/bge-large-en-v1.5 model on {device}")
    model = AsyncSentenceTransformer("BAAI/bge-large-en-v1.5", device)
    
    # Validate with test input
    test_embedding = await model.encode_batch(["test"])
    logger.info("Model initialization successful")
    
    return EmbeddingFunc(
        embedding_dim=test_embedding.shape[1],
        max_token_size=8192,
        func=model.encode_batch
    )

async def initialize_rag(working_dir: str, embedding_func: EmbeddingFunc) -> LightRAG:
    """Initialize RAG with ChromaDB backend and batch processing configuration"""
    logger.info("Initializing RAG system with ChromaDB backend")
    return LightRAG(
        working_dir=working_dir,
        llm_model_func=gpt_4o_mini_complete,
        embedding_func=embedding_func,
        vector_storage="ChromaVectorDBStorage",
        embedding_batch_num=64,
        addon_params={
            "insert_batch_size": 32
        },
        vector_db_storage_cls_kwargs={
            "host": "localhost",
            "port": 8000,
            "collection_settings": {
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 64,
                "hnsw:search_ef": 32,
                "hnsw:M": 8,
            },
            "graph_validation": {  # Add this
                "require_node_metadata": True,
                "allowed_relation_types": ["medical", "symptom"]
            }
        }
    )

async def process_chunks(chunks: list[dict], rag: LightRAG):
    """Process chunks using LightRAG's built-in batch processing"""
    try:
        # Group chunks by section type
        sections = defaultdict(list)
        for chunk in chunks:
            sections[chunk['section_type']].append(chunk)
        
        total_sections = len(sections)
        total_chunks = len(chunks)
        processed_chunks = 0
        
        # Process each section's chunks
        for section_idx, (section_type, section_chunks) in enumerate(sections.items(), 1):
            # Sort chunks by page number and chunk_id
            section_chunks.sort(key=lambda x: (x['page_num'], x['chunk_id']))
            
            logger.info(f"\nProcessing section {section_idx}/{total_sections}")
            logger.info(f"Section Type: {section_type}")
            
            # Process each chunk in the section
            for chunk in section_chunks:
                processed_chunks += 1
                formatted_chunk = format_chunk(chunk)
                await rag.ainsert([formatted_chunk])
                
                # Log progress
                logger.info(
                    f"Progress: {processed_chunks}/{total_chunks} total chunks -- "
                    f"Section {section_idx}/{total_sections}, "
                    f"Page {chunk['page_num']}, "
                    f"Chunk ID: {chunk['chunk_id']}"
                )
                
                # Small delay every 10 chunks to prevent overwhelming the system
                if processed_chunks % 10 == 0:
                    await asyncio.sleep(0.1)
        
        logger.info(f"\nSuccessfully processed all {total_chunks} chunks from {total_sections} sections")
        
    except Exception as e:
        logger.error(f"Error processing chunks: {str(e)}")
        raise

async def main():
    # Setup paths relative to current directory
    current_dir = Path(__file__).parent
    working_dir = current_dir / "lightrag_cache"
    articles_path = current_dir.parent / "processed" / "personal-injury-sample_processed.json"
    
    # Setup working directory
    working_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Start ChromaDB
        process = start_chroma_server()
        
        # Wait for ChromaDB to be ready
        time.sleep(2)
        
        # Setup device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")
        
        # Load chunks and metadata
        logger.info(f"Loading data from {articles_path}...")
        doc_info, chunks = load_chunks(str(articles_path))
        logger.info(f"Loaded {len(chunks)} chunks")
        logger.info(f"Document processed at: {doc_info.get('processed_at')}")
        logger.info(f"Total sections: {doc_info.get('total_sections')}")
        logger.info(f"Total chunks: {doc_info.get('total_chunks')}")
        
        # Initialize embedding function and RAG
        embedding_func = await create_embedding_function(device)
        rag = await initialize_rag(str(working_dir), embedding_func)
        
        # Process chunks
        logger.info("Starting chunk processing...")
        await process_chunks(chunks, rag)
        logger.info("Successfully completed all chunk processing")
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise

if __name__ == "__main__":
    asyncio.run(main())