"""
Legacy Agent Entry Point

This file is maintained for backward compatibility.
It imports and runs the new enterprise-structured agent entrypoint.
"""

from app.agents.entrypoint import entrypoint
from livekit import agents
from app.config import get_config
from app.utils.logger import get_logger
import sys

logger = get_logger(__name__)

if __name__ == "__main__":
    config = get_config()
    
    logger.info("=" * 60)
    logger.info("🔧 AGENT WORKER STARTING (Legacy Entry Point)")
    logger.info("=" * 60)
    logger.info(f"   Agent Name: '{config.livekit.agent_name}'")
    logger.info(f"   Status: Registering with LiveKit Cloud...")
    logger.info(f"   Waiting for job dispatch...")
    logger.info("=" * 60)
    
    # If no command is provided, default to 'dev' to start the worker
    if len(sys.argv) == 1:
        sys.argv.append('dev')
    
    agents.cli.run_app(agents.WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name=config.livekit.agent_name,
    ))
