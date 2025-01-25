import os
from typing import Optional
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class MongoDBManager:
    """Manages MongoDB Atlas connection"""
    
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, 
                 connection_string: Optional[str] = None,
                 db_name: str = "rag_db",
                 collection_name: str = "embeddings"):
        # Only initialize once
        if not hasattr(self, 'initialized'):
            self.connection_string = connection_string or os.getenv('MONGODB_URI')
            if not self.connection_string:
                raise ValueError("MongoDB connection string must be provided or set in MONGODB_URI environment variable")
            
            self.db_name = db_name
            self.collection_name = collection_name
            self.client: Optional[MongoClient] = None
            self.db: Optional[Database] = None
            self.collection: Optional[Collection] = None
            self.initialized = True
            
            # Initialize connection
            self.connect()
    
    def connect(self) -> None:
        """Establish connection to MongoDB"""
        try:
            print("Connecting to MongoDB Atlas...")
            self.client = MongoClient(self.connection_string)
            self.db = self.client[self.db_name]
            self.collection = self.db[self.collection_name]
            
            # Test connection
            self.client.admin.command('ping')
            print("Successfully connected to MongoDB")
            
        except Exception as e:
            print(f"Error connecting to MongoDB: {str(e)}")
            raise
    
    def is_healthy(self) -> bool:
        """Check if MongoDB connection is healthy"""
        try:
            # Ping the database
            self.client.admin.command('ping')
            return True
        except Exception as e:
            print(f"Health check failed: {str(e)}")
            return False
    
    def ensure_connection(self) -> None:
        """Ensure MongoDB connection is established and healthy"""
        if not self.is_healthy():
            self.connect()
    
    def get_collection(self) -> Collection:
        """Get MongoDB collection"""
        self.ensure_connection()
        return self.collection

    def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            self.client = None
            self.db = None
            self.collection = None

# Create a global instance that can be reused
default_mongodb = MongoDBManager()

def get_mongodb(connection_string: Optional[str] = None,
                db_name: str = "rag_db",
                collection_name: str = "embeddings") -> MongoDBManager:
    """Get or create a MongoDB instance"""
    return MongoDBManager(
        connection_string=connection_string,
        db_name=db_name,
        collection_name=collection_name
    )