# Backend Services Architecture

## Overview

The backend consists of **two main processes** and **five core services** that work together to provide:
1. **HTTP API Server** (FastAPI) - Handles file uploads, bookings, and scheduling
2. **LiveKit Agent** (Python) - Handles voice interviews with AI

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│                    http://localhost:3000                        │
└────────────┬──────────────────────────────┬─────────────────────┘
             │                              │
             │                              │
    ┌────────▼────────┐            ┌────────▼────────┐
    │   HTTP API      │            │  LiveKit Agent │
    │  (FastAPI)      │            │   (agent.py)    │
    │ Port: 8000      │            │                 │
    └────────┬────────┘            └────────┬────────┘
             │                              │
    ┌────────▼──────────────────────────────▼────────┐
    │         SERVICES LAYER                        │
    ├────────────────────────────────────────────────┤
    │  ┌──────────────┐  ┌──────────────┐          │
    │  │ ResumeService│  │BookingService│          │
    │  └──────┬───────┘  └──────┬───────┘          │
    │         │                 │                   │
    │  ┌──────▼─────────────────▼───────┐          │
    │  │      EmailService              │          │
    │  └────────────────────────────────┘          │
    │                                               │
    │  ┌──────────────┐  ┌──────────────┐          │
    │  │PluginService │  │Transcript    │          │
    │  │              │  │Service       │          │
    │  └──────┬───────┘  └──────┬───────┘          │
    └─────────┼──────────────────┼──────────────────┘
              │                  │
    ┌─────────▼──────────────────▼─────────┐
    │      EXTERNAL SERVICES                │
    ├───────────────────────────────────────┤
    │  • Supabase (Database + Storage)      │
    │  • Deepgram (Speech-to-Text)          │
    │  • Google Gemini (LLM)               │
    │  • ElevenLabs (Text-to-Speech)        │
    │  • Tavus (Avatar - Optional)          │
    │  • SMTP Server (Email)               │
    └───────────────────────────────────────┘
```

---

## Service Details

### 1. **ResumeService** (`app/services/resume_service.py`)

**Purpose**: Processes uploaded resume/application files

**Responsibilities**:
- Validates file type and size (PDF, DOC, DOCX, max 5MB)
- Extracts text from PDF files using PyPDF2
- Extracts text from DOC/DOCX files using python-docx
- Cleans and normalizes extracted text

**Key Methods**:
- `validate_file()` - Checks file type, size, MIME type
- `extract_text()` - Extracts text from file content

**Used By**:
- `main.py` → `/api/upload-application` endpoint

**Flow**:
```
Frontend uploads file
    ↓
API receives file
    ↓
ResumeService.validate_file() → Validates
    ↓
ResumeService.extract_text() → Extracts text
    ↓
Returns: {resumeUrl, resumeText, extractionError}
```

---

### 2. **BookingService** (`app/services/booking_service.py`)

**Purpose**: Manages interview bookings in Supabase database

**Responsibilities**:
- Creates interview bookings with unique tokens
- Retrieves booking information by token
- Uploads resume files to Supabase Storage
- Generates unique 32-character hex tokens

**Key Methods**:
- `create_booking()` - Creates new booking, returns token
- `get_booking()` - Retrieves booking by token
- `upload_resume_to_storage()` - Uploads file to Supabase Storage

**Dependencies**:
- Supabase Client (Database + Storage)

**Used By**:
- `main.py` → `/api/schedule-interview` endpoint
- `main.py` → `/api/booking/{token}` endpoint
- `main.py` → `/api/upload-application` (for storage)

**Flow**:
```
Schedule Interview Request
    ↓
BookingService.create_booking()
    ↓
Generates unique token
    ↓
Saves to Supabase: interview_bookings table
    ↓
Returns: token
```

---

### 3. **EmailService** (`app/services/email_service.py`)

**Purpose**: Sends interview confirmation emails

**Responsibilities**:
- Sends HTML emails via SMTP
- Formats interview details (date, time, link)
- Handles email sending errors gracefully

**Key Methods**:
- `send_interview_email()` - Sends confirmation email with interview link

**Dependencies**:
- SMTP Server (Gmail, SendGrid, etc.)
- Config: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD

**Used By**:
- `main.py` → `/api/schedule-interview` endpoint

**Flow**:
```
Interview Scheduled
    ↓
EmailService.send_interview_email()
    ↓
Creates HTML email with interview link
    ↓
Sends via SMTP
    ↓
Returns: (success, error_message)
```

---

### 4. **PluginService** (`app/services/plugin_service.py`)

**Purpose**: Initializes and configures LiveKit plugins for voice agent

**Responsibilities**:
- Initializes STT (Speech-to-Text) - Deepgram
- Initializes LLM (Language Model) - Google Gemini
- Initializes TTS (Text-to-Speech) - ElevenLabs
- Initializes VAD (Voice Activity Detection) - Silero
- Configures Tavus Avatar (optional)
- Wraps LLM for transcript forwarding

**Key Methods**:
- `initialize_plugins()` - Initializes all plugins
- `_initialize_stt()` - Sets up Deepgram STT
- `_initialize_llm()` - Sets up Google Gemini LLM with transcript forwarding
- `_initialize_tts()` - Sets up ElevenLabs TTS
- `_initialize_vad()` - Sets up Silero VAD

**Dependencies**:
- Deepgram API
- Google Gemini API
- ElevenLabs API
- Silero VAD model
- Tavus API (optional)

**Used By**:
- `entrypoint.py` → Agent initialization

**Flow**:
```
Agent Entrypoint Starts
    ↓
