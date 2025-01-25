import chromadb
import logging
import subprocess
import time
import sys
import atexit
import socket
import requests
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def is_port_in_use(port: int) -> bool:
    """Check if the ChromaDB port is in use"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def cleanup_server(port: int) -> None:
    """Stop any existing ChromaDB server process"""
    if is_port_in_use(port):
        logger.info("Cleaning up existing ChromaDB server...")
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/IM", "chroma.exe"], 
                         shell=True, check=False)
        else:
            subprocess.run(["pkill", "-f", "chroma"], check=False)
        time.sleep(2)

def start_chroma_server(data_dir: str = "./chroma_db", port: int = 8000) -> subprocess.Popen:
    """Start ChromaDB server"""
    try:
        # Clean up any existing server
        cleanup_server(port)
        
        # Create data directory
        Path(data_dir).mkdir(parents=True, exist_ok=True)
        
        logger.info("Starting ChromaDB server...")
        process = subprocess.Popen(
            ["chroma", "run", "--path", str(data_dir)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Register cleanup on program exit
        atexit.register(lambda: cleanup_server(port))
        
        # Wait for server to start
        max_retries = 5
        for i in range(max_retries):
            if is_port_in_use(port):
                try:
                    response = requests.get(f"http://localhost:{port}/api/v1/heartbeat")
                    if response.status_code == 200:
                        logger.info("ChromaDB server started successfully")
                        return process
                except requests.RequestException:
                    pass
            time.sleep(3)
            
        raise RuntimeError("Failed to start ChromaDB server")
            
    except Exception as e:
        logger.error(f"Error starting ChromaDB: {str(e)}")
        cleanup_server(port)
        raise

def inspect_chroma_collections(data_dir: str = "./chroma_db"):
    """Inspect ChromaDB collections and their contents"""
    try:
        # Start ChromaDB server
        server_process = start_chroma_server(data_dir)
        
        try:
            # Initialize ChromaDB client
            client = chromadb.HttpClient(host="localhost", port=8000)
            
            # List all collections
            collections = client.list_collections()
            logger.info(f"\nFound {len(collections)} collections")
            
            for collection in collections:
                logger.info(f"\nCollection: {collection.name}")
                try:
                    # Get collection info
                    count = collection.count()
                    logger.info(f"Total items: {count}")
                    
                    if count > 0:
                        # Get a sample of items
                        sample = collection.get(limit=1)
                        logger.info(f"Sample metadata: {sample['metadatas']}")
                        logger.info(f"Embedding dimension: {len(sample['embeddings'][0]) if sample['embeddings'] else 'N/A'}")
                        
                except Exception as e:
                    logger.error(f"Error inspecting collection {collection.name}: {str(e)}")
                    
        finally:
            # Cleanup ChromaDB
            cleanup_server(8000)
            
    except Exception as e:
        logger.error(f"Error in collection inspection: {str(e)}")
        raise

if __name__ == "__main__":
    # Use absolute path for data directory
    data_dir = Path("./chroma_db").absolute()
    logger.info(f"Using ChromaDB directory: {data_dir}")
    
    inspect_chroma_collections(str(data_dir))