# LiveKit Agent Not Joining Room - Issue Report

## Problem Description

I have a LiveKit voice agent application with a React frontend and Python backend. The frontend successfully connects to the LiveKit room, but the agent never joins. The frontend shows the error: **"Agent did not join the room"** and the session ends after ~30 seconds.

## Architecture

- **Frontend**: Next.js React app using `@livekit/components-react`
- **Backend**: Python agent using `livekit-agents` SDK
- **LiveKit**: Using LiveKit Cloud (not self-hosted)
- **Agent Name**: `"my-interviewer"`

## Frontend Code

### Agent Configuration (`frontend/app-config.ts`)
```typescript
export const APP_CONFIG_DEFAULTS: AppConfig = {
  agentName: 'my-interviewer',
  // ... other config
};
```

### Connection Details API (`frontend/app/api/connection-details/route.ts`)
```typescript
function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  agentName?: string
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (agentName) {
    at.roomConfig = new RoomConfiguration({
      agents: [{ agentName }],
    });
  }

  return at.toJwt();
}
```

### Session Setup (`frontend/components/app/app.tsx`)
```typescript
const session = useSession(
  tokenSource,
  appConfig.agentName ? { agentName: appConfig.agentName } : undefined
);
```

## Backend Code

### Agent Entrypoint (`backend/agent.py`)
```python
if __name__ == "__main__":
    print("\n" + "="*60)
    print("🔧 AGENT WORKER STARTING")
    print("="*60)
    print(f"   Agent Name: 'my-interviewer'")
    print(f"   Status: Registering with LiveKit Cloud...")
    print(f"   Waiting for job dispatch...")
    print("="*60 + "\n")
    
    agents.cli.run_app(agents.WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name="my-interviewer",
    ))
```

### Entrypoint Function (simplified)
```python
async def entrypoint(ctx: JobContext):
    await ctx.connect()
    # ... setup STT, LLM, TTS plugins
    session = AgentSession(...)
    await session.start(room=ctx.room, agent=ProfessionalArjun())
    # ... rest of the code
```

## Environment Variables

```bash
LIVEKIT_API_KEY=*** (set in .env.local)
LIVEKIT_API_SECRET=*** (set in .env.local)
LIVEKIT_URL=https://ai-avatar-qglco458.livekit.cloud
ELEVENLABS_API_KEY=*** (set)
TAVUS_API_KEY=*** (set)
```

## Current Behavior

1. ✅ Frontend connects to LiveKit room successfully
2. ✅ WebRTC connection established
3. ✅ Room connection state: `CONNECTED`
4. ❌ Agent never joins the room
5. ❌ Frontend shows: "Agent did not join the room"
6. ❌ Session disconnects after ~30 seconds

## Agent Worker Logs

```
============================================================
🔧 AGENT WORKER STARTING
============================================================
   Agent Name: 'my-interviewer'
   Status: Registering with LiveKit Cloud...
   Waiting for job dispatch...
============================================================
```

The agent worker starts and says it's "Registering with LiveKit Cloud" and "Waiting for job dispatch", but no job is dispatched when the frontend connects.

## Questions

1. **Why isn't the agent being dispatched when a room is created with `agentName: 'my-interviewer'` in the token's `roomConfig`?**

2. **Is there a mismatch between how the frontend requests the agent vs how the backend registers?**

3. **Do I need to configure anything in LiveKit Cloud dashboard for agent dispatch to work?**

4. **Should the agent name in the frontend `app-config.ts` match exactly with the `agent_name` in `WorkerOptions`?**

5. **Are there any additional environment variables or configuration needed for LiveKit Cloud agent dispatch?**

6. **Is the `RoomConfiguration` with `agents: [{ agentName }]` the correct way to request an agent in the token?**

## What I've Tried

1. ✅ Verified agent name matches: `"my-interviewer"` in both frontend and backend
2. ✅ Verified environment variables are set correctly
3. ✅ Confirmed frontend successfully connects to LiveKit
4. ✅ Checked that `roomConfig` is being set in the participant token
5. ✅ Verified agent worker starts and registers with LiveKit Cloud

## Expected Behavior

When a user clicks "Start call" in the frontend:
1. Frontend creates a room with agent request in token
2. LiveKit Cloud dispatches the agent worker
3. Agent joins the room
4. Chat and voice interaction works

## Actual Behavior

1. Frontend creates a room with agent request in token ✅
2. LiveKit Cloud does NOT dispatch the agent worker ❌
3. Agent never joins ❌
4. Session ends with "Agent did not join" error ❌

## Additional Context

- Using LiveKit Cloud (not self-hosted)
- Agent worker runs locally and connects to LiveKit Cloud
- Frontend is a Next.js app
- Backend is Python using `livekit-agents` SDK
- Repository: `livekit-examples/agent-starter-react`

Please help me identify why the agent dispatch is not working and how to fix it.

