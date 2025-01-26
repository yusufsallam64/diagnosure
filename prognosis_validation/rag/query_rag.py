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
        # logging.FileHandler('logs/query.log')
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
                max_tokens=3000
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
    
    parser.add_argument(
        '--query',
        type=str,
        help='Query string to search for'
    )
    
    parser.add_argument(
        '--store-path',
        type=str,
        default='./rag/rag_working_dir/chroma_db',
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
    parser.add_argument(
        '--run-sample-queries',
        action='store_true',
        help='Run a predefined set of sample queries'
    )
    args = parser.parse_args()

    try:
        # Initialize RAG engine
        engine = RAGQueryEngine(args.store_path)
        await engine.initialize()

        if args.run_sample_queries:
            # Define sample queries
            sample_queries = [
                "What are the key findings from the imaging studies of the patient's cervical spine and brain?",
                "Summarize the patient's clinical history and presenting symptoms.",
                "What were the findings from the cervical spine MRI without contrast?",
                "Are there any abnormalities in the brain imaging studies?",
                "Is there any evidence of central canal stenosis or neural foraminal narrowing in the cervical spine?",
                "What are the patient's primary complaints and symptoms?",
                "What is the clinical history of the patient regarding left-sided paresthesias and right-sided numbness?",
                "Has the patient been evaluated for stroke or cervical radiculopathy?",
                "What is the current diagnosis for the patient's condition?",
                "What treatment plans have been recommended for the patient?",
                "Is there any evidence of conversion disorder, and how is it being managed?",
                "What were the results of the neurological evaluation for the patient?",
                "Has the patient been assessed for psychiatric conditions such as depression or anxiety?",
                "What is the psychiatric review of symptoms for the patient?",
                "What are the key impressions from the imaging and clinical evaluations?",
                "What are the recommendations for ongoing care and follow-up?",
                "Are there any specific precautions or assistive measures recommended for the patient?",
                "What does the imaging section reveal about the patient's cervical spine and brain?",
                "What information is available in the patient_info section regarding the patient's history and symptoms?",
                "What treatments have been documented in the treatment section?",
                "What are the discharge instructions for the patient?",
                "What follow-up care or outpatient services are recommended?",
                "Are there any specific medications or therapies prescribed upon discharge?"
            ]

            # Run each sample query
            for query in sample_queries:
                print(f"\nRunning query: {query}")
                results = await engine.search(
                    query,
                    top_k=args.top_k,
                    min_similarity=args.min_similarity,
                    section_filter=args.section
                )
                context = engine.format_context(results)
                answer = await engine.get_answer(
                    query,
                    context,
                    model=args.model,
                    temperature=args.temperature
                )
                engine.display_results(
                    query,
                    context,
                    answer,
                    show_context=args.show_context
                )
        else:
            # Run a single query provided by the user
            if not args.query:
                raise ValueError("Please provide a query or use --run-sample-queries to run predefined queries.")
            
            results = await engine.search(
                args.query,
                top_k=args.top_k,
                min_similarity=args.min_similarity,
                section_filter=args.section
            )
            context = engine.format_context(results)
            answer = await engine.get_answer(
                args.query,
                context,
                model=args.model,
                temperature=args.temperature
            )
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