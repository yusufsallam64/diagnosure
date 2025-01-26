from sentence_transformers import SentenceTransformer
from pathlib import Path
from typing import Optional, List, Dict, Any
from openai import AsyncOpenAI
from rag.build_rag import DocumentStore
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class RAGQueryEngine:
    _instance = None
    _initialized = False
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, store_path: str):
        """Initialize RAG query engine with path to document store"""
        if not RAGQueryEngine._initialized:
            self.store_path = store_path
            self.doc_store = None
            self.client = AsyncOpenAI()
            self.collection_name = "medical_documents"
            self.embedding_model_name = "BAAI/bge-large-en-v1.5"
            self.embedding_model = None
            RAGQueryEngine._initialized = True

    async def initialize(self):
        """Initialize the document store connection and load models"""
        try:
            # Initialize embedding model if not already loaded
            if self.embedding_model is None:
                print("Loading embedding model...")
                self.embedding_model = SentenceTransformer(self.embedding_model_name)
                self.embedding_model.eval()  # Set to evaluation mode
                print("Embedding model loaded successfully")

            # Initialize document store if not already initialized
            if self.doc_store is None:
                self.doc_store = DocumentStore(
                    collection_name=self.collection_name,
                    embedding_model_name=self.embedding_model_name,
                    persist_directory=self.store_path,
                    max_seq_length=768,
                    embedding_model=self.embedding_model  # Pass the loaded model
                )
                print("Document store initialized successfully")
                
        except Exception as e:
            print(f"Failed to initialize components: {e}")
            raise

    async def search(
        self,
        query: str,
        top_k: int = 8,
        min_similarity: float = 0.4,
        section_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar chunks with cached embedding model"""
        try:
            enhanced_query = self._enhance_medical_query(query)
            
            # Use the cached embedding model for embedding generation
            query_embedding = self.embedding_model.encode(enhanced_query)
            
            # Get similar chunks using ChromaDB with pre-computed embedding
            results = await self.doc_store.get_similar_chunks(
                enhanced_query,
                top_k=top_k,
                min_similarity=min_similarity,
                query_embedding=query_embedding
            )
            
            if section_filter:
                results = [
                    r for r in results 
                    if r['metadata']['section_type'].lower() == section_filter.lower()
                ]
            
            processed_results = []
            for result in results:
                processed_results.append({
                    'content': result['content'],
                    'metadata': result['metadata'],
                    'similarity': result.get('similarity', 0.0)
                })
            
            return processed_results
            
        except Exception as e:
            print(f"Search failed: {e}")  # Replaced logger with print
            raise

    def _enhance_medical_query(self, query: str) -> str:
        """Enhance query with medical context"""
        medical_terms = {
            "symptoms", "diagnosis", "treatment", "medication",
            "history", "examination", "tests", "results"
        }
        
        # Check if query already contains medical terms
        if not any(term in query.lower() for term in medical_terms):
            query = f"medical context: {query} considering symptoms, diagnosis, and treatment"
        
        return query

    def format_context(self, results: List[Dict[str, Any]]) -> str:
        """Format search results into context for GPT with enhanced structure"""
        if not results:
            return "No relevant medical documents found."
        
        context_parts = []
        
        # Group results by section type
        sections = {}
        for result in results:
            section = result['metadata'].get('section_type', 'general')
            if section not in sections:
                sections[section] = []
            sections[section].append(result)
        
        # Format each section with similarity scores
        for section, items in sections.items():
            context_parts.append(f"\n=== {section.upper()} ===")
            for i, item in enumerate(items, 1):
                similarity = item.get('similarity', 0.0)
                context_parts.append(
                    f"\nEntry {i} (Relevance: {similarity:.2%}):\n{item['content']}"
                )
                
        return "\n".join(context_parts)

    async def get_answer(
        self,
        query: str,
        context: str,
        model: str = "gpt-4o-mini",
        temperature: float = 0.7
    ) -> str:
        """Get answer from GPT using the provided context with enhanced medical validation"""
        try:
            system_prompt = """You are an advanced medical diagnosis validation assistant. Your role is to:

                        1. Analyze the consistency between reported symptoms and proposed diagnoses
                        2. Identify potential discrepancies or missing information
                        3. Flag any concerning combinations of symptoms and conditions
                        5. Consider the patient's medical history and risk factors
                        7. Provide evidence-based reasoning for all suggestions
                        8. Maintain a balanced perspective, acknowledging both supporting and contradicting evidence

                        When analyzing, consider:
                        - Symptom patterns and their relationship to proposed diagnoses
                        - Temporal relationships between symptoms and conditions
                        - Potential drug interactions or contraindications
                        - Risk factors and comorbidities
                        - Standard diagnostic criteria and guidelines
                        - Necessity of additional testing or specialist consultation

                        Format your response in a short, but structured manner:
                        - Primary Analysis
                        - Discrepancies/Concerns (if any)
                        - Supporting Evidence
                        - Recommendations
                        
                        *** Present all this in a concise manner so that a doctor can easily read over it ***"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"""Please analyze the following medical case and provide a structured validation:

                    Query/Context: {query}

                    Relevant Medical Documentation:
                    {context}

                    Please provide a comprehensive analysis following the structured format."""}
            ]

            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=4000
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            print(f"Error getting GPT response: {e}")  # Replaced logger with print
            raise