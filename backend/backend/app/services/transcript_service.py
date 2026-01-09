"""
Transcript Forwarding Service

Handles forwarding of agent responses to frontend via LiveKit data channel
with proper error handling and text accumulation.
"""

import json
import asyncio
from typing import Any, Callable, AsyncContextManager

from livekit import rtc

from app.utils.logger import get_logger

logger = get_logger(__name__)


class TranscriptForwardingService:
    """
    Service for forwarding agent transcripts to frontend.
    
    Wraps LLM chat method to capture streaming responses and
    publish them via LiveKit data channel.
    """
    
    DATA_CHANNEL_TOPIC = "lk-chat"
    
    def __init__(self, room: rtc.Room):
        """
        Initialize transcript forwarding service.
        
        Args:
            room: LiveKit room instance for data channel publishing
        """
        self.room = room
        logger.debug("TranscriptForwardingService initialized")
    
    async def send_transcript(self, text: str) -> None:
        """
        Send transcript text to frontend via data channel.
        
        Args:
            text: Transcript text to send
        """
        try:
            if not text or not text.strip():
                logger.debug("Empty transcript, skipping...")
                return
            
            # Check if room is connected
            if not self.room.isconnected():
                logger.warning("⚠️  Room not connected, cannot send transcript")
                return
            
            # Format message for LiveKit data channel
            # Frontend expects: { "message": "text content" }
            payload = json.dumps({
                "message": text,
            }).encode('utf-8')
            
            # Publish via data channel
            # Using local_participant because from agent's perspective, agent is local
            # Frontend will see this as coming from remote participant (the agent)
            await self.room.local_participant.publish_data(
                payload,
                topic=self.DATA_CHANNEL_TOPIC,
                reliable=True,
            )
            
            logger.info(f"📝 Transcript sent to frontend: {text[:100]}...")
            logger.info(f"✅ Data channel publish successful (topic: {self.DATA_CHANNEL_TOPIC}, length: {len(text)} chars)")
            
        except Exception as e:
            logger.error(f"❌ Failed to send transcript: {type(e).__name__}: {e}", exc_info=True)
    
    def wrap_llm_chat(
        self,
        original_chat: Callable[..., AsyncContextManager]
    ) -> Callable[..., "ContextManagerWrapper"]:
        """
        Wrap LLM chat method to capture and forward transcripts.
        
        Args:
            original_chat: Original LLM chat method
            
        Returns:
            Wrapped chat method that forwards transcripts
        """
        def chat_wrapper(*args, **kwargs):
            """Wrapper function that returns a context manager wrapper"""
            logger.info("🔍 LLM chat called - setting up transcript wrapper...")
            
            # Get the original context manager
            original_cm = original_chat(*args, **kwargs)
            
            return ContextManagerWrapper(original_cm, self)
        
        return chat_wrapper


class ContextManagerWrapper:
    """
    Wraps LLM chat context manager to capture streaming chunks
    and forward accumulated text to frontend.
    """
    
    def __init__(
        self,
        original_cm: AsyncContextManager,
        transcript_service: TranscriptForwardingService
    ):
        """
        Initialize context manager wrapper.
        
        Args:
            original_cm: Original async context manager from LLM
            transcript_service: Service for sending transcripts
        """
        self._cm = original_cm
        self._transcript_service = transcript_service
        self._accumulated_text = ""
        self._last_sent_length = 0  # Track how much we've already sent
        self._entered = False
        self._forwarded = False
    
    async def __aenter__(self):
        """Enter the original context manager"""
        logger.info("🔍 Transcript wrapper __aenter__ called - LLM chat starting")
        result = await self._cm.__aenter__()
        self._entered = True
        logger.info("✅ Transcript wrapper entered - ready to capture chunks")
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit and forward accumulated text"""
        try:
            result = await self._cm.__aexit__(exc_type, exc_val, exc_tb)
            
            # Forward any remaining accumulated text
            if self._accumulated_text and not self._forwarded:
                try:
                    logger.info(
                        f"📤 Forwarding final accumulated transcript "
                        f"({len(self._accumulated_text)} chars)..."
                    )
                    await self._transcript_service.send_transcript(self._accumulated_text)
                    self._last_sent_length = len(self._accumulated_text)
                except Exception as e:
                    logger.error(f"Failed to send transcript in __aexit__: {e}", exc_info=True)
                self._forwarded = True
            
            return result
            
        except Exception as e:
            logger.error(f"⚠️  Error in __aexit__: {type(e).__name__}: {e}", exc_info=True)
            raise
    
    def __aiter__(self):
        """Return self as async iterator"""
        return self
    
    async def __anext__(self):
        """Iterate over original context manager and accumulate text"""
        try:
            chunk = await self._cm.__anext__()
            logger.debug(f"📦 Received LLM chunk: {type(chunk).__name__}")
            
            # Extract text from chunk
            chunk_text = ""
            if hasattr(chunk, 'content'):
                chunk_text = chunk.content
            elif hasattr(chunk, 'text'):
                chunk_text = chunk.text
            elif isinstance(chunk, str):
                chunk_text = chunk
            elif hasattr(chunk, 'delta') and hasattr(chunk.delta, 'content'):
                chunk_text = chunk.delta.content
            
            # Accumulate text
            if chunk_text:
                self._accumulated_text += chunk_text
                
                # Send incrementally every 30 characters for real-time feedback
                # This reduces perceived lag by showing text as it streams
                new_chars = len(self._accumulated_text) - self._last_sent_length
                
                # Always send first chunk immediately (even if < 30 chars) to show something quickly
                # Then send every 30 chars after that
                should_send = (
                    self._last_sent_length == 0 or  # First chunk - send immediately
                    new_chars >= 30  # Subsequent chunks - send every 30 chars
                )
                
                if should_send:
                    try:
                        # Send current accumulated text (full text so far)
                        await self._transcript_service.send_transcript(self._accumulated_text)
                        self._last_sent_length = len(self._accumulated_text)
                        logger.info(f"📤 Sent incremental transcript ({len(self._accumulated_text)} chars, {new_chars} new)")
                    except Exception as e:
                        logger.warning(f"Failed to send incremental transcript: {e}", exc_info=False)
            
            return chunk
            
        except StopAsyncIteration:
            # Forward final accumulated text if any remains (check if there's unsent text)
            has_unsent_text = (
                self._accumulated_text and 
                len(self._accumulated_text) > self._last_sent_length
            )
            if has_unsent_text and not self._forwarded:
                try:
                    logger.info(
                        f"📤 Forwarding final transcript "
                        f"({len(self._accumulated_text)} chars, {len(self._accumulated_text) - self._last_sent_length} new)..."
                    )
                    await self._transcript_service.send_transcript(self._accumulated_text)
                    self._last_sent_length = len(self._accumulated_text)
                except Exception as e:
                    logger.error(f"Failed to send final transcript: {e}", exc_info=True)
                self._forwarded = True
            raise
    
    def __getattr__(self, name: str) -> Any:
        """Proxy any other attributes to the original context manager"""
        return getattr(self._cm, name)

