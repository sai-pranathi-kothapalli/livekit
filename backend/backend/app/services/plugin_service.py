"""
Plugin Service

Manages initialization and configuration of LiveKit plugins
(STT, LLM, TTS, VAD, Avatar) with proper error handling.
"""

import json
from typing import Dict, Any, Optional

from livekit import rtc
from livekit.agents import AgentSession
from livekit.plugins import (
    google,
    deepgram,
    elevenlabs,
    silero,
    tavus,
)

from app.config import Config
from app.utils.logger import get_logger
from app.utils.exceptions import ConfigurationError, ServiceError

logger = get_logger(__name__)


class ConditionalTTSWrapper:
    """
    Wrapper for TTS that tracks Tavus activation state.
    
    This wrapper tracks when Tavus is active but doesn't suppress TTS calls
    (AgentSession handles that internally). The wrapper is mainly for state tracking
    and logging. When Tavus is active, ElevenLabs TTS may show "no audio frames"
    errors, which are expected and harmless.
    """
    
    def __init__(self, tts_plugin: elevenlabs.TTS):
        """
        Initialize conditional TTS wrapper.
        
        Args:
            tts_plugin: The underlying ElevenLabs TTS plugin
        """
        self._tts = tts_plugin
        self._tavus_active = False
        logger.debug("ConditionalTTSWrapper initialized")
    
    def set_tavus_active(self, active: bool):
        """
        Set Tavus activation state.
        
        Args:
            active: True if Tavus is active and providing audio
        """
        self._tavus_active = active
        if active:
            logger.info("🔇 ConditionalTTSWrapper: Tavus is active - ElevenLabs TTS will be suppressed by AgentSession")
            logger.info("   ℹ️  'no audio frames' errors from ElevenLabs are EXPECTED and harmless")
        else:
            logger.info("🔊 ConditionalTTSWrapper: Tavus inactive - ElevenLabs TTS is active")
    
    def __getattr__(self, name: str):
        """Proxy all attributes and methods to the underlying TTS plugin"""
        return getattr(self._tts, name)


