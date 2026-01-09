"""
LiveKit Agent Entrypoint

Enterprise-grade entrypoint for LiveKit agent jobs with proper
error handling, logging, and plugin management.
"""

import asyncio
import json
from typing import Optional

from livekit import agents, rtc
from livekit.agents import JobContext, AgentSession
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from app.config import Config, get_config
from app.agents.professional_arjun import ProfessionalArjun
from app.agents.utils import get_track_source_name
from app.services.plugin_service import PluginService
from app.utils.logger import get_logger
from app.utils.exceptions import AgentError

logger = get_logger(__name__)


async def entrypoint(ctx: JobContext) -> None:
    """
    Main entrypoint for LiveKit agent jobs.
    
    This function orchestrates the complete interview agent lifecycle:
    1. Connect to LiveKit room
    2. Extract resume context from metadata
    3. Initialize plugins (STT, LLM, TTS, VAD)
    4. Create and start agent session
    5. Optionally start Tavus avatar
    6. Generate initial greeting
    7. Maintain connection until room disconnects
    
    Args:
        ctx: LiveKit JobContext containing room and job information
        
    Raises:
        AgentError: If critical agent operations fail
    """
    try:
        config = get_config()
        
        logger.info("=" * 60)
        logger.info("🚀 AGENT JOB DISPATCHED")
        logger.info("=" * 60)
        logger.info(f"📋 JOB DETAILS:")
        logger.info(f"   Job ID: {ctx.job.id}")
        logger.info(f"   Room Name: {ctx.room.name}")
        logger.info(f"   Agent Name: {config.livekit.agent_name}")
        logger.info("=" * 60)
        
        # Step 1: Connect to room
        logger.info("📡 CONNECTION PROCESS: Step 1 - Connecting to room...")
        await ctx.connect()
        logger.info("✅ Step 1: Success - Connected to room!")
        
        # Get Room SID after connection
        try:
            room_sid = await ctx.room.sid
            logger.info(f"   Room SID: {room_sid}")
        except Exception as e:
            logger.warning(f"   Room SID: Error getting SID - {e}")
            room_sid = "N/A"
        
        # Step 2: Extract resume text from room metadata
        resume_text = _extract_resume_from_metadata(ctx.room)
        
        # Step 3: Setup participant event handlers
        _setup_participant_handlers(ctx, room_sid)
        
        # Step 4: Initialize plugins
        logger.info("Step 2: Initializing Plugins (STT, LLM, TTS)...")
        plugin_service = PluginService(config)
        plugins = await plugin_service.initialize_plugins(ctx.room)
        
        # Step 5: Create agent session
        logger.info("Step 3: Creating AgentSession...")
        session = AgentSession(
            stt=plugins["stt"],
            llm=plugins["llm"],
            tts=plugins["tts"],  # ElevenLabs (required by AgentSession, fallback if Tavus fails)
            vad=plugins["vad"],
            turn_detection=MultilingualModel(),
            allow_interruptions=False,  # Prevent interruptions during formal interview
        )
        logger.info("✅ Step 3: Success - AgentSession created!")
        
        # Step 6: Start session
        logger.info("Step 4: Starting session...")
        agent = ProfessionalArjun(
            resume_text=resume_text,
            max_resume_length=config.MAX_RESUME_LENGTH
        )
        
        await session.start(room=ctx.room, agent=agent)
        logger.info("✅ Step 4: Success - Session started!")
        
        # Step 7: Start Tavus Avatar if configured
        # IMPORTANT: When Tavus starts successfully, it provides BOTH video and audio
        # ElevenLabs TTS should NOT be active when Tavus is running
        # If you hear double voice, Tavus may not be properly taking over the audio track
        if plugins.get("use_tavus"):
            await _start_tavus_avatar(plugin_service, session, ctx.room, config)
        
        # Step 8: Generate initial greeting
        logger.info("Step 5: Generating greeting...")
        await session.generate_reply(
            instructions="""
            As Arjun, start the interview with a professional, welcoming opening:
            - Introduce yourself warmly: "Hello! I am Arjun, a professional Banking Interviewer." (Ensure NO brackets are used).
            - Set a supportive context: "We're conducting an interview for the Regional Rural Bank Probationary Officer position. I'm here to assess your knowledge and suitability for this role."
            - Ask ONLY ONE simple question: "To begin, could you please tell me a bit about yourself? What's your educational background?"
            - Keep it professional, clear, and encouraging - maintain a formal yet approachable tone.
            - Show genuine interest in their learning journey.
            - Make them feel comfortable and supported.
            - CRITICAL: Ask only ONE question. Wait for their response before asking about interests or projects.
            """
        )
        logger.info("✅ Step 5: Success - Greeting generated!")
        
        logger.info("--- Entrypoint Active (Interview in progress) ---")
        
        # Keep the process alive until the room disconnects
        try:
            while ctx.room.isconnected():
                await asyncio.sleep(5)
        except Exception as e:
            logger.error(f"Loop Error: {e}")
        
        logger.info("=" * 60)
        logger.info("✅ Entrypoint Finished Successfully")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"❌ Critical error in agent entrypoint: {e}", exc_info=True)
        raise AgentError(f"Agent entrypoint failed: {str(e)}", "my-interviewer")


