import asyncio
from atlas_manager import get_mongodb
from build_rag import create_embedding_function
import torch

async def rebuild_vector_index(collection):
    try:
        await collection.database.command({
            'createIndexes': collection.name,
            'indexes': [{
                'name': 'vector_search_index',
                'key': {'vector': 'knnVector'},
                'knnVector': {
                    'dimension': 1024,
                    'similarity': 'cosine'
                }
            }]
        })
        print("Vector index created successfully")
    except Exception as e:
        print(f"Error creating index: {str(e)}")

async def update_documents(collection):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    embedding_func = await create_embedding_function(device)
    
    docs = list(collection.find({"vector": {"$exists": False}}))
    
    if not docs:
        print("No documents need updating")
        return
        
    batch_size = 32
    for i in range(0, len(docs), batch_size):
        batch = docs[i:i + batch_size]
        texts = [doc.get("content", "") for doc in batch]
        embeddings = await embedding_func.func(texts)
        
        for doc, embedding in zip(batch, embeddings):
            collection.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "vector": embedding.tolist(),
                        "metadata": doc.get("metadata", {})
                    }
                }
            )
        print(f"Updated {min(i + batch_size, len(docs))}/{len(docs)} documents")

async def main():
    mongodb = get_mongodb()
    collection = mongodb.get_collection()
    
    print("Rebuilding vector index...")
    await rebuild_vector_index(collection)
    
    print("Updating document vectors...")
    await update_documents(collection)

if __name__ == "__main__":
    asyncio.run(main())