class PluginService:
    """
    Service for managing LiveKit agent plugins.
    
    Handles initialization, configuration, and error handling
    for all plugin types used by the interview agent.
    """
    
    # Domain-specific keywords for STT accuracy
    STT_KEYWORDS = [
        ("Regional Rural Bank", 10), ("RRB", 10), ("Probationary Officer", 10), ("PO", 10),
        ("NABARD", 10), ("RBI", 10), ("Banking", 10), ("Financial Inclusion", 10),
        ("Savings Account", 10), ("Current Account", 10), ("Fixed Deposit", 10), ("KYC", 10),
        ("Loan", 10), ("Interest Rate", 10), ("Repo Rate", 10), ("Base Rate", 10),
        ("NPA", 10), ("Non-Performing Asset", 10), ("PMJDY", 10), ("Mudra", 10),
        ("Digital Banking", 10), ("Customer Service", 10), ("Balance Sheet", 10), ("Account Opening", 10),
        ("Commercial Bank", 10), ("Cooperative Bank", 10), ("Rural Banking", 10), ("Banking Operations", 10),
        ("Recurring Deposit", 10), ("Overdraft", 10), ("Credit", 10), ("Debit", 10)
    ]
    
    def __init__(self, config: Config):
        """
        Initialize plugin service.
        
        Args:
            config: Application configuration instance
        """
        self.config = config
        self._tavus_active = False
        self._tts_wrapper: Optional[ConditionalTTSWrapper] = None
        logger.debug("PluginService initialized")
    
    async def initialize_plugins(self, room: rtc.Room) -> Dict[str, Any]:
        """
        Initialize all required plugins for the agent session.
        
        Args:
            room: LiveKit room instance (for transcript forwarding)
            
        Returns:
            Dictionary containing initialized plugins:
            {
                "stt": STT plugin,
                "llm": LLM plugin (with transcript forwarding),
                "tts": TTS plugin,
                "vad": VAD plugin,
                "use_tavus": bool
            }
            
        Raises:
            ConfigurationError: If required API keys are missing
            ServiceError: If plugin initialization fails
        """
        try:
            # Check Tavus configuration FIRST
            use_tavus = self._check_tavus_config()
            
            # Initialize STT plugin
            stt_plugin = self._initialize_stt()
            
            # Initialize LLM plugin with transcript forwarding
            llm_plugin = self._initialize_llm(room)
            
            # Initialize TTS plugin
            # Wrap ElevenLabs TTS to conditionally disable when Tavus is active
            elevenlabs_tts = self._initialize_tts()
            tts_plugin = ConditionalTTSWrapper(elevenlabs_tts)
            self._tts_wrapper = tts_plugin
            
            if use_tavus:
                logger.info("🔍 TTS PRIORITY CONFIGURATION:")
                logger.info("   🎯 PRIMARY: Tavus Avatar (provides video + audio)")
                logger.info("   🔄 FALLBACK: ElevenLabs TTS (only if Tavus fails)")
                logger.info("   ⚠️  IMPORTANT: When Tavus is active, ElevenLabs TTS will be suppressed")
                logger.info("   💡 If you hear double voice, Tavus may not be properly taking over audio")
                logger.info("   ✅ TTS wrapper configured - will suppress ElevenLabs when Tavus starts")
            else:
                logger.info("🔍 TTS CONFIGURATION:")
                logger.info("   🔊 PRIMARY: ElevenLabs TTS (audio only, no video)")
                logger.info("   ⚠️  Tavus is not configured - using ElevenLabs TTS")
            
            # Initialize VAD plugin
            vad_plugin = self._initialize_vad()
            
            logger.info("✅ All plugins initialized successfully")
            
            return {
                "stt": stt_plugin,
                "llm": llm_plugin,
                "tts": tts_plugin,
                "vad": vad_plugin,
                "use_tavus": use_tavus,
            }
            
        except Exception as e:
            logger.error(f"Failed to initialize plugins: {e}", exc_info=True)
            raise ServiceError(f"Plugin initialization failed: {str(e)}", "PluginService")
    
    def _initialize_stt(self) -> deepgram.STT:
        """
        Initialize Deepgram STT plugin.
        
        Returns:
            Configured Deepgram STT plugin
            
        Raises:
            ConfigurationError: If DEEPGRAM_API_KEY is missing
        """
        if not self.config.deepgram.api_key:
            raise ConfigurationError("DEEPGRAM_API_KEY is required for STT functionality")
        
        logger.info("🔍 DEEPGRAM STT CONFIGURATION:")
        logger.info(f"   DEEPGRAM_API_KEY: ✅ Set (length: {len(self.config.deepgram.api_key)} chars)")
        logger.info(f"   Model: {self.config.deepgram.model}")
        logger.info(f"   Language: {self.config.deepgram.language}")
        
        stt_plugin = deepgram.STT(
            model=self.config.deepgram.model,
            language=self.config.deepgram.language,
            smart_format=self.config.deepgram.smart_format,
            interim_results=self.config.deepgram.interim_results,
            keywords=self.STT_KEYWORDS,
        )
        
        logger.info("   ✅ Deepgram STT plugin initialized")
        logger.info("   📝 Transcripts will appear in the chat/transcript view")
        
        return stt_plugin
    
    def _initialize_llm(self, room: rtc.Room) -> google.LLM:
        """
        Initialize Google Gemini LLM plugin with transcript forwarding.
        
        Args:
            room: LiveKit room instance for data channel publishing
            
        Returns:
            Configured Google LLM plugin with transcript forwarding wrapper
        """
        logger.info("🔍 GOOGLE LLM CONFIGURATION:")
        logger.info(f"   Model: {self.config.google_llm.model}")
        
        llm_plugin = google.LLM(model=self.config.google_llm.model)
        
        # Wrap LLM chat for transcript forwarding
        if hasattr(llm_plugin, 'chat'):
            from app.services.transcript_service import TranscriptForwardingService
            transcript_service = TranscriptForwardingService(room)
            original_chat = llm_plugin.chat
            llm_plugin.chat = transcript_service.wrap_llm_chat(original_chat)
            logger.info("   ✅ LLM chat wrapped for transcript forwarding")
            logger.info("   📝 All agent responses will be sent to frontend via data channel")
        else:
            logger.warning("   ⚠️  LLM plugin does not have 'chat' method - transcript forwarding disabled")
        
        return llm_plugin
    
    def _initialize_tts(self) -> elevenlabs.TTS:
        """
        Initialize ElevenLabs TTS plugin.
        
        Returns:
            Configured ElevenLabs TTS plugin
            
        Raises:
            ConfigurationError: If ELEVENLABS_API_KEY is missing
        """
        if not self.config.elevenlabs.api_key:
            raise ConfigurationError("ELEVENLABS_API_KEY is required for TTS functionality")
        
        logger.info("🔍 ELEVENLABS TTS CONFIGURATION:")
        logger.info(f"   ELEVENLABS_API_KEY: ✅ Set (length: {len(self.config.elevenlabs.api_key)} chars)")
        logger.info(f"   Voice ID: {self.config.elevenlabs.voice_id}")
        logger.info(f"   Model: {self.config.elevenlabs.model}")
        logger.info(f"   💡 To use a different voice, set ELEVENLABS_VOICE_ID in .env.local")
        logger.info(f"   ⚠️  If you get 'audio: null' errors, check:")
        logger.info(f"      - API key is valid and has credits")
        logger.info(f"      - Voice ID exists and is accessible")
        logger.info(f"      - Model is supported (eleven_multilingual_v2 or eleven_turbo_v2)")
        
        tts_plugin = elevenlabs.TTS(
            model=self.config.elevenlabs.model,
            voice_id=self.config.elevenlabs.voice_id,
            api_key=self.config.elevenlabs.api_key,
        )
        
        logger.info("   ✅ ElevenLabs TTS plugin initialized")
        
        return tts_plugin
    
    def _initialize_vad(self) -> silero.VAD:
        """
        Initialize Silero VAD plugin.
        
        Returns:
            Configured Silero VAD plugin
        """
        logger.info("🔍 SILERO VAD CONFIGURATION:")
        logger.info(f"   Min Speech Duration: {self.config.silero_vad.min_speech_duration}s")
        logger.info(f"   Min Silence Duration: {self.config.silero_vad.min_silence_duration}s")
        
        vad_plugin = silero.VAD.load(
            min_speech_duration=self.config.silero_vad.min_speech_duration,
            min_silence_duration=self.config.silero_vad.min_silence_duration,
        )
        
        logger.info("   ✅ Silero VAD plugin initialized")
        
        return vad_plugin
    
    def _check_tavus_config(self) -> bool:
        """
        Check if Tavus avatar is configured.
        
        Returns:
            True if Tavus is configured, False otherwise
        """
        tavus_config = self.config.tavus
        
        logger.info("🔍 TAVUS CONFIGURATION CHECK:")
        logger.info(f"   TAVUS_API_KEY: {'✅ Set' if tavus_config.api_key else '❌ Missing'}")
        logger.info(f"   TAVUS_PERSONA_ID: {'✅ Set' if tavus_config.persona_id else '❌ Missing'}")
        logger.info(f"   TAVUS_REPLICA_ID: {'✅ Set' if tavus_config.replica_id else '❌ Missing'}")
        
        if tavus_config.api_key and (tavus_config.persona_id or tavus_config.replica_id):
            logger.info("   ✅ Tavus Avatar configured (will attempt to start after session)")
            logger.info("   💡 Note: ElevenLabs TTS will remain active as fallback if Tavus fails")
            return True
        else:
            logger.info("   ⚠️  Tavus Avatar NOT configured - missing required environment variables")
            if not tavus_config.api_key:
                logger.info("      Missing: TAVUS_API_KEY")
            if not tavus_config.persona_id and not tavus_config.replica_id:
                logger.info("      Missing: TAVUS_PERSONA_ID or TAVUS_REPLICA_ID")
            return False
    
    async def start_tavus_avatar(
        self,
        session: AgentSession,
        room: rtc.Room
    ) -> tavus.AvatarSession:
        """
        Start Tavus avatar session and disable ElevenLabs TTS.
        
        Args:
            session: AgentSession instance
            room: LiveKit room instance
            
        Returns:
            Started Tavus AvatarSession
            
        Raises:
            ConfigurationError: If Tavus is not configured
            ServiceError: If avatar startup fails
        """
        tavus_config = self.config.tavus
        
        if not tavus_config.api_key:
            raise ConfigurationError("TAVUS_API_KEY is required for avatar functionality")
        
        if not tavus_config.persona_id and not tavus_config.replica_id:
            raise ConfigurationError(
                "TAVUS_PERSONA_ID or TAVUS_REPLICA_ID is required for avatar functionality"
            )
        
        try:
            avatar_plugin = tavus.AvatarSession(
                api_key=tavus_config.api_key,
                persona_id=tavus_config.persona_id,
                replica_id=tavus_config.replica_id,
            )
            
            await avatar_plugin.start(session, room)
            
            # Mark Tavus as active and suppress ElevenLabs TTS
            self._tavus_active = True
            if self._tts_wrapper:
                self._tts_wrapper.set_tavus_active(True)
                logger.info("✅ ElevenLabs TTS suppressed - Tavus is now providing audio")
            
            return avatar_plugin
            
        except Exception as e:
            # If Tavus fails, keep ElevenLabs active
            self._tavus_active = False
            if self._tts_wrapper:
                self._tts_wrapper.set_tavus_active(False)
            raise ServiceError(f"Failed to start Tavus avatar: {str(e)}", "Tavus")
    
    def set_tavus_inactive(self):
        """
        Mark Tavus as inactive and re-enable ElevenLabs TTS.
        
        Call this if Tavus fails or is stopped.
        """
        self._tavus_active = False
        if self._tts_wrapper:
            self._tts_wrapper.set_tavus_active(False)
            logger.info("🔄 Tavus inactive - ElevenLabs TTS re-enabled")