def _extract_resume_from_metadata(room: rtc.Room) -> Optional[str]:
    """
    Extract resume text from room metadata.
    
    Args:
        room: LiveKit room instance
        
    Returns:
        Resume text if found, None otherwise
    """
    try:
        if hasattr(room, 'metadata') and room.metadata:
            metadata_str = room.metadata
            try:
                metadata = json.loads(metadata_str)
                resume_text = metadata.get('resume_text')
                if resume_text:
                    logger.info(f"📄 RESUME DETECTED:")
                    logger.info(f"   Resume text length: {len(resume_text)} characters")
                    logger.debug(f"   Preview: {resume_text[:200]}...")
                    return resume_text
            except json.JSONDecodeError:
                logger.warning("⚠️  Could not parse room metadata as JSON")
        else:
            logger.info("📄 RESUME STATUS: No resume metadata found in room")
    except Exception as e:
        logger.warning(f"⚠️  Error reading room metadata: {e}")
    
    return None


def _setup_participant_handlers(ctx: JobContext, room_sid: str) -> None:
    """
    Setup event handlers for participant and track events.
    
    Args:
        ctx: JobContext instance
        room_sid: Room SID for logging
    """
    room_sid_storage = {"sid": room_sid}
    
    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        total = len(ctx.room.remote_participants) + 1
        participant_type = (
            "Tavus Avatar Agent" if "tavus" in participant.identity.lower() else "User"
        )
        
        logger.info("─" * 60)
        logger.info("✅ NEW PARTICIPANT JOINED")
        logger.info("─" * 60)
        logger.info(f"   Room SID: {room_sid_storage['sid']}")
        logger.info(f"   Room Name: {ctx.room.name}")
        logger.info(f"   Identity: {participant.identity}")
        logger.info(f"   SID: {participant.sid}")
        logger.info(f"   Name: {participant.name}")
        logger.info(f"   Type: {participant_type}")
        logger.info(f"   📊 UPDATED PARTICIPANT COUNT: Total: {total}")
        logger.info("─" * 60)
    
    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(
        participant: rtc.RemoteParticipant,
        reason: Optional[str] = None
    ) -> None:
        total = len(ctx.room.remote_participants) + 1
        participant_type = (
            "Tavus Avatar Agent" if "tavus" in participant.identity.lower() else "User"
        )
        
        logger.info("─" * 60)
        logger.info("❌ PARTICIPANT LEFT")
        logger.info("─" * 60)
        logger.info(f"   Room SID: {room_sid_storage['sid']}")
        logger.info(f"   Room Name: {ctx.room.name}")
        logger.info(f"   Identity: {participant.identity}")
        logger.info(f"   SID: {participant.sid}")
        logger.info(f"   Name: {participant.name}")
        logger.info(f"   Type: {participant_type}")
        logger.info(f"   Reason: {reason if reason else 'Unknown'}")
        logger.info(f"   📊 UPDATED PARTICIPANT COUNT: Total: {total}")
        logger.info("─" * 60)
    
    @ctx.room.on("track_published")
    def on_track_published(
        publication: rtc.TrackPublication,
        participant: rtc.Participant
    ) -> None:
        track_name = get_track_source_name(publication.source)
        logger.info(f"🎤 TRACK PUBLISHED:")
        logger.info(f"   Participant: {participant.identity}")
        logger.info(f"   Track Type: {track_name}")
        logger.info(f"   Room: {ctx.room.name}")
    
    @ctx.room.on("track_subscribed")
    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.TrackPublication,
        participant: rtc.Participant
    ) -> None:
        track_name = get_track_source_name(publication.source)
        logger.info(f"👂 TRACK SUBSCRIBED:")
        logger.info(f"   Participant: {participant.identity}")
        logger.info(f"   Track Type: {track_name}")
        logger.info(f"   Room: {ctx.room.name}")


async def _start_tavus_avatar(
    plugin_service: PluginService,
    session: AgentSession,
    room: rtc.Room,
    config: Config
) -> None:
    """
    Start Tavus avatar session with error handling.
    
    Args:
        plugin_service: PluginService instance
        session: AgentSession instance
        room: LiveKit room instance
        config: Application configuration
    """
    logger.info("Step 4b: Attempting to start Tavus Avatar...")
    try:
            avatar_plugin = await plugin_service.start_tavus_avatar(session, room)
            logger.info("✅ Step 4b: Success - Tavus Avatar session started!")
            logger.info("   ✅ Tavus is providing both video (avatar) and audio (TTS)")
            logger.info("   ✅ ElevenLabs TTS has been suppressed (Tavus is handling audio)")
            logger.info("   💡 If Tavus fails, ElevenLabs TTS will automatically re-enable")
    except Exception as e:
        error_msg = str(e)
        error_type = type(e).__name__
        
        logger.error(f"❌ TAVUS AVATAR ERROR DETAILS:")
        logger.error(f"   Error Type: {error_type}")
        logger.error(f"   Error Message: {error_msg}")
        
        # Re-enable ElevenLabs TTS since Tavus failed
        plugin_service.set_tavus_inactive()
        
        if "out of conversational credits" in error_msg or "402" in error_msg:
            logger.warning("Step 4b: ❌ Tavus Avatar failed - Out of credits")
            logger.info("   💡 Solution: Add credits to your Tavus account at https://tavus.io")
        elif "401" in error_msg or "unauthorized" in error_msg.lower():
            logger.warning("Step 4b: ❌ Tavus Avatar failed - Invalid API key")
            logger.info("   💡 Solution: Check your TAVUS_API_KEY in .env.local")
        elif "404" in error_msg or "not found" in error_msg.lower():
            logger.warning("Step 4b: ❌ Tavus Avatar failed - Persona/Replica not found")
            logger.info("   💡 Solution: Verify TAVUS_PERSONA_ID or TAVUS_REPLICA_ID is correct")
        elif "403" in error_msg or "forbidden" in error_msg.lower():
            logger.warning("Step 4b: ❌ Tavus Avatar failed - Access forbidden")
            logger.info("   💡 Solution: Check API key permissions and account access")
        else:
            logger.warning(f"Step 4b: ❌ Tavus Avatar failed - {error_msg}")
            logger.info("   💡 Solution: Check Tavus API status and your configuration")
        
        logger.info("   ✅ Fallback: ElevenLabs TTS is now active (audio will work)")


if __name__ == "__main__":
    import sys
    
    logger.info("=" * 60)
    logger.info("🔧 AGENT WORKER STARTING")
    logger.info("=" * 60)
    
    config = get_config()
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

