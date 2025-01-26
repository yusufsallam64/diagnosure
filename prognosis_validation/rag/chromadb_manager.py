import logging
import subprocess
import sys
import time
from pathlib import Path
import socket
import requests
import atexit

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        # logging.FileHandler('logs/chroma.log')
    ]
)
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
    """Start ChromaDB server as a persistent process"""
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

if __name__ == "__main__":
    # Start the server and keep it running
    process = start_chroma_server()
    try:
        process.wait()
    except KeyboardInterrupt:
        logger.info("Shutting down ChromaDB server...")
        cleanup_server(8000)