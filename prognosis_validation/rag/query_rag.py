import asyncio
import argparse
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from openai import AsyncOpenAI
from build_rag import DocumentStore
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('logs/query.log')
    ]
)
logger = logging.getLogger(__name__)

class RAGQueryEngine:
    def __init__(self, store_path: str):
        """Initialize RAG query engine with path to document store"""
        self.store_path = store_path
        self.doc_store = None
        self.client = AsyncOpenAI()

    async def initialize(self):
        """Initialize the document store connection"""
        try:
            self.doc_store = DocumentStore(persist_directory=self.store_path)
            logger.info("Document store initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize document store: {e}")
            raise

    async def search(
        self,
        query: str,
        top_k: int = 5,
        min_similarity: float = 0.5,
        section_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar chunks with optional section filtering"""
        try:
            results = await self.doc_store.get_similar_chunks(
                query,
                top_k=top_k,
                min_similarity=min_similarity
            )
            
            # Apply section filter if specified
            if section_filter:
                results = [
                    r for r in results 
                    if r['metadata']['section_type'].lower() == section_filter.lower()
                ]
            
            return results
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            raise

    def format_context(self, results: List[Dict[str, Any]]) -> str:
        """Format search results into context for GPT"""
        if not results:
            return "No relevant medical documents found."
        
        context_parts = []
        for i, result in enumerate(results, 1):
            context_parts.append(f"Document {i}:\n{result['content']}\n")
            
        return "\n".join(context_parts)

    async def get_answer(
        self,
        query: str,
        context: str,
        model: str = "gpt-4",
        temperature: float = 0.7
    ) -> str:
        """Get answer from GPT using the provided context"""
        try:
            system_prompt = """You are a helpful medical document analysis assistant. Your role is to:
            1. Answer questions based on the provided medical documents
            2. Only use information present in the provided documents
            3. Clearly indicate when information is not available in the documents
            4. Be precise and medical in your language when appropriate
            5. Format your responses in a clear, organized manner"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"""Please answer the following question based on the provided medical documents:

Query: {query}

Relevant Medical Documents:
{context}

Please provide a clear and concise answer based solely on the information in these documents."""}
            ]

            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=500
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"Error getting GPT response: {e}")
            raise

    def display_results(self, query: str, context: str, answer: str, show_context: bool = False):
        """Display search results and GPT answer in a formatted way"""
        print("\n" + "="*80)
        print(f"Query: {query}")
        print("="*80)
        
        if show_context:
            print("\nContext from Medical Documents:")
            print("-"*80)
            print(context)
            print("-"*80)
        
        print("\nAnswer:")
        print("-"*80)
        print(answer)
        print("="*80)

async def main():
    parser = argparse.ArgumentParser(description='RAG Query System for Medical Documents')
    parser.add_argument('query', type=str, help='Search query')
    parser.add_argument(
        '--store-path',
        type=str,
        default='./rag_working_dir/chroma_db',
        help='Path to document store'
    )
    parser.add_argument(
        '--top-k',
        type=int,
        default=5,
        help='Number of documents to retrieve'
    )
    parser.add_argument(
        '--min-similarity',
        type=float,
        default=0.5,
        help='Minimum similarity threshold (0-1)'
    )
    parser.add_argument(
        '--section',
        type=str,
        help='Filter by section type'
    )
    parser.add_argument(
        '--show-context',
        action='store_true',
        help='Show retrieved documents in output'
    )
    parser.add_argument(
        '--model',
        type=str,
        default='gpt-4',
        help='GPT model to use'
    )
    parser.add_argument(
        '--temperature',
        type=float,
        default=0.7,
        help='Temperature for GPT response'
    )
    args = parser.parse_args()

    try:
        # Initialize RAG engine
        engine = RAGQueryEngine(args.store_path)
        await engine.initialize()
        
        # Get relevant documents
        results = await engine.search(
            args.query,
            top_k=args.top_k,
            min_similarity=args.min_similarity,
            section_filter=args.section
        )
        
        # Format context from results
        context = engine.format_context(results)
        
        # Get GPT answer
        answer = await engine.get_answer(
            args.query,
            context,
            model=args.model,
            temperature=args.temperature
        )
        
        # Display results
        engine.display_results(
            args.query,
            context,
            answer,
            show_context=args.show_context
        )
        
    except Exception as e:
        logger.error(f"Error during RAG query execution: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main())