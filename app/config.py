"""
Configuration Management

Centralized configuration management using environment variables
with proper validation and type safety.
"""

import os
from typing import Optional
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


# Load environment variables from .env in backend directory
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=str(_env_path))
else:
    # Fallback to parent directory .env.local (for backward compatibility)
    _parent_env = Path(__file__).parent.parent.parent / ".env.local"
    if _parent_env.exists():
        load_dotenv(dotenv_path=str(_parent_env))
    else:
        # Final fallback to current directory
        load_dotenv()


@dataclass
class LiveKitConfig:
    """LiveKit agent configuration"""
    api_key: str
    api_secret: str
    url: str
    agent_name: str = "my-interviewer"


@dataclass
class DeepgramConfig:
    """Deepgram STT configuration"""
    api_key: str
    model: str = "nova-2"
    language: str = "en"
    smart_format: bool = True
    interim_results: bool = True


@dataclass
class ElevenLabsConfig:
    """ElevenLabs TTS configuration"""
    api_key: str
    voice_id: str = "LQMC3j3fn1LA9ZhI4o8g"
    model: str = "eleven_multilingual_v2"


@dataclass
class TavusConfig:
    """Tavus Avatar configuration"""
    api_key: Optional[str] = None
    persona_id: Optional[str] = None
    replica_id: Optional[str] = None


@dataclass
class GoogleLLMConfig:
    """Google Gemini LLM configuration"""
    api_key: str
    model: str = "gemini-2.0-flash-exp"


@dataclass
class SileroVADConfig:
    """Silero VAD configuration"""
    min_speech_duration: float = 0.1
    min_silence_duration: float = 1.2


@dataclass
class SupabaseConfig:
    """Supabase configuration"""
    url: str
    service_role_key: str


@dataclass
class SMTPConfig:
    """SMTP email configuration"""
    host: Optional[str] = None
    port: int = 587
    secure: bool = False
    user: Optional[str] = None
    password: Optional[str] = None
    from_name: str = "Sreedhar's CCE Team"
    from_email: Optional[str] = None


@dataclass
class ServerConfig:
    """HTTP server configuration"""
    host: str = "0.0.0.0"
    port: int = 8000
    frontend_url: str = "http://localhost:3000"


@dataclass
class Config:
    """Main application configuration"""
    
    # LiveKit configuration
    livekit: LiveKitConfig
    
    # Plugin configurations
    deepgram: DeepgramConfig
    elevenlabs: ElevenLabsConfig
    tavus: TavusConfig
    google_llm: GoogleLLMConfig
    silero_vad: SileroVADConfig
    
    # Supabase configuration
    supabase: SupabaseConfig
    
    # SMTP configuration
    smtp: SMTPConfig
    
    # Server configuration
    server: ServerConfig
    
    # Resume processing
    MAX_RESUME_LENGTH: int = 3000  # Characters
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.getenv(
        "LOG_FORMAT",
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    @classmethod
    def from_env(cls) -> "Config":
        """
        Create configuration from environment variables.
        
        Returns:
            Configured Config instance
            
        Raises:
            ValueError: If required environment variables are missing
        """
        # Validate required LiveKit variables
        livekit_api_key = os.getenv("LIVEKIT_API_KEY")
        livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")
        livekit_url = os.getenv("LIVEKIT_URL")
        
        if not livekit_api_key:
            raise ValueError("LIVEKIT_API_KEY environment variable is required")
        if not livekit_api_secret:
            raise ValueError("LIVEKIT_API_SECRET environment variable is required")
        if not livekit_url:
            raise ValueError("LIVEKIT_URL environment variable is required")
        
        # Validate required Deepgram variable
        deepgram_key = os.getenv("DEEPGRAM_API_KEY")
        if not deepgram_key:
            raise ValueError("DEEPGRAM_API_KEY environment variable is required")
        
        # Validate required ElevenLabs variable
        elevenlabs_key = os.getenv("ELEVENLABS_API_KEY")
        if not elevenlabs_key:
            raise ValueError("ELEVENLABS_API_KEY environment variable is required")
        
        # Validate required Google LLM variable
        # The LiveKit Google plugin reads from GOOGLE_API_KEY or GOOGLE_GENAI_API_KEY
        google_api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_GENAI_API_KEY")
        if not google_api_key:
            raise ValueError("GOOGLE_API_KEY or GOOGLE_GENAI_API_KEY environment variable is required")
        
        # Validate Supabase variables
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url:
            raise ValueError("SUPABASE_URL environment variable is required")
        if not supabase_key:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY environment variable is required")
        
        # SMTP configuration (optional)
        smtp_port = os.getenv("SMTP_PORT", "587")
        smtp_secure = os.getenv("SMTP_SECURE", "false").lower() == "true" or smtp_port == "465"
        
        return cls(
            livekit=LiveKitConfig(
                api_key=livekit_api_key,
                api_secret=livekit_api_secret,
                url=livekit_url,
                agent_name=os.getenv("LIVEKIT_AGENT_NAME", "my-interviewer"),
            ),
            deepgram=DeepgramConfig(
                api_key=deepgram_key,
                model=os.getenv("DEEPGRAM_MODEL", "nova-2"),
                language=os.getenv("DEEPGRAM_LANGUAGE", "en"),
                smart_format=os.getenv("DEEPGRAM_SMART_FORMAT", "true").lower() == "true",
                interim_results=os.getenv("DEEPGRAM_INTERIM_RESULTS", "true").lower() == "true",
            ),
            elevenlabs=ElevenLabsConfig(
                api_key=elevenlabs_key,
                voice_id=os.getenv("ELEVENLABS_VOICE_ID", "LQMC3j3fn1LA9ZhI4o8g"),
                model=os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
            ),
            tavus=TavusConfig(
                api_key=os.getenv("TAVUS_API_KEY"),
                persona_id=os.getenv("TAVUS_PERSONA_ID"),
                replica_id=os.getenv("TAVUS_REPLICA_ID"),
            ),
            google_llm=GoogleLLMConfig(
                api_key=google_api_key,
                model=os.getenv("GOOGLE_LLM_MODEL", "gemini-2.0-flash-exp"),
            ),
            silero_vad=SileroVADConfig(
                min_speech_duration=float(os.getenv("SILERO_MIN_SPEECH_DURATION", "0.1")),
                min_silence_duration=float(os.getenv("SILERO_MIN_SILENCE_DURATION", "1.2")),
            ),
            supabase=SupabaseConfig(
                url=supabase_url,
                service_role_key=supabase_key,
            ),
            smtp=SMTPConfig(
                host=os.getenv("SMTP_HOST"),
                port=int(smtp_port),
                secure=smtp_secure,
                user=os.getenv("SMTP_USER"),
                password=os.getenv("SMTP_PASSWORD"),
                from_name=os.getenv("SMTP_FROM_NAME", "Sreedhar's CCE Team"),
                from_email=os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_USER"),
            ),
            server=ServerConfig(
                host=os.getenv("SERVER_HOST", "0.0.0.0"),
                port=int(os.getenv("SERVER_PORT", "8000")),
                frontend_url=os.getenv("NEXT_PUBLIC_APP_URL") or os.getenv("FRONTEND_URL", "http://localhost:3000"),
            ),
        )




def get_config() -> Config:
    """
    Get configuration from environment variables.
    
    Returns:
        Configuration instance
    """
    return Config.from_env()