PluginService.initialize_plugins()
    ↓
Initializes: STT, LLM, TTS, VAD
    ↓
Wraps LLM with TranscriptService
    ↓
Returns: {stt, llm, tts, vad, use_tavus}
```

---

### 5. **TranscriptService** (`app/services/transcript_service.py`)

**Purpose**: Forwards agent responses to frontend in real-time

**Responsibilities**:
- Captures streaming LLM responses
- Sends text to frontend via LiveKit data channel
- Provides incremental updates (every 50 chars) to reduce lag
- Handles streaming errors gracefully

**Key Methods**:
- `send_transcript()` - Sends text via data channel
- `wrap_llm_chat()` - Wraps LLM chat method to capture responses

**Dependencies**:
- LiveKit Room (for data channel)

**Used By**:
- `plugin_service.py` → Wraps LLM plugin

**Flow**:
```
LLM generates response (streaming)
    ↓
ContextManagerWrapper captures chunks
    ↓
Accumulates text
    ↓
Sends every 50 characters (incremental)
    ↓
Sends final text when complete
    ↓
Frontend receives via data channel
```

---

## Service Connections

### HTTP API Flow (Port 8000)

```
1. Upload Application Flow:
   Frontend → /api/upload-application
       ↓
   ResumeService.validate_file()
       ↓
   BookingService.upload_resume_to_storage() → Supabase Storage
       ↓
   ResumeService.extract_text()
       ↓
   Returns: {resumeUrl, resumeText}

2. Schedule Interview Flow:
   Frontend → /api/schedule-interview
       ↓
   BookingService.create_booking() → Supabase Database
       ↓
   EmailService.send_interview_email() → SMTP Server
       ↓
   Returns: {interviewUrl, emailSent}
```

### LiveKit Agent Flow (agent.py)

```
1. Agent Startup:
   agent.py → entrypoint()
       ↓
   Connects to LiveKit room
       ↓
   PluginService.initialize_plugins()
       ↓
   Creates AgentSession (STT, LLM, TTS, VAD)
       ↓
   Creates ProfessionalArjun agent
       ↓
   Starts session

2. During Interview:
   User speaks → STT (Deepgram) → Text
       ↓
   LLM (Google Gemini) → Response
       ↓
   TranscriptService → Frontend (data channel)
       ↓
   TTS (ElevenLabs) → Audio → User
```

---

## Configuration Flow

All services receive configuration from `app/config.py`:

```
.env.local (Environment Variables)
    ↓
Config.from_env()
    ↓
Config instance
    ↓
Services initialized with config:
    • ResumeService(config)
    • BookingService(config)
    • EmailService(config)
    • PluginService(config)
```

---

## Data Flow Examples

### Example 1: Complete Interview Scheduling

```
1. User uploads resume
   Frontend → POST /api/upload-application
   ├─ ResumeService validates file
   ├─ BookingService uploads to Supabase Storage
   └─ ResumeService extracts text
   Returns: {resumeUrl, resumeText}

2. User schedules interview
   Frontend → POST /api/schedule-interview
   ├─ BookingService.create_booking()
   │  └─ Saves to Supabase: interview_bookings
   │  └─ Returns: token
   └─ EmailService.send_interview_email()
      └─ Sends email with interview link
   Returns: {interviewUrl, emailSent}

3. User clicks interview link
   Frontend → GET /interview/{token}
   ├─ Fetches booking from backend
   └─ Connects to LiveKit room

4. Agent starts interview
   Agent → PluginService initializes plugins
   ├─ STT listens to user speech
   ├─ LLM generates responses
   ├─ TranscriptService forwards to frontend
   └─ TTS speaks responses
```

### Example 2: Real-time Interview

```
User: "Hello"
    ↓
STT (Deepgram) → "Hello"
    ↓
LLM (Google Gemini) → "Hello! I am Arjun..."
    ↓
TranscriptService → Sends to frontend (incremental)
    ↓
TTS (ElevenLabs) → Audio: "Hello! I am Arjun..."
    ↓
User hears response
```

---

## Key Integration Points

1. **Config → Services**: All services receive `Config` instance
2. **API → Services**: FastAPI endpoints use services
3. **Agent → PluginService**: Agent uses PluginService for plugins
4. **PluginService → TranscriptService**: LLM wrapped with transcript forwarding
5. **Services → External APIs**: Services connect to external services (Supabase, Deepgram, etc.)

---

## Error Handling

Each service handles errors independently:
- **ResumeService**: Returns extraction errors, doesn't crash
- **BookingService**: Raises AgentError on failures
- **EmailService**: Returns (success, error) tuple, doesn't block
- **PluginService**: Raises ConfigurationError/ServiceError
- **TranscriptService**: Logs errors, continues streaming

---

## Summary

- **5 Services**: Resume, Booking, Email, Plugin, Transcript
- **2 Processes**: HTTP API (8000), LiveKit Agent
- **Shared Config**: All services use same Config instance
- **Independent**: Services can work independently
- **Composable**: Services are combined in API endpoints and agent

