"""
Run FastAPI HTTP Server

Starts the FastAPI server for handling resume upload and interview scheduling.
"""

import uvicorn
from app.config import get_config

if __name__ == "__main__":
    config = get_config()
    
    uvicorn.run(
        "app.api.main:app",
        host=config.server.host,
        port=config.server.port,
        reload=True,
        log_level="info",
    )

