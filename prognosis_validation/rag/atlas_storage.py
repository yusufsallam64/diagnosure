from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any
from pymongo.collection import Collection
from lightrag.storage import BaseVectorStorage
from asyncio import to_thread
from pymongo import ReplaceOne
import logging

logger = logging.getLogger(__name__)

class CollectionDescriptor:
    """A descriptor that manages MongoDB collection access while avoiding serialization issues"""
    
    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        # Initialize collection if needed
        if obj._collection is None:
            obj._initialize_collection()
        return obj._collection
    
    def __set__(self, obj, value):
        obj._collection = value

@dataclass
class MongoVectorStorage(BaseVectorStorage):
    _collection: Optional[Collection] = field(default=None, init=False, repr=False)
    _connection_params: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        config = self.global_config.get("vector_db_storage_cls_kwargs", {})
        self._connection_params = {
            "db_name": config.get("db_name", "rag_db"),
            "collection_name": config.get("collection_name", "embeddings")
        }
        self._initialize_collection()

    def _initialize_collection(self):
        if not self._collection:
            from atlas_manager import get_mongodb
            mongodb = get_mongodb(**self._connection_params)
            self._collection = mongodb.get_collection()
            self._ensure_vector_search_index()
    
    def _ensure_vector_search_index(self):
        """Using existing vector search index"""
        print("Using existing vector search index")
        pass

    @property
    def collection(self) -> Collection:
        if self._collection is None:
            self._initialize_collection()
        return self._collection

    def __getstate__(self):
        state = self.__dict__.copy()
        if self._collection:
            self._collection.database.client.close()
        state['_collection'] = None
        return state

    def __setstate__(self, state):
        self.__dict__.update(state)
        self._initialize_collection()
        
    async def upsert(self, data: dict[str, dict]):
        """Upsert vector data into MongoDB collection"""
        try:
            operations = []
            for doc_id, doc_data in data.items():
                # Handle missing vector field gracefully
                vector = doc_data.get("__vector__", [])
                
                operations.append(
                    ReplaceOne(
                        {"_id": doc_id},
                        {
                            "_id": doc_id,
                            "content": doc_data.get("content", ""),
                            "vector": vector,
                            "metadata": doc_data.get("metadata", {})
                        },
                        upsert=True
                    )
                )

            if operations:
                await to_thread(
                    self.collection.bulk_write, 
                    operations, 
                    ordered=False
                )
                
            logger.info(f"Upserted {len(operations)} documents into MongoDB")
            return list(data.keys())
        except Exception as e:
            logger.error(f"Error in MongoDB upsert: {str(e)}")
           