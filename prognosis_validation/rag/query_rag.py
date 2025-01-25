import asyncio
import logging
import torch
from pathlib import Path
from typing import Dict, Any, List
import numpy as np
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
        self.score_threshold = 0.2

    async def _get_query_embedding(self, query: str) -> List[float]:
        """Generate embedding for the query"""
        embeddings = await self.embedding_func.func([query])
        return embeddings[0].tolist()

    async def vector_search(self, query: str) -> List[Dict[str, Any]]:
      """Perform vector similarity search in MongoDB"""
      query_embedding = await self._get_query_embedding(query)
      
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
                  "_id": 1,
                  "content": 1,
                  "score": {"$meta": "vectorSearchScore"}
               }
         }
      ]
      
      results = await asyncio.to_thread(
         self.collection.aggregate,
         pipeline
      )
      
      # Parse metadata from content
      parsed_results = []
      for res in list(results):
         content = res.get("content", "")
         if "[METADATA]" in content:
               content_part, metadata_str = content.split("[METADATA]", 1)
               try:
                  metadata = json.loads(metadata_str)
               except json.JSONDecodeError:
                  metadata = {}
         else:
               content_part = content
               metadata = {}
         
         parsed_results.append({
               "content": content_part.strip(),
               "metadata": metadata,
               "score": res.get("score", 0)
         })
      
      return parsed_results

    async def vector_search(self, query: str) -> List[Dict[str, Any]]:
      """Perform vector similarity search in MongoDB"""
      query_embedding = await self._get_query_embedding(query)
      
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
      
      results = await asyncio.to_thread(
         self.collection.aggregate,
         pipeline
      )
      
      return list(results)

    async def generate_answer(self, query: str, context: List[str]) -> str:
      """Generate answer using LLM with retrieved context"""
      context_str = "\n\n".join(context)
      prompt = f"""Based on the following context, answer the question. If unsure, say you don't know.

      Context: {context_str}

      Question: {query}
      Answer: """
      
      return await self.llm_func(
            QueryParam(prompt=prompt, max_tokens=500, temperature=0.3)
      )


async def main():
    current_dir = Path(__file__).parent
    working_dir = current_dir / "lightrag_cache"
    
    from atlas_manager import get_mongodb
    mongodb = get_mongodb()
    collection = mongodb.get_collection()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    embedding_func = await create_embedding_function(device)

    query_engine = RAGQueryEngine(collection, embedding_func)
    
    question = "What are the key considerations for personal injury cases?"
    
    result = await query_engine.query(question)
    
    print("\nAnswer:", result["answer"])
    
    if result["context"]:
        print("\nContext Sources:")
        for i, (ctx, meta) in enumerate(zip(result["context"], result["metadata"])):
            print(f"\nChunk {i+1}:")
            print(f"Page {meta.get('page_num', 'N/A')}")
            print(f"Section: {meta.get('section_type', 'N/A')}")
            print(f"Score: {result['scores'][i]:.3f}" if i < len(result['scores']) else "Score: N/A")
            print(ctx[:200] + ("..." if len(ctx) > 200 else ""))
    else:
        print("\nNo relevant context found")

if __name__ == "__main__":
    asyncio.run(main())