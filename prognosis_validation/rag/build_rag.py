import asyncio
import json
import logging
import numpy as np
import torch
from pathlib import Path
from typing import List, Dict, Any, Optional
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions
from tqdm import tqdm
import hashlib
import time

class DocumentStore:
    def __init__(
        self,
        collection_name: str = "medical_documents",
        embedding_model_name: str = "BAAI/bge-large-en-v1.5",
        persist_directory: str = "./chroma_db",
        max_seq_length: int = 768
    ):
        self.setup_logging()
        self.initialize_embedding_model(embedding_model_name, max_seq_length)
        self.initialize_chromadb(collection_name, persist_directory, embedding_model_name)
        
    def setup_logging(self):
        """Configure detailed logging"""
        self.logger = logging.getLogger(__name__)
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(
                logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s')
            )
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.DEBUG)

    def initialize_embedding_model(self, model_name: str, max_seq_length: int):
        """Initialize the embedding model with proper device detection"""
        self.logger.info(f"Initializing embedding model: {model_name}")
        self.device = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
        self.logger.info(f"Using device: {self.device}")
        
        self.embedding_model = SentenceTransformer(model_name)
        self.embedding_model.to(self.device)
        self.embedding_model.max_seq_length = max_seq_length
        self.logger.info(f"Set max sequence length to {max_seq_length}")

    def initialize_chromadb(self, collection_name: str, persist_directory: str, embedding_model_name: str):
        """Initialize ChromaDB with optimized settings"""
        self.logger.info("Initializing ChromaDB")
        self.chroma_client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True,
                is_persistent=True
            )
        )
        
        self.collection = self.chroma_client.get_or_create_collection(
            name=collection_name,
            embedding_function=embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name=embedding_model_name,
                device=self.device
            ),
            metadata={"hnsw:space": "cosine", "hnsw:construction_ef": 100}
        )

    async def process_json_file(self, json_path: str, batch_size: int = 32):
        """Process a JSON file containing document chunks"""
        json_path = Path(json_path).resolve()
        self.logger.info(f"Processing JSON file: {json_path}")
        
        if not json_path.exists():
            raise FileNotFoundError(f"JSON file not found at: {json_path}")
            
        try:
            # Read the entire JSON file
            with open(json_path, 'r') as f:
                data = json.load(f)
                
            if not isinstance(data, dict) or 'chunks' not in data:
                raise ValueError("Invalid JSON format: expecting object with 'chunks' array")
                
            chunks = data['chunks']
            total_chunks = len(chunks)
            self.logger.info(f"Found {total_chunks} chunks in the JSON file")
            
            # Process chunks in batches
            for i in range(0, total_chunks, batch_size):
                batch = chunks[i:i + batch_size]
                await self.add_documents(batch)
                self.logger.info(f"Processed {min(i + batch_size, total_chunks)}/{total_chunks} chunks")
                
        except json.JSONDecodeError as e:
            self.logger.error(f"Error parsing JSON file: {e}")
            raise
        except Exception as e:
            self.logger.error(f"Error processing JSON file: {e}")
            raise

    def generate_document_id(self, content: str, metadata: dict) -> str:
        """Generate a unique document ID with improved collision avoidance"""
        id_components = [
            content.strip(),
            str(metadata.get('section_type', '')),
            str(metadata.get('page_num', '')),
            str(metadata.get('chunk_id', '')),
            str(metadata.get('date', ''))
        ]
        id_string = '||'.join(id_components)
        return hashlib.sha256(id_string.encode()).hexdigest()

    async def add_documents(self, chunks: List[Dict[str, Any]]):
        """Add document chunks with improved deduplication"""
        existing_ids = set()
        
        # Get existing IDs only once per batch
        if self.collection.count() > 0:
            existing_ids = set(self.collection.get()["ids"])
        
        # Prepare batch data
        texts = []
        metadatas = []
        ids = []
        
        for chunk in chunks:
            # Extract content and clean it
            content = chunk.get('content', '').strip()
            if not content:
                continue
                
            # Generate ID first to check for duplicates
            doc_id = self.generate_document_id(content, chunk.get('metadata', {}))
            if doc_id in existing_ids:
                continue
                
            texts.append(content)
            metadatas.append({
                'section_type': chunk.get('section_type', ''),
                'page_num': chunk.get('page_num', ''),
                'chunk_id': chunk.get('chunk_id', ''),
                'date': chunk.get('date', ''),
                'timestamp': int(time.time()),
                **{k: v for k, v in chunk.get('metadata', {}).items() if v is not None}
            })
            ids.append(doc_id)
            existing_ids.add(doc_id)
        
        if texts:
            self.collection.add(
                documents=texts,
                metadatas=metadatas,
                ids=ids
            )
            self.logger.info(f"Added {len(texts)} new documents")

    async def get_similar_chunks(
        self,
        query_text: str,
        top_k: int = 5,
        min_similarity: float = 0.3
    ) -> List[Dict[str, Any]]:
        """Enhanced similarity search with better query processing"""
        query_text = self._preprocess_query(query_text)
        
        # Ensure collection has documents before querying
        collection_count = self.collection.count()
        if collection_count == 0:
            self.logger.warning("Collection is empty, no results to return")
            return []
            
        # Adjust top_k to be within valid range
        top_k = max(1, min(top_k, collection_count))
        
        results = self.collection.query(
            query_texts=[query_text],
            n_results=top_k,
            include=['documents', 'metadatas', 'distances']
        )
        
        filtered_chunks = []
        for doc, meta, distance in zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0]
        ):
            similarity = 1 - (distance / 2)
            if similarity >= min_similarity:
                filtered_chunks.append({
                    'content': doc,
                    'metadata': meta,
                    'similarity': similarity
                })
        
        return sorted(filtered_chunks, key=lambda x: x['similarity'], reverse=True)

    def _preprocess_query(self, query: str) -> str:
        """Preprocess query with improved medical context"""
        query = query.strip().lower()
        
        # Add medical context only if needed
        medical_terms = {'medication', 'prescription', 'drug', 'dose', 'medicine'}
        if not any(term in query for term in medical_terms):
            query = f"medical record mentioning {query}"
        
        return query

async def main():
    # Setup working directory paths
    current_dir = Path(__file__).parent.resolve()
    project_root = current_dir.parent
    
    # Construct paths
    json_path = project_root / "processed" / "personal-injury-sample_processed.json"
    working_dir = current_dir / "rag_working_dir"
    
    # Create working directory if it doesn't exist
    working_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize document store
    doc_store = DocumentStore(
        persist_directory=str(working_dir / "chroma_db")
    )
    
    # Process JSON file
    try:
        await doc_store.process_json_file(str(json_path))
    except Exception as e:
        print(f"Error processing JSON file: {e}")
        return
    
    # Example query
    results = await doc_store.get_similar_chunks("Naproxen medications")
    for i, result in enumerate(results, 1):
        print(f"\nResult {i}:")
        print(f"Content: {result['content']}")
        print(f"Similarity: {result['similarity']:.3f}")

if __name__ == "__main__":
    asyncio.run(main())