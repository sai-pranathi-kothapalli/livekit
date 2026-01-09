# Interview Scheduling Flow - Complete Explanation

This document explains the complete flow of interview scheduling from frontend form submission to backend agent connection.

## 📋 Table of Contents
1. [Frontend Flow](#frontend-flow)
2. [Backend Flow](#backend-flow)
3. [Data Flow Diagram](#data-flow-diagram)
4. [Key Components](#key-components)

---

## 🎨 Frontend Flow

### Step 1: User Fills Application Form
**File**: `frontend/app/(app)/apply/page.tsx`

- User enters:
  - **Name** (letters and spaces only, validated)
  - **Email** address
  - **Phone** (exactly 10 digits, validated)
  - **Resume** file (PDF/DOC/DOCX, max 5MB)
  - **Date & Time** (date picker + hour/minute/AM-PM dropdowns)

- **Validation**:
  - Name: Only letters, spaces, hyphens, apostrophes allowed
  - Phone: Exactly 10 digits (auto-stripped of non-digits)
  - Date/Time: Must be at least 1 minute in the future
  - Resume: File type and size validation

### Step 2: Form Submission (`handleSubmit`)
**File**: `frontend/app/(app)/apply/page.tsx` (lines 129-221)

When user clicks "Schedule interview":

1. **Client-side validation**:
   - All required fields present
   - Name matches regex pattern
   - Phone is exactly 10 digits
   - Date/time is in the future
   - Resume file selected

2. **Resume Upload** (First API Call):
   ```typescript
   POST /api/upload-resume
   Body: FormData with resume file
   ```

### Step 3: Resume Upload API
**File**: `frontend/app/api/upload-resume/route.ts`

**Process**:
1. **File Validation**:
   - Size check (max 5MB)
   - Type check (PDF, DOC, DOCX)

2. **Upload to Supabase Storage**:
   - Generate unique filename: `{timestamp}_{random}.{ext}`
   - Upload file to `resumes` bucket
   - Get public URL

3. **Text Extraction**:
   - **PDF**: Uses `pdf-parse` library to extract text
   - **DOC/DOCX**: Uses `mammoth` library to extract text
   - Cleans text (removes extra whitespace, normalizes)

4. **Response**:
   ```json
   {
     "resumeUrl": "https://...",
     "resumeText": "extracted text content...",
     "extractionError": null
   }
   ```

### Step 4: Schedule Interview API Call
**File**: `frontend/app/(app)/apply/page.tsx` (lines 195-207)

After resume upload succeeds:
```typescript
POST /api/schedule-interview
Body: {
  name: string,
  email: string,
  phone: string,
  datetime: string, // ISO format: "2024-01-15T14:30"
  resumeUrl: string,
  resumeText: string
}
```

### Step 5: Schedule Interview API Handler
**File**: `frontend/app/api/schedule-interview/route.ts`

**Process**:

1. **Validate Input**:
   - Check all required fields present
   - Validate datetime format and parse to Date object

2. **Create Booking in Database**:
   ```typescript
   createBooking({
     name,
     email,
     phone,
     scheduled_at: scheduledAt.toISOString(),
     resume_text: resumeText || null,
     resume_url: resumeUrl || null
   })
   ```
   - Generates unique **token** (32-char hex string)
   - Stores in Supabase `interview_bookings` table
   - Returns the token

3. **Generate Interview URL**:
   ```
   {baseUrl}/interview/{token}
   ```
   Example: `http://localhost:3000/interview/a1b2c3d4e5f6...`

4. **Send Email** (if SMTP configured):
   - Creates email with interview details
   - Includes formatted date/time
   - Contains interview link button
   - HTML template with styling

5. **Response**:
   ```json
   {
     "ok": true,
     "interviewUrl": "http://.../interview/{token}",
     "emailSent": true
   }
   ```

### Step 6: Success Display
**File**: `frontend/app/(app)/apply/page.tsx` (lines 430-451)

- Shows success message
- Displays interview URL link (for testing)
- User can click link or check email

---

## 🔗 Interview Link Flow

### Step 7: User Accesses Interview Link
**URL**: `/interview/{token}`
**File**: `frontend/app/(app)/interview/[token]/page.tsx`

**Process**:

1. **Extract Token from URL**:
   - Next.js dynamic route extracts `token` parameter

2. **Fetch Booking**:
   ```typescript
   const booking = await getBooking(token);
   ```
   - Queries Supabase `interview_bookings` table
   - Returns booking details if found

3. **Validate Timing**:
   - **Too Early**: If more than 5 minutes before scheduled time
     - Shows: "Your interview has not started yet"
   - **Too Late**: If more than 60 minutes after scheduled time
     - Shows: "Interview window has expired"
   - **Valid Window**: Between 5 minutes before and 60 minutes after
     - Proceeds to render interview interface

4. **Render Interview Page**:
   ```typescript
   <App appConfig={appConfig} interviewToken={token} />
   ```

### Step 8: Interview App Component
**File**: `frontend/components/app/app.tsx`

**Process**:

1. **Create Token Source**:
   - If `interviewToken` is provided, creates custom token source
   - Includes token in request body to `/api/connection-details`

2. **Request Connection Details**:
   ```typescript
   POST /api/connection-details
   Body: {
     room_config: {
       agents: [{ agent_name: "my-interviewer" }]
     },
     token: "a1b2c3d4..." // Interview token
   }
   ```

### Step 9: Connection Details API
**File**: `frontend/app/api/connection-details/route.ts`

**Process**:

1. **Extract Resume Text** (if token provided):
   ```typescript
   const booking = await getBooking(token);
   const resumeText = booking?.resume_text;
   ```

2. **Generate Room Details**:
   - Creates unique `roomName`: `voice_assistant_room_{random}`
   - Creates unique `participantIdentity`: `voice_assistant_user_{random}`
   - Participant name: `"user"`

3. **Create Room Metadata**:
   ```typescript
   const roomMetadata = resumeText 
     ? JSON.stringify({ resume_text: resumeText })
     : undefined;
   ```

4. **Generate Participant Token**:
   ```typescript
   createParticipantToken(
     { identity, name },
     roomName,
     agentName,
     roomMetadata  // Contains resume text
   )
   ```
   - Creates LiveKit AccessToken with:
     - Room join permissions
     - Publish/subscribe permissions
     - Room configuration with agent name
     - **Room metadata** with resume text (JSON stringified)

5. **Response**:
   ```json
   {
     "serverUrl": "wss://...",
     "roomName": "voice_assistant_room_1234",
     "participantName": "user",
     "participantToken": "eyJhbGc..."
   }
   ```

### Step 10: Frontend Connects to LiveKit
**File**: `frontend/components/app/app.tsx`

- Uses `useSession` hook from `@livekit/components-react`
- Connects to LiveKit room with participant token
- Agent is automatically invited (via room configuration)
- Interview UI is rendered with video/audio controls

---

## ⚙️ Backend Flow

### Step 11: Agent Worker Startup
**File**: `backend/agent.py` or `backend/app/agents/entrypoint.py`

**Process**:

1. **Agent Worker Registration**:
   - Runs `agents.cli.run_app()` with:
     - `entrypoint_fnc`: `entrypoint` function
     - `agent_name`: `"my-interviewer"` (from config)
   - Registers with LiveKit Cloud
   - Waits for job dispatch

2. **LiveKit Cloud Dispatch**:
   - When frontend connects with agent name in room config
   - LiveKit Cloud dispatches job to registered agent worker
   - Calls `entrypoint(ctx: JobContext)`

### Step 12: Agent Entrypoint
**File**: `backend/app/agents/entrypoint.py` (lines 26-139)

**Process**:

1. **Connect to Room**:
   ```python
   await ctx.connect()
   ```
   - Connects agent to LiveKit room
   - Gets room SID for logging

2. **Extract Resume from Metadata**:
   ```python
   resume_text = _extract_resume_from_metadata(ctx.room)
   ```
   - Reads `ctx.room.metadata`
   - Parses JSON: `{"resume_text": "..."}`
   - Extracts resume text string
   - Logs resume detection status

3. **Setup Event Handlers**:
   - Participant connected/disconnected
   - Track published/subscribed
   - Logging for debugging

4. **Initialize Plugins**:
   ```python
   plugin_service = PluginService(config)
   plugins = await plugin_service.initialize_plugins(ctx.room)
   ```
   - **STT** (Speech-to-Text): OpenAI Whisper or Deepgram
   - **LLM** (Language Model): OpenAI GPT-4
   - **TTS** (Text-to-Speech): ElevenLabs or Tavus
   - **VAD** (Voice Activity Detection): Silero VAD
   - **Turn Detection**: Multilingual model

5. **Create Agent Session**:
   ```python
   session = AgentSession(
       stt=plugins["stt"],
       llm=plugins["llm"],
       tts=plugins["tts"],
       vad=plugins["vad"],
       turn_detection=MultilingualModel(),
       allow_interruptions=False
   )
   ```

6. **Initialize Agent**:
   ```python
   agent = ProfessionalArjun(
       resume_text=resume_text,  # Resume passed here
       max_resume_length=config.MAX_RESUME_LENGTH
   )
   ```

7. **Start Session**:
   ```python
   await session.start(room=ctx.room, agent=agent)
   ```
   - Connects agent to room
   - Starts listening for user audio
   - Ready to process conversations

8. **Optional: Start Tavus Avatar**:
   - If configured, starts Tavus avatar session
   - Provides video avatar + audio
   - Falls back to ElevenLabs TTS if fails

9. **Generate Initial Greeting**:
   ```python
   await session.generate_reply(instructions="...")
   ```
   - Agent introduces as "Arjun"
   - Mentions position and company
   - Asks first question about background
   - TTS converts to audio and plays

10. **Maintain Connection**:
    ```python
    while ctx.room.isconnected():
        await asyncio.sleep(5)
    ```
    - Keeps agent active during interview
    - Processes user speech → STT → LLM → TTS → Audio output
    - Continues until user disconnects

### Step 13: Agent Interview Process
**File**: `backend/app/agents/professional_arjun.py`

- **Resume Context**: Agent has access to resume text
- **Conversation Flow**: 
  - Listens to user responses
  - STT converts speech to text
  - LLM generates responses (with resume context)
  - TTS converts response to speech
  - Audio plays to user
- **Interview Logic**: 
  - Asks technical questions
  - Evaluates responses
  - Follows structured interview flow

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND FLOW                             │
└─────────────────────────────────────────────────────────────────┘

User Form (apply/page.tsx)
    ↓
[Validate Input]
    ↓
POST /api/upload-resume
    ↓
[Upload to Supabase Storage]
[Extract Text (pdf-parse/mammoth)]
    ↓
{resumeUrl, resumeText}
    ↓
POST /api/schedule-interview
    ↓
[Create Booking in Supabase]
[Generate Token (32-char hex)]
    ↓
[Store: name, email, phone, scheduled_at, resume_text, resume_url]
    ↓
[Send Email with Interview Link]
    ↓
{interviewUrl: "/interview/{token}"}
    ↓
User Clicks Link → /interview/{token}
    ↓
[Validate Timing Window]
    ↓
<App interviewToken={token} />
    ↓
POST /api/connection-details
    Body: { room_config: {...}, token: "..." }
    ↓
[Fetch Booking by Token]
[Extract resume_text]
    ↓
[Create LiveKit AccessToken]
[Set Room Metadata: { resume_text: "..." }]
    ↓
{serverUrl, roomName, participantToken}
    ↓
Frontend Connects to LiveKit Room
    ↓
─────────────────────────────────────────────────────────────────
│                        BACKEND FLOW                             │
─────────────────────────────────────────────────────────────────
    ↓
LiveKit Cloud Dispatches Job
    ↓
Agent Worker: entrypoint(ctx)
    ↓
[Connect to Room: await ctx.connect()]
    ↓
[Extract Resume: ctx.room.metadata]
    ↓
[Initialize Plugins: STT, LLM, TTS, VAD]
    ↓
[Create AgentSession]
    ↓
[Create ProfessionalArjun(resume_text=...)]
    ↓
[Start Session: session.start(room, agent)]
    ↓
[Generate Initial Greeting]
    ↓
[Interview Loop: Speech → STT → LLM → TTS → Audio]
    ↓
[Continue until user disconnects]
```

---

## 🔑 Key Components

### Database Schema (Supabase)
**Table**: `interview_bookings`

| Column | Type | Description |
|--------|------|-------------|
| `token` | text (PK) | Unique 32-char hex identifier |
| `name` | text | Applicant name |
| `email` | text | Applicant email |
| `phone` | text | Applicant phone |
| `scheduled_at` | timestamptz | Interview date/time |
| `resume_text` | text | Extracted resume content |
| `resume_url` | text | Supabase storage URL |
| `created_at` | timestamptz | Booking creation time |

### Key Environment Variables

**Frontend**:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin operations
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`: Email configuration
- `LIVEKIT_URL`: LiveKit server URL
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: LiveKit credentials

**Backend**:
- `LIVEKIT_URL`: LiveKit server URL
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: LiveKit credentials
- `OPENAI_API_KEY`: For STT and LLM
- `ELEVENLABS_API_KEY`: For TTS
- `TAVUS_API_KEY`, `TAVUS_PERSONA_ID`: For avatar (optional)

### Timing Windows

- **Early Access**: Not allowed more than 5 minutes before scheduled time
- **Active Window**: 5 minutes before to 60 minutes after scheduled time
- **Expired**: After 60 minutes past scheduled time, link becomes inactive

### Resume Flow Summary

1. **Upload**: File → Supabase Storage → Get URL
2. **Extraction**: PDF/DOCX → Text extraction → Clean text
3. **Storage**: Text stored in `interview_bookings.resume_text`
4. **Transmission**: Token → Booking lookup → Resume in room metadata
5. **Usage**: Agent reads metadata → Uses in interview context

---

## 🔍 Debugging Points

1. **Resume Upload Fails**: Check Supabase storage bucket exists, file size/type
2. **Email Not Sent**: Check SMTP configuration, logs show warnings if not configured
3. **Token Not Found**: Verify booking created in Supabase, check token format
4. **Agent Not Joining**: Check agent worker running, agent name matches, LiveKit credentials
5. **Resume Not Available**: Check room metadata contains resume_text, verify extraction worked
6. **Timing Issues**: Verify server timezone matches, check scheduled_at format

---

## 📝 Summary

**Frontend**: Form → Upload Resume → Schedule Interview → Generate Token → Store Booking → Send Email → User Clicks Link → Connect to LiveKit → Pass Token → Get Room Details → Join Interview

**Backend**: Agent Worker Waits → Job Dispatched → Connect to Room → Extract Resume from Metadata → Initialize Plugins → Create Agent → Start Session → Conduct Interview → Process Speech → Generate Responses

The key connection point is the **token**, which:
- Links the booking in the database
- Allows resume text lookup
- Passes resume to agent via room metadata
- Enables personalized interview experience

