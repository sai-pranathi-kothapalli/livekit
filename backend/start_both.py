"""
Start both API Server and Agent Worker

This script runs both services in parallel using multiprocessing.
Use this if you want to run both in a single Render service.
"""

import multiprocessing
import subprocess
import sys
import time
from app.utils.logger import get_logger

logger = get_logger(__name__)


def run_server():
    """Run the FastAPI server"""
    logger.info("🚀 Starting API Server...")
    try:
        subprocess.run([sys.executable, "run_server.py"], check=True)
    except Exception as e:
        logger.error(f"❌ API Server failed: {e}")
        sys.exit(1)


def run_agent():
    """Run the LiveKit agent worker"""
    logger.info("🤖 Starting Agent Worker...")
    # Wait a bit for server to start
    time.sleep(3)
    try:
        subprocess.run([sys.executable, "agent.py", "dev"], check=True)
    except Exception as e:
        logger.error(f"❌ Agent Worker failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("🚀 STARTING BOTH SERVICES")
    logger.info("=" * 60)
    
    # Create processes
    server_process = multiprocessing.Process(target=run_server, name="API-Server")
    agent_process = multiprocessing.Process(target=run_agent, name="Agent-Worker")
    
    # Start both processes
    server_process.start()
    agent_process.start()
    
    logger.info("✅ Both services started")
    logger.info(f"   API Server PID: {server_process.pid}")
    logger.info(f"   Agent Worker PID: {agent_process.pid}")
    
    try:
        # Wait for both processes
        server_process.join()
        agent_process.join()
    except KeyboardInterrupt:
        logger.info("🛑 Shutting down...")
        server_process.terminate()
        agent_process.terminate()
        server_process.join()
        agent_process.join()

