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
import logging

class DocumentStore:
    def __init__(self, collection_name: str, embedding_model_name: str, 
                 persist_directory: str, max_seq_length: int, 
                 embedding_model: Optional[SentenceTransformer] = None):
        self.collection_name = collection_name
        self.embedding_model_name = embedding_model_name
        self.persist_directory = persist_directory
        self.max_seq_length = max_seq_length
        self.embedding_model = embedding_model or SentenceTransformer(embedding_model_name)
        self.setup_logging()  # Ensure logging is set up during initialization
        self.initialize_embedding_model(embedding_model_name, max_seq_length)
        self.initialize_chromadb(collection_name, persist_directory, embedding_model_name)  # Initialize ChromaDB

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

    async def get_similar_chunks(
            self,
            query: str,
            top_k: int = 5,
            min_similarity: float = 0.6,
            query_embedding: Optional[Any] = None
        ) -> List[Dict[str, Any]]:
            """
            Get similar document chunks using ChromaDB with optional pre-computed embeddings.
            
            Args:
                query: The search query string
                top_k: Maximum number of results to return
                min_similarity: Minimum similarity threshold
                query_embedding: Pre-computed query embedding (optional)
                
            Returns:
                List of dictionaries containing matched chunks with metadata and similarity scores
            """
            try:
                # Generate embedding if not provided
                if query_embedding is None:
                    if self.embedding_model is None:
                        raise ValueError("No embedding model available")
                    query_embedding = self.embedding_model.encode(query)
                
                # Convert embedding to list format required by ChromaDB
                query_embedding_list = query_embedding.tolist()
                
                # Perform similarity search
                results = self.collection.query(
                    query_embeddings=[query_embedding_list],
                    n_results=top_k,
                    include=['metadatas', 'documents', 'distances']
                )
                
                # Process results
                processed_results = []
                if results['ids'] and len(results['ids'][0]) > 0:
                    for i in range(len(results['ids'][0])):
                        # Convert distance to similarity score (ChromaDB returns distances)
                        # For cosine distance, similarity = 1 - distance
                        similarity = 1 - results['distances'][0][i]
                        
                        # Skip results below minimum similarity threshold
                        if similarity < min_similarity:
                            continue
                        
                        processed_results.append({
                            'id': results['ids'][0][i],
                            'content': results['documents'][0][i],
                            'metadata': results['metadatas'][0][i],
                            'similarity': float(similarity)  # Convert numpy float to Python float
                        })
                
                # Sort by similarity score (highest first)
                processed_results.sort(key=lambda x: x['similarity'], reverse=True)
                
                self.logger.debug(f"Found {len(processed_results)} similar chunks above threshold")
                return processed_results
                
            except Exception as e:
                self.logger.error(f"Error in get_similar_chunks: {str(e)}")
                raise

    async def add_documents(
        self,
        texts: List[str],
        metadatas: List[Dict[str, Any]],
        ids: Optional[List[str]] = None
    ) -> None:
        """Add new documents to the collection"""
        try:
            # Generate embeddings in batches
            embeddings = []
            batch_size = 32  # Adjust based on your memory constraints
            
            for i in range(0, len(texts), batch_size):
                batch_texts = texts[i:i + batch_size]
                batch_embeddings = self.embedding_model.encode(batch_texts)
                embeddings.extend(batch_embeddings.tolist())
            
            # Add documents to ChromaDB
            if ids is None:
                ids = [str(i) for i in range(len(texts))]
                
            self.collection.add(
                documents=texts,
                metadatas=metadatas,
                ids=ids,
                embeddings=embeddings
            )
            
            self.logger.info(f"Added {len(texts)} documents to collection {self.collection_name}")
            
        except Exception as e:
            self.logger.logger.error(f"Error adding documents: {str(e)}")
            raise

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
        collection_name="personal_injury_docs",  # Add collection name
        embedding_model_name="all-MiniLM-L6-v2",  # Add embedding model name
        persist_directory=str(working_dir / "chroma_db"),
        max_seq_length=512  # Add max sequence length
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