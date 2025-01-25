from dataclasses import dataclass, field
from typing import Optional, Dict, List
from pymongo.collection import Collection
from lightrag.storage import BaseVectorStorage
import asyncio
import time
import numpy as np
from tqdm import tqdm

@dataclass
class MongoVectorStorage(BaseVectorStorage):
    _collection: Optional[Collection] = field(default=None, init=False)
    
    def __post_init__(self):
        config = self.global_config.get("vector_db_storage_cls_kwargs", {})
        
        if not self._collection:
            from atlas_manager import get_mongodb
            mongodb = get_mongodb(
                db_name=config.get("db_name", "rag_db"),
                collection_name=config.get("collection_name", "embeddings")
            )
            self._collection = mongodb.get_collection()
            self._ensure_vector_search_index()
            
    @property
    def collection(self) -> Collection:
        if self._collection is None:
            raise ValueError("MongoDB collection not initialized")
        return self._collection
    
    def _ensure_vector_search_index(self):
        """Ensure vector search index exists in MongoDB"""
        try:
            existing_indexes = list(self.collection.list_indexes())
            vector_index_exists = any(
                index.get('name') == 'vector_index' 
                for index in existing_indexes
            )
            
            if not vector_index_exists:
                print("Creating vector search index...")
                
                index_model = {
                    "mappings": {
                        "dynamic": True,
                        "fields": {
                            "embedding": {
                                "dimensions": self.embedding_func.embedding_dim,
                                "similarity": "cosine",
                                "type": "knnVector"
                            }
                        }
                    }
                }
                
                self.collection.create_index(
                    [("embedding", "vectorSearch")],
                    name="vector_index",
                    **index_model
                )
                
                print("Vector search index created successfully")
                
        except Exception as e:
            print(f"Error creating vector search index: {str(e)}")
            raise

    async def upsert(self, data: Dict[str, Dict]):
        """Insert or update vectors in MongoDB"""
        print(f"Inserting {len(data)} vectors")
        if not len(data):
            return []

        current_time = time.time()
        list_data = [
            {
                "id": k,
                "created_at": current_time,
                "content": v["content"],
                **{k1: v1 for k1, v1 in v.items() if k1 in self.meta_fields},
            }
            for k, v in data.items()
        ]
        
        contents = [v["content"] for v in data.values()]
        batches = [
            contents[i : i + self._max_batch_size]
            for i in range(0, len(contents), self._max_batch_size)
        ]

        async def wrapped_task(batch):
            result = await self.embedding_func(batch)
            pbar.update(1)
            return result

        embedding_tasks = [wrapped_task(batch) for batch in batches]
        pbar = tqdm(total=len(embedding_tasks), desc="Generating embeddings", unit="batch")
        embeddings_list = await asyncio.gather(*embedding_tasks)
        pbar.close()

        embeddings = np.concatenate(embeddings_list)
        if len(embeddings) == len(list_data):
            for i, d in enumerate(list_data):
                d["embedding"] = embeddings[i].tolist()
            
            operations = [
                {
                    "replaceOne": {
                        "filter": {"id": d["id"]},
                        "replacement": d,
                        "upsert": True
                    }
                }
                for d in list_data
            ]
            
            result = self.collection.bulk_write(operations)
            return [d["id"] for d in list_data]
        else:
            print(f"Embedding mismatch: {len(embeddings)} != {len(list_data)}")
            return []

    async def query(self, query: str, top_k: int = 5):
        """Search for similar vectors using MongoDB vector search"""
        embedding = await self.embedding_func([query])
        embedding = embedding[0]

        pipeline = [
            {
                "$vectorSearch": {
                    "queryVector": embedding.tolist(),
                    "path": "embedding",
                    "numCandidates": top_k * 10,
                    "limit": top_k,
                    "index": "vector_index",
                }
            },
            {
                "$project": {
                    "id": 1,
                    "created_at": 1,
                    "content": 1,
                    "distance": {"$meta": "vectorSearchScore"},
                    "metadata": "$$ROOT"
                }
            }
        ]

        results = list(self.collection.aggregate(pipeline))
        
        formatted_results = [
            {
                "id": doc["id"],
                "distance": doc["distance"],
                "created_at": doc["created_at"],
                "content": doc["content"],
                **{k: v for k, v in doc["metadata"].items() 
                   if k in self.meta_fields and k not in ["id", "embedding", "created_at", "content"]}
            }
            for doc in results
            if doc["distance"] >= self.cosine_better_than_threshold
        ]

        return formatted_results

    async def delete(self, ids: List[str]):
        """Delete vectors with specified IDs"""
        try:
            result = self.collection.delete_many({"id": {"$in": ids}})
            print(f"Deleted {result.deleted_count} vectors")
        except Exception as e:
            print(f"Error deleting vectors: {str(e)}")

    async def index_done_callback(self):
        """Called when indexing is complete - not needed for MongoDB"""
        pass