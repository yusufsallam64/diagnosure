import logging
import subprocess
import sys
import time
from pathlib import Path
import socket
import requests
import atexit
import os
import signal

# Configure logging with more detailed format
logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG for more information
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger(__name__)

def is_port_in_use(port: int) -> bool:
    """Check if the ChromaDB port is in use"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            result = s.connect_ex(('localhost', port))
            logger.debug(f"Port {port} in use check result: {result}")
            return result == 0
    except Exception as e:
        logger.error(f"Error checking port {port}: {e}")
        return False

def get_process_on_port(port: int) -> int:
    """Get PID of process using the specified port"""
    try:
        if sys.platform == "win32":
            output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True)
            if output:
                return int(output.split()[-1])
        else:
            output = subprocess.check_output(f"lsof -i :{port} -t", shell=True)
            if output:
                return int(output.strip())
    except subprocess.CalledProcessError:
        pass
    return None

def cleanup_server(port: int) -> None:
    """Stop any existing ChromaDB server process"""
    logger.info(f"Attempting to cleanup ChromaDB server on port {port}")
    
    try:
        # Get process using the port
        pid = get_process_on_port(port)
        if pid:
            logger.info(f"Found process {pid} using port {port}")
            try:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)], check=True)
                else:
                    os.kill(pid, signal.SIGTERM)
                    time.sleep(1)  # Give process time to terminate gracefully
                    if is_port_in_use(port):  # If still running
                        os.kill(pid, signal.SIGKILL)  # Force kill
                logger.info(f"Successfully terminated process {pid}")
            except Exception as e:
                logger.error(f"Error terminating process {pid}: {e}")
        
        # Additional cleanup for ChromaDB specific processes
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/IM", "chroma.exe"], shell=True, check=False)
        else:
            subprocess.run(["pkill", "-f", "chroma"], check=False)
            
        # Wait for port to be freed
        timeout = 10
        start_time = time.time()
        while is_port_in_use(port) and time.time() - start_time < timeout:
            time.sleep(0.5)
            
        if is_port_in_use(port):
            logger.error(f"Port {port} still in use after cleanup")
        else:
            logger.info(f"Port {port} successfully freed")
            
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")

def start_chroma_server(data_dir: str = "./chroma_db", port: int = 8000) -> subprocess.Popen:
    """Start ChromaDB server with enhanced error handling and diagnostics"""
    process = None
    try:
        # Clean up any existing server
        cleanup_server(port)
        
        # Ensure data directory exists and is writable
        data_path = Path(data_dir)
        data_path.mkdir(parents=True, exist_ok=True)
        
        if not os.access(str(data_path), os.W_OK):
            raise PermissionError(f"No write access to {data_dir}")
        
        logger.info(f"Starting ChromaDB server on port {port} with data dir: {data_dir}")
        
        # Set up environment variables for ChromaDB
        env = os.environ.copy()
        env["CHROMA_SERVER_HTTP_PORT"] = str(port)
        env["CHROMA_SERVER_HOST"] = "localhost"
        
        # Start the server process with output capture
        process = subprocess.Popen(
            ["chroma", "run", "--path", str(data_dir)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True  # Enable text mode for output
        )
        
        # Register cleanup handler
        atexit.register(lambda: cleanup_server(port))
        
        # Monitor server startup
        max_retries = 10
        retry_delay = 1
        server_started = False
        
        for attempt in range(max_retries):
            print(f"Checking server status (attempt {attempt + 1}/{max_retries})")
            
            # Check process status
            if process.poll() is not None:
                # Process has terminated
                stdout, stderr = process.communicate()
                logger.error(f"ChromaDB process terminated unexpectedly")
                logger.error(f"stdout: {stdout}")
                logger.error(f"stderr: {stderr}")
                raise RuntimeError("ChromaDB process terminated unexpectedly")
            
            # Check if port is in use
            if is_port_in_use(port):
                try:
                    response = requests.get(
                        f"http://localhost:{port}/api/v1/heartbeat",
                        timeout=5
                    )
                    if response.status_code == 200:
                        logger.info("ChromaDB server started successfully")
                        server_started = True
                        break
                except requests.RequestException as e:
                    logger.debug(f"Server not ready yet: {e}")
            
            time.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 5)  # Exponential backoff with max 5 seconds
        
        if not server_started:
            if process and process.poll() is None:
                process.terminate()
                stdout, stderr = process.communicate(timeout=5)
                logger.error(f"Server startup failed. stdout: {stdout}, stderr: {stderr}")
            raise RuntimeError("Failed to start ChromaDB server - timeout waiting for server to become ready")
            
        return process
            
    except Exception as e:
        logger.error(f"Error starting ChromaDB: {str(e)}")
        if process and process.poll() is None:
            process.terminate()
            try:
                stdout, stderr = process.communicate(timeout=5)
                logger.error(f"Process output - stdout: {stdout}, stderr: {stderr}")
            except subprocess.TimeoutExpired:
                process.kill()
        cleanup_server(port)
        raise RuntimeError(f"Failed to start ChromaDB server: {str(e)}")

if __name__ == "__main__":
    try:
        process = start_chroma_server()
        process.wait()
    except KeyboardInterrupt:
        logger.info("Shutting down ChromaDB server...")
        cleanup_server(8000)
    except Exception as e:
        logger.error(f"Error in main: {e}")
        sys.exit(1)