import asyncio
import json
import logging
import torch
from pathlib import Path
from datetime import datetime
from sentence_transformers import SentenceTransformer
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete
from lightrag.utils import EmbeddingFunc
from dotenv import load_dotenv
from collections import defaultdict
import numpy as np
from atlas_storage import MongoVectorStorage 

load_dotenv()

# Configure logging with more detailed format
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
    
    def to(self, device):
        """Forward to() to the underlying model"""
        self.model = self.model.to(device)
        return self
    
def load_chunks(file_path: str) -> tuple[dict, list]:
    """Load chunks and document info from JSON file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        return data.get('document_info', {}), data.get('chunks', [])

def format_chunk(chunk: dict) -> dict:
    """Format chunk into the expected structure"""
    return {
        "content": chunk.get('content', ''),
        "section_type": chunk.get('section_type', ''),
        "page_num": chunk.get('page_num', 1),
        "chunk_id": chunk.get('chunk_id', ''),
        "metadata": {
            "section_type": chunk.get('section_type', ''),
            "page_num": chunk.get('page_num', 1),
            "chunk_length": len(chunk.get('content', '')),
            "created_at": datetime.now().isoformat(),
            "contains_measurements": bool(chunk.get('contains_measurements', False)),
            "contains_dates": bool(chunk.get('contains_dates', False))
        }
    }

async def create_embedding_function(device: str) -> EmbeddingFunc:
    """Create embedding function using BAAI model"""
    logger.info(f"Initializing BAAI/bge-large-en-v1.5 model on {device}")
    
    try:
        model = AsyncSentenceTransformer("BAAI/bge-large-en-v1.5", device)
        
        # Validate with test input
        test_embedding = await model.encode_batch(["test"])
        
        logger.info("Model initialization successful")
        
        async def encode_function(texts: list[str]) -> np.ndarray:
            embeddings = await model.encode_batch(texts)
            return embeddings
        
        return EmbeddingFunc(
            embedding_dim=test_embedding.shape[1],
            max_token_size=8192,
            func=encode_function
        )
        
    except Exception as e:
        logger.error(f"Error initializing model on {device}: {str(e)}")
        if device != "cpu":
            logger.info("Falling back to CPU")
            return await create_embedding_function("cpu")
        raise

async def initialize_rag(working_dir: str, embedding_func: EmbeddingFunc, collection) -> LightRAG:
    # Create storage instance first
    storage = MongoVectorStorage(
        namespace="mongodb_storage",
        global_config={
            "working_dir": working_dir,  # Ensure working_dir is included
            "vector_db_storage_cls_kwargs": {
                "db_name": collection.database.name,
                "collection_name": collection.name
            }
        },
        embedding_func=embedding_func
    )
    
    # Define global_config for LightRAG
    global_config = {
        "working_dir": working_dir,  # Ensure working_dir is included
        "vector_db_storage_cls_kwargs": {
            "db_name": collection.database.name,
            "collection_name": collection.name
        }
    }
    
    return LightRAG(
    working_dir=working_dir,
    llm_model_func=gpt_4o_mini_complete,
    embedding_func=embedding_func,
    vector_storage="MongoVectorStorage",  # Pass the string identifier
    embedding_batch_num=64,
    addon_params={
        "insert_batch_size": 32,
        "cosine_better_than_threshold": 0.2
    }
)

async def process_chunks(chunks: list[dict], rag: LightRAG):
    """Process chunks using LightRAG's built-in batch processing"""
    try:
        total_chunks = len(chunks)
        processed_chunks = 0
        
        # Group chunks by page number for organized processing
        pages = defaultdict(list)
        for chunk in chunks:
            pages[chunk['page_num']].append(chunk)
        
        # Process chunks page by page
        for page_num in sorted(pages.keys()):
            page_chunks = pages[page_num]
            logger.info(f"\nProcessing page {page_num}")
            
            # Process each chunk in the page
            for chunk in page_chunks:
                processed_chunks += 1
                formatted_chunk = format_chunk(chunk)
                
                # Extract the content string before insertion
                await rag.ainsert([formatted_chunk["content"]])  # 🟢 Changed line
                
                # Log progress
                logger.info(
                    f"Progress: {processed_chunks}/{total_chunks} total chunks -- "
                    f"Page {page_num}, "
                    f"Section: {chunk['section_type']}"
                )
                
                # Small delay every 10 chunks to prevent overwhelming the system
                if processed_chunks % 10 == 0:
                    await asyncio.sleep(0.1)
        
        logger.info(f"\nSuccessfully processed all {total_chunks} chunks")
    except Exception as e:
        logger.error(f"Error processing chunks: {str(e)}")
        raise

async def main():
    # Get the current file's directory
    current_dir = Path(__file__).parent
    
    # Setup paths relative to current directory
    working_dir = current_dir / "lightrag_cache"
    articles_path = current_dir.parent / "processed" / "personal-injury-sample_processed.json"
    
    # Setup working directory
    working_dir.mkdir(parents=True, exist_ok=True)
    
    # Get MongoDB collection
    from atlas_manager import get_mongodb
    mongodb = get_mongodb()
    collection = mongodb.get_collection()
    
    print("Collection:", collection.name)
    print("Database:", collection.database.name)
    print("Indexes:", list(collection.list_indexes()))

    # Test basic operations
    test_doc = {"test": "value"}
    collection.insert_one(test_doc)
    print("Test insert successful")

    
    try:
        # Setup device
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
        logger.info(f"Using device: {device}")
        
        # Load chunks and document info
        logger.info(f"Loading medical record from {articles_path}...")
        doc_info, chunks = load_chunks(str(articles_path))  # Convert Path to string
        logger.info(f"Document: {doc_info.get('filename')}")
        logger.info(f"Processed at: {doc_info.get('processed_at')}")
        logger.info(f"Total sections: {doc_info.get('total_sections')}")
        logger.info(f"Total chunks: {doc_info.get('total_chunks')}")
        
        # Initialize embedding function and RAG
        embedding_func = await create_embedding_function(device)
        rag = await initialize_rag(str(working_dir), embedding_func, collection)  # Convert Path to string
        
        # Process chunks
        logger.info("Starting chunk processing...")
        await process_chunks(chunks, rag)
        logger.info("Successfully completed all chunk processing")
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise
    
if __name__ == "__main__":
    asyncio.run(main())