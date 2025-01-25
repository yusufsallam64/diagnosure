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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('logs/rag.log')
    ]
)
logger = logging.getLogger(__name__)

class DocumentStore:
    """
    A simple document storage and embedding system with ChromaDB backend.
    Focused on embedding and storing documents with metadata.
    """
    def __init__(
        self,
        collection_name: str = "medical_documents",
        embedding_model_name: str = "BAAI/bge-large-en-v1.5",
        persist_directory: str = "./chroma_db"
    ):
        self.collection_name = collection_name
        self.persist_directory = persist_directory
        
        # Initialize embedding model with device detection
        logger.info(f"Initializing embedding model: {embedding_model_name}")
        self.device = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
        logger.info(f"Using device: {self.device}")
        
        self.embedding_model = SentenceTransformer(embedding_model_name)
        self.embedding_model.to(self.device)
        self.embedding_model.max_seq_length = 512
        
        # Initialize ChromaDB
        logger.info("Initializing ChromaDB")
        self.chroma_client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Create or get collection
        self.collection = self.chroma_client.get_or_create_collection(
            name=collection_name,
            embedding_function=embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name=embedding_model_name,
                device=self.device
            ),
            metadata={"hnsw:space": "cosine"}
        )
        
        logger.info(f"Collection '{collection_name}' contains {self.collection.count()} documents")

    def generate_document_id(self, content: str, metadata: dict) -> str:
        """Generate a unique ID for a document based on its content and metadata"""
        # Combine content and relevant metadata into a string
        id_string = f"{content}{metadata.get('section_type', '')}{metadata.get('page_num', '')}"
        # Generate a hash
        return hashlib.md5(id_string.encode()).hexdigest()

    async def add_documents(self, chunks: List[Dict[str, Any]], batch_size: int = 32):
        """
        Add document chunks to the vector store
        
        Args:
            chunks: List of document chunks with content and metadata
            batch_size: Number of chunks to process at once
        """
        total_chunks = len(chunks)
        logger.info(f"Adding {total_chunks} chunks to vector store")
        
        # Create batches with progress bar
        batches = list(range(0, total_chunks, batch_size))
        pbar = tqdm(batches, desc="Batches")
        
        existing_ids = set(self.collection.get()["ids"]) if self.collection.count() > 0 else set()
        added_count = 0
        
        for i in pbar:
            batch = chunks[i:i + batch_size]
            
            # Prepare batch data
            texts = []
            metadatas = []
            ids = []
            
            for chunk in batch:
                # Format chunk content
                formatted_content = f"""
                Content: {chunk['content']}
                Section: {chunk['section_type']}
                Page: {chunk['page_num']}
                """.strip()
                
                # Generate unique ID for the document
                doc_id = self.generate_document_id(formatted_content, chunk)
                
                # Skip if document already exists
                if doc_id in existing_ids:
                    continue
                
                texts.append(formatted_content)
                metadatas.append({
                    'section_type': chunk['section_type'],
                    'page_num': chunk['page_num'],
                    'chunk_id': chunk['chunk_id'],
                    'timestamp': int(time.time()),
                    **chunk.get('metadata', {})
                })
                ids.append(doc_id)
                existing_ids.add(doc_id)
            
            # Add to ChromaDB if we have new documents
            if texts:
                try:
                    self.collection.add(
                        documents=texts,
                        metadatas=metadatas,
                        ids=ids
                    )
                    added_count += len(texts)
                    logger.info(f"Added {len(texts)} new chunks")
                except Exception as e:
                    logger.error(f"Error adding batch to ChromaDB: {str(e)}")
                    raise
        
        logger.info(f"Successfully added {added_count} new chunks. Collection now contains {self.collection.count()} documents")

    async def get_similar_chunks(
        self,
        query_text: str,
        top_k: int = 5,
        min_similarity: float = 0.5
    ) -> List[Dict[str, Any]]:
        """
        Retrieve similar chunks from the store
        
        Args:
            query_text: The query string
            top_k: Number of similar chunks to retrieve
            min_similarity: Minimum similarity threshold
            
        Returns:
            List of similar chunks with their metadata and similarity scores
        """
        try:
            # Get total document count
            doc_count = self.collection.count()
            if doc_count == 0:
                logger.warning("No documents in collection")
                return []
                
            # Adjust top_k if necessary
            actual_top_k = min(top_k, doc_count)
            if actual_top_k < top_k:
                logger.info(f"Adjusted top_k from {top_k} to {actual_top_k} based on available documents")
            
            results = self.collection.query(
                query_texts=[query_text],
                n_results=actual_top_k,
                include=['documents', 'metadatas', 'distances']
            )
            
            # Filter by similarity threshold
            filtered_chunks = []
            for doc, meta, distance in zip(
                results['documents'][0],
                results['metadatas'][0],
                results['distances'][0]
            ):
                similarity = 1 - (distance / 2)  # Convert distance to similarity
                if similarity >= min_similarity:
                    filtered_chunks.append({
                        'content': doc,
                        'metadata': meta,
                        'similarity': similarity
                    })
            
            logger.info(f"Found {len(filtered_chunks)} chunks above similarity threshold {min_similarity}")
            return filtered_chunks
            
        except Exception as e:
            logger.error(f"Error during similarity search: {str(e)}")
            raise

async def main():
    # Setup paths
    working_dir = Path("./rag_working_dir")
    working_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize document store
    doc_store = DocumentStore(persist_directory=str(working_dir / "chroma_db"))
    
    # Example chunks - you should replace this with your actual data loading
    chunks = [
        {
            "content": "Patient reports severe headache and dizziness",
            "section_type": "symptoms",
            "page_num": 1,
            "chunk_id": "sym_001",
            "metadata": {"date": "2024-01-20"}
        },
        {
            "content": "Lower back pain reported, patient describes it as chronic",
            "section_type": "symptoms",
            "page_num": 1,
            "chunk_id": "sym_002",
            "metadata": {"date": "2024-01-20"}
        },
        {
            "content": "Previous history of lumbar strain noted",
            "section_type": "medical_history",
            "page_num": 2,
            "chunk_id": "hist_001",
            "metadata": {"date": "2024-01-20"}
        }
    ]
    
    # Add documents
    await doc_store.add_documents(chunks)
    
    # Example similarity search
    similar_chunks = await doc_store.get_similar_chunks("lower back pain", top_k=5)
    print("\nSimilar chunks:")
    for chunk in similar_chunks:
        print(f"\nContent: {chunk['content']}")
        print(f"Similarity: {chunk['similarity']:.3f}")
        print(f"Metadata: {chunk['metadata']}")

if __name__ == "__main__":
    asyncio.run(main())