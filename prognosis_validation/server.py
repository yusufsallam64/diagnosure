from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import motor.motor_asyncio
from datetime import datetime
from pathlib import Path
from rag.query_rag import RAGQueryEngine
from rag.chromadb_manager import start_chroma_server

# Global variables
rag_engine = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    global rag_engine
    try:
        # Start ChromaDB server
        store_path = Path("./rag/rag_working_dir/chroma_db")
        store_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Start the ChromaDB server
        start_chroma_server()
        print("ChromaDB server started")  # Replaced logger with print

        # Initialize RAG engine
        rag_engine = RAGQueryEngine(str(store_path))
        await rag_engine.initialize()
        print("RAG engine initialized")  # Replaced logger with print

    except Exception as e:
        print(f"Startup error: {e}")  # Replaced logger with print
        raise

    yield  # Server is running

    # Shutdown
    print("Shutting down application")  # Replaced logger with print

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Medical Diagnosis Validation System",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Adjust this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB configuration
MONGO_URL = "mongodb://localhost:27017"
client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
db = client.medical_records
prescreens_collection = db.prescreens

class DiagnosisInput(BaseModel):
    user_id: str
    doctor_diagnosis: str
    additional_notes: Optional[str] = None

class ValidationResponse(BaseModel):
    validation_result: Dict[str, Any]
    suggestions: List[str]
    risk_level: str
    confidence_score: float

async def get_latest_prescreen(user_id: str) -> Dict[str, Any]:
    """Get the most recent prescreen data for a user"""
    # Mock prescreen data for demonstration
    mock_prescreen = {
        "user_id": user_id,
        "timestamp": datetime.now(),
        "symptoms": [
            "persistent headache",
            "neck pain",
            "numbness in left arm",
            "difficulty concentrating"
        ],
        "duration": "2 weeks",
        "severity": "moderate",
        "medical_history": {
            "previous_conditions": ["hypertension"],
            "medications": ["lisinopril"],
            "allergies": ["penicillin"]
        },
        "vital_signs": {
            "blood_pressure": "130/85",
            "heart_rate": 78,
            "temperature": 98.6
        }
    }
    return mock_prescreen

async def validate_diagnosis(
    diagnosis: str,
    prescreen_data: Dict[str, Any],
    additional_notes: Optional[str] = None 
) -> ValidationResponse:
    try:
        # Construct validation query with additional notes
        validation_query = f"""
        Given the following patient information and doctor's diagnosis, analyze for consistency 
        and potential concerns:

        Patient Symptoms: {', '.join(prescreen_data['symptoms'])}
        Symptom Duration: {prescreen_data['duration']}
        Severity: {prescreen_data['severity']}
        Medical History: {prescreen_data['medical_history']}
        Vital Signs: {prescreen_data['vital_signs']}
        Previous Pre-screen Report: {additional_notes}  
        
        Doctor's Diagnosis: {diagnosis}

        Please analyze:
        1. Consistency between symptoms and diagnosis
        2. Any missing critical tests or examinations
        3. Potential alternative diagnoses to consider
        4. Risk factors based on medical history
        5. Recommended additional specialist consultations if needed
        """

        # Get RAG results 
        results = await rag_engine.search(validation_query)
        context = rag_engine.format_context(results)
        
        # Get validation analysis from GPT
        analysis = await rag_engine.get_answer(
            validation_query,
            context,
            temperature=0.3  # Lower temperature for more consistent analysis
        )

        # Process the analysis into structured response
        return ValidationResponse(
            validation_result={
                "analysis": analysis,
                "matching_symptoms": True,
                "discrepancies": [],
            },
            suggestions=[
                "Consider neurological consultation",
                "Recommend MRI to rule out cervical issues",
                "Monitor blood pressure given history"
            ],
            risk_level="MEDIUM",
            confidence_score=0.85
        )

    except Exception as e:
        print(f"Error in diagnosis validation: {e}")  # Replaced logger with print
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/validate_diagnosis", response_model=ValidationResponse)
async def validate_diagnosis_endpoint(input_data: DiagnosisInput):
    try:
        # Get patient's prescreen data
        prescreen_data = await get_latest_prescreen(input_data.user_id)
        print(input_data.additional_notes)
        # Validate diagnosis with additional notes
        validation_result = await validate_diagnosis(
            input_data.doctor_diagnosis,
            prescreen_data,
            input_data.additional_notes  # Add this parameter
        )
        
        return validation_result

    except Exception as e:
        print(f"Error processing diagnosis validation: {e}")  # Replaced logger with print
        raise HTTPException(
            status_code=500,
            detail=f"Error processing diagnosis validation: {str(e)}"
        )

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}