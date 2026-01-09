#!/bin/bash
# Start both API Server and Agent Worker in background

echo "🚀 Starting API Server and Agent Worker..."

# Start API server in background
python run_server.py &
SERVER_PID=$!

# Wait a moment for server to initialize
sleep 3

# Start agent worker in background
python agent.py dev &
AGENT_PID=$!

echo "✅ Both services started"
echo "   API Server PID: $SERVER_PID"
echo "   Agent Worker PID: $AGENT_PID"

# Wait for both processes
wait $SERVER_PID $AGENT_PID

