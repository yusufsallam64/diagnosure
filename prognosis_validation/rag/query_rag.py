import asyncio
import logging
import torch
import numpy as np
from pathlib import Path
from typing import Dict, Any, List
from dotenv import load_dotenv
from atlas_storage import MongoVectorStorage
from build_rag import create_embedding_function
from lightrag import QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

class RAGQueryEngine:
    def __init__(self, collection, embedding_func, llm_func=gpt_4o_mini_complete):
        self.collection = collection
        self.embedding_func = embedding_func
        self.llm_func = llm_func
        self.top_k = 5
        self.score_threshold = 0  # Temporarily set to 0.0 for debugging

    async def _get_query_embedding(self, query: str) -> List[float]:
        """Generate embedding for the query"""
        embeddings = await self.embedding_func.func([query])
        embedding = embeddings[0].tolist()  # Convert to Python list
        
        # Normalize embedding (required for cosine similarity)
        embedding_np = np.array(embedding)
        embedding_np = embedding_np / np.linalg.norm(embedding_np)
        return embedding_np.tolist()  # Convert back to Python list

    async def vector_search(self, query: str) -> List[Dict[str, Any]]:
        """Perform vector similarity search in MongoDB"""
        query_embedding = await self._get_query_embedding(query)
        logger.info(f"Query embedding (first 5 dims): {query_embedding[:5]}")

        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "vector",
                    "queryVector": query_embedding,
                    "numCandidates": 100,
                    "limit": self.top_k,
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "content": 1,
                    "metadata": 1,
                    "score": {"$meta": "vectorSearchScore"}
                }
            }
        ]

        logger.info("Running MongoDB aggregation pipeline for vector search...")
        results = await asyncio.to_thread(
            self.collection.aggregate,
            pipeline
        )

        results = list(results)
        logger.info(f"Found {len(results)} results from vector search.")
        for i, res in enumerate(results):
            logger.info(f"Result {i + 1}:")
            logger.info(f"  Content: {res.get('content', '')[:200]}...")
            logger.info(f"  Metadata: {res.get('metadata', {})}")
            logger.info(f"  Score: {res.get('score', 0)}")

        return results

    async def generate_answer(self, query: str, context: List[str]) -> str:
        """Generate answer using LLM with retrieved context"""
        context_str = "\n\n".join(context)
        prompt = f"""Based on the following context, answer the question. If unsure, say you don't know.

        Context: {context_str}

        Question: {query}
        Answer: """

        logger.info("Generating answer using LLM...")
        return await self.llm_func(
            QueryParam(prompt=prompt, max_tokens=500, temperature=0.3)
        )

    async def query(self, query: str) -> Dict[str, Any]:
        """Run full RAG query pipeline"""
        logger.info(f"Running query: {query}")

        # Perform vector search
        search_results = await self.vector_search(query)

        # Apply score threshold
        filtered_results = [res for res in search_results if res['score'] >= self.score_threshold]
        logger.info(f"Filtered results after applying threshold ({self.score_threshold}): {len(filtered_results)}")

        if not filtered_results:
            return {"answer": "No relevant context found", "context": [], "metadata": [], "scores": []}

        # Extract context and metadata
        context = [res["content"] for res in filtered_results]
        metadata = [res["metadata"] for res in filtered_results]
        scores = [res["score"] for res in filtered_results]

        # Generate answer
        answer = await self.generate_answer(query, context)

        return {
            "answer": answer,
            "context": context,
            "metadata": metadata,
            "scores": scores
        }

async def inspect_database(collection):
    """Inspect the database contents for debugging"""
    logger.info("Inspecting database contents...")
    sample_documents = await asyncio.to_thread(collection.find().limit(5).to_list)
    if sample_documents:
        logger.info(f"Found {len(sample_documents)} sample documents.")
        for i, doc in enumerate(sample_documents):
            logger.info(f"Sample document {i + 1}:")
            logger.info(f"  Content: {doc.get('content', '')[:200]}...")
            logger.info(f"  Metadata: {doc.get('metadata', {})}")
            logger.info(f"  Vector (first 5 dims): {doc.get('vector', [])[:5]}")
    else:
        logger.warning("No documents found in the database.")

async def main():
    # Get MongoDB collection
    from atlas_manager import get_mongodb
    mongodb = get_mongodb()
    collection = mongodb.get_collection()

    # Inspect database contents
    await inspect_database(collection)

    # Initialize embedding function
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Using device: {device}")
    embedding_func = await create_embedding_function(device)

    # Initialize query engine
    query_engine = RAGQueryEngine(collection, embedding_func)

    # Define the question
    question = "What are the key considerations for personal injury cases?"

    # Run the query
    result = await query_engine.query(question)

    # Print the answer and context
    print("\nAnswer:", result["answer"])

    if result["context"]:
        print("\nContext Sources:")
        for i, (ctx, meta) in enumerate(zip(result["context"], result["metadata"])):
            print(f"\nChunk {i + 1}:")
            print(f"Page {meta.get('page_num', 'N/A')}")
            print(f"Section: {meta.get('section_type', 'N/A')}")
            print(f"Score: {result['scores'][i]:.3f}" if i < len(result['scores']) else "Score: N/A")
            print(ctx[:200] + ("..." if len(ctx) > 200 else ""))
    else:
        print("\nNo relevant context found")

if __name__ == "__main__":
    asyncio.run(main())