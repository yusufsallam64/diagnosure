import asyncio
import argparse
from pathlib import Path
import numpy as np
from typing import List, Dict, Any
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete
from sentence_transformers import SentenceTransformer
from lightrag.utils import EmbeddingFunc
import logging
import socket
import subprocess
import sys
import time
import requests
import atexit
from dotenv import load_dotenv

load_dotenv()

# Configure logging with more detailed format
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('logs/query.log')
    ]
)
logger = logging.getLogger(__name__)

# Default questions
DEFAULT_QUESTIONS = [
    "Content: MM/DD/YYYY Injury Report: DESCRIPTION DETAILS Prior injury details Neck strain Headaches Cervical disc disease Right arm paresthesias Cervical radiculopathy Brachial neuritis Left arm pain and paresthesias Cervicalgia Lumbago © Date of injury Ss MM/DD/YYYY Description of injury ded while Injuries as a result of accident The patient was a restrained driver of a vehicle that was r stopped at a red light.\nSection Type: patient_info\nPage: 2\nChunk ID: patient_info_2_1737791635\nMetadata: {\n  \"section_type\": \"patient_info\",\n  \"page_num\": 2,\n  \"chunk_length\": 405,\n  \"created_at\": \"2025-01-25T02:53:55.937639\",\n  \"contains_measurements\": false,\n  \"contains_dates\": false\n"
]

class EmbeddingDebugger:
    def __init__(self, logger=None):
        self.logger = logger or logging.getLogger(__name__)
        self.total_comparisons = 0
        self.failed_comparisons = 0
        self.similarity_stats = {
            'min': float('inf'),
            'max': float('-inf'),
            'avg': 0.0
        }
        
    def validate_embedding(self, embedding: np.ndarray, source: str) -> bool:
        """Validate a single embedding vector"""
        if embedding is None:
            self.logger.error(f"Embedding from {source} is None")
            return False
            
        if not isinstance(embedding, np.ndarray):
            self.logger.error(f"Invalid embedding type from {source}: {type(embedding)}")
            return False
            
        if np.isnan(embedding).any():
            self.logger.error(f"NaN values detected in embedding from {source}")
            return False
            
        if np.isinf(embedding).any():
            self.logger.error(f"Infinite values detected in embedding from {source}")
            return False
            
        return True
        
    def compare_embeddings(self, query_embedding: np.ndarray, 
                          db_embedding: np.ndarray,
                          metadata: Dict[str, Any] = None) -> float:
        """Compare two embeddings and log results"""
        self.total_comparisons += 1
        
        # Validate embeddings
        if not (self.validate_embedding(query_embedding, "query") and 
                self.validate_embedding(db_embedding, "database")):
            self.failed_comparisons += 1
            return 0.0
            
        # Check dimensionality match
        if query_embedding.shape != db_embedding.shape:
            self.logger.error(
                f"Embedding dimension mismatch: query {query_embedding.shape} "
                f"vs db {db_embedding.shape}"
            )
            self.failed_comparisons += 1
            return 0.0
            
        # Compute cosine similarity
        similarity = np.dot(query_embedding, db_embedding) / (
            np.linalg.norm(query_embedding) * np.linalg.norm(db_embedding)
        )
        
        # Update statistics
        self.similarity_stats['min'] = min(self.similarity_stats['min'], similarity)
        self.similarity_stats['max'] = max(self.similarity_stats['max'], similarity)
        self.similarity_stats['avg'] = (
            (self.similarity_stats['avg'] * (self.total_comparisons - 1) + similarity) 
            / self.total_comparisons
        )
        
        # Log comparison details
        if metadata:
            self.logger.debug(
                f"Embedding comparison results:\n"
                f"Similarity: {similarity:.4f}\n"
                f"Metadata: {metadata}"
            )
            
        return similarity
        
    def get_statistics(self) -> Dict[str, Any]:
        """Get current statistics"""
        return {
            'total_comparisons': self.total_comparisons,
            'failed_comparisons': self.failed_comparisons,
            'failure_rate': (
                self.failed_comparisons / self.total_comparisons 
                if self.total_comparisons > 0 else 0
            ),
            'similarity_stats': self.similarity_stats
        }
        
    def reset_statistics(self):
        """Reset all statistics"""
        self.total_comparisons = 0
        self.failed_comparisons = 0
        self.similarity_stats = {
            'min': float('inf'),
            'max': float('-inf'),
            'avg': 0.0
        }

def is_port_in_use(port: int) -> bool:
    """Check if the ChromaDB port is in use"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def cleanup_server(port: int) -> None:
    """Stop any existing ChromaDB server process"""
    if is_port_in_use(port):
        logger.info("Cleaning up existing ChromaDB server...")
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/IM", "chroma.exe"], 
                         shell=True, check=False)
        else:
            subprocess.run(["pkill", "-f", "chroma"], check=False)
        time.sleep(2)

def start_chroma_server(data_dir: str = "./chroma_db", port: int = 8000) -> subprocess.Popen:
    """Start ChromaDB server as a persistent process"""
    try:
        # Clean up any existing server
        cleanup_server(port)
        
        # Create data directory
        Path(data_dir).mkdir(parents=True, exist_ok=True)
        
        logger.info("Starting ChromaDB server...")
        process = subprocess.Popen(
            ["chroma", "run", "--path", str(data_dir)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Register cleanup on program exit
        atexit.register(lambda: cleanup_server(port))
        
        # Wait for server to start with enhanced health check
        max_retries = 5
        for i in range(max_retries):
            if is_port_in_use(port):
                try:
                    response = requests.get(f"http://localhost:{port}/api/v1/heartbeat")
                    if response.status_code == 200:
                        # Additional health check
                        response = requests.get(f"http://localhost:{port}/api/v1/version")
                        if response.status_code == 200:
                            logger.info("ChromaDB server started and healthy")
                            return process
                except requests.RequestException as e:
                    logger.warning(f"Server health check attempt {i+1} failed: {str(e)}")
            time.sleep(3)
            
        raise RuntimeError("Failed to start ChromaDB server")
            
    except Exception as e:
        logger.error(f"Error starting ChromaDB: {str(e)}")
        cleanup_server(port)
        raise

class MonitoredAsyncSentenceTransformer:
    """Enhanced Async wrapper for SentenceTransformer with monitoring"""
    def __init__(self, model_name: str, device: str = None):
        self.model = SentenceTransformer(model_name)
        if device:
            self.model = self.model.to(device)
        self.model.max_seq_length = 512
        self.embedding_debugger = EmbeddingDebugger(logger)
        
    async def encode_batch(self, texts: list[str]) -> list:
        """Async encoding of text batches with validation"""
        loop = asyncio.get_event_loop()
        try:
            embeddings = await loop.run_in_executor(None, self.model.encode, texts)
            
            # Validate each embedding in the batch
            valid_embeddings = []
            for idx, embedding in enumerate(embeddings):
                if self.embedding_debugger.validate_embedding(embedding, f"batch_item_{idx}"):
                    valid_embeddings.append(embedding)
                else:
                    logger.warning(f"Invalid embedding detected for text: {texts[idx][:100]}...")
                    valid_embeddings.append(np.zeros_like(embeddings[0]))  # Fallback embedding
                    
            return valid_embeddings
            
        except Exception as e:
            logger.error(f"Error in encode_batch: {str(e)}")
            raise

async def initialize_rag(working_dir: str, embedding_func: EmbeddingFunc) -> LightRAG:
    """Initialize RAG with ChromaDB backend and GPT-4-Mini model"""
    logger.info("Initializing RAG system...")
    
    # Verify ChromaDB connection
    try:
        response = requests.get("http://localhost:8000/api/v1/heartbeat")
        if response.status_code != 200:
            raise ConnectionError("ChromaDB server is not responding correctly")
        logger.info("ChromaDB connection verified")
        
        # Initialize LightRAG with minimal configuration first
        rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=gpt_4o_mini_complete,
            embedding_func=embedding_func,
            vector_storage="ChromaVectorDBStorage",
            embedding_batch_num=32
        )
        
        # Configure ChromaDB settings
        rag.vector_db_storage_cls_kwargs = {
            "host": "localhost",
            "port": 8000,
            "collection_settings": {
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 64,
                "hnsw:search_ef": 32,
                "hnsw:M": 8,
            }
        }
        
        return rag
        
    except requests.RequestException as e:
        logger.error(f"Failed to connect to ChromaDB: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error initializing RAG: {str(e)}")
        raise
    return LightRAG(
        working_dir=working_dir,
        llm_model_func=gpt_4o_mini_complete,
        embedding_func=embedding_func,
        vector_storage="ChromaVectorDBStorage",
        embedding_batch_num=32,
        vector_db_storage_cls_kwargs={
            "host": "localhost",
            "port": 8000,
            "collection_settings": {
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 64,
                "hnsw:search_ef": 32,
                "hnsw:M": 8,
            },
            "health_check_interval": 60,
            "logging_level": "DEBUG"
        }
    )

async def create_embedding_function(device: str) -> EmbeddingFunc:
    """Create embedding function using BAAI model with monitoring"""
    model = MonitoredAsyncSentenceTransformer("BAAI/bge-large-en-v1.5", device)
    
    # Validate with test input
    test_embedding = await model.encode_batch(["test"])
    if not model.embedding_debugger.validate_embedding(test_embedding[0], "test"):
        raise RuntimeError("Failed to initialize embedding model")
    
    return EmbeddingFunc(
        embedding_dim=test_embedding[0].shape[0],
        max_token_size=8192,
        func=model.encode_batch
    )

async def query_rag_system(question: str, rag: LightRAG, mode: str = "mix") -> str:
    """Enhanced query_rag_system with comprehensive embedding monitoring"""
    try:
        # Create embedding debugger instance
        embedding_debugger = EmbeddingDebugger(logger)
        
        # Monitor the query embedding process
        query_embedding = await rag.embedding_func.func([question])
        if not embedding_debugger.validate_embedding(query_embedding[0], "query"):
            return "Error: Invalid query embedding generated"
            
        param = QueryParam(
            mode=mode,
            top_k=100,
            max_token_for_text_unit=64_000
        )
        
        # Add debug callback for similarity comparisons
        def similarity_callback(query_emb, db_emb, metadata):
            return embedding_debugger.compare_embeddings(query_emb, db_emb, metadata)
        
        # Execute query with monitoring
        start_time = time.time()
        
        try:
            # Direct ChromaDB health check
            response = requests.get("http://localhost:8000/api/v1/heartbeat")
            if response.status_code == 200:
                logger.info("ChromaDB connection is healthy")
            else:
                logger.warning("ChromaDB connection may be unstable")
        except Exception as e:
            logger.error(f"Failed to verify ChromaDB connection: {str(e)}")
        
        response = await rag.aquery(question, param=param)
        query_time = time.time() - start_time
        
        # Log comprehensive statistics
        stats = embedding_debugger.get_statistics()
        logger.info(
            f"Query Statistics:\n"
            f"Time: {query_time:.2f}s\n"
            f"Embedding Stats: {stats}\n"
            f"Mode: {mode}"
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Error querying RAG system: {str(e)}")
        return f"Error: {str(e)}"

async def main():
    parser = argparse.ArgumentParser(description='Query the RAG system')
    parser.add_argument('--q', type=str, help='Custom question to ask', default=None)
    parser.add_argument('--mode', type=str, choices=['naive', 'local', 'global', 'hybrid', 'mix'], 
                       default='mix', help='Query mode')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    working_dir = Path("./lightrag_cache").absolute()
    chroma_data_dir = Path("./chroma_db").absolute()
    
    logger.info(f"Using working directory: {working_dir}")
    logger.info(f"Using ChromaDB directory: {chroma_data_dir}")
    port = 8000

    try:
        # Start ChromaDB server
        chroma_process = start_chroma_server(chroma_data_dir, port)
        
        try:
            # Setup device
            device = "cpu"  # You can modify this based on available hardware
            logger.info(f"Using device: {device}")
            
            # Initialize embedding function and RAG
            embedding_func = await create_embedding_function(device)
            rag = await initialize_rag(working_dir, embedding_func)
            
            # Process questions
            if args.q:
                # Process custom question
                logger.info(f"Processing custom question: {args.q}")
                response = await query_rag_system(args.q, rag, args.mode)
                print(f"\nQuestion: {args.q}")
                print(f"Response: {response}\n")
            else:
                # Process default questions
                for question in DEFAULT_QUESTIONS:
                    logger.info(f"Processing question: {question}")
                    response = await query_rag_system(question, rag, args.mode)
                    print(f"\nQuestion: {question}")
                    print(f"Response: {response}\n")
                    # Add small delay between questions
                    await asyncio.sleep(1)
                    
        except Exception as e:
            logger.error(f"Error processing questions: {str(e)}")
            raise
        finally:
            # Cleanup ChromaDB
            cleanup_server(port)
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise

if __name__ == "__main__":
    asyncio.run(main())