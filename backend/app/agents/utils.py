"""
Agent Utility Functions

Helper functions for LiveKit agent operations.
"""

from typing import Union

from livekit import rtc

from app.utils.logger import get_logger

logger = get_logger(__name__)


def get_track_source_name(source: Union[int, rtc.TrackSource]) -> str:
    """
    Convert track source to readable name.
    
    Args:
        source: Track source (integer or enum)
        
    Returns:
        Human-readable track source name
    """
    # Map integer values to names (LiveKit uses integers: 1=MICROPHONE, 2=CAMERA, etc.)
    source_map = {
        1: "MICROPHONE",
        2: "CAMERA",
        3: "SCREEN_SHARE",
        4: "UNKNOWN"
    }
    
    # Handle integer values
    if isinstance(source, int):
        return source_map.get(source, f"UNKNOWN({source})")
    
    # Handle enum values
    try:
        enum_map = {
            rtc.TrackSource.SOURCE_MICROPHONE: "MICROPHONE",
            rtc.TrackSource.SOURCE_CAMERA: "CAMERA",
            rtc.TrackSource.SOURCE_SCREEN_SHARE: "SCREEN_SHARE",
            rtc.TrackSource.SOURCE_UNKNOWN: "UNKNOWN"
        }
        return enum_map.get(source, f"UNKNOWN({source})")
    except Exception as e:
        logger.warning(f"Error mapping track source: {e}")
        return f"UNKNOWN({source})"

