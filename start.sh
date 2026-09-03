Created At: 2026-07-14T00:21:17Z
Completed At: 2026-07-14T00:21:17Z
#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "🪦 GraveFlow — Production Startup"
echo "==================================="

# 1. Check Ollama
if ! pgrep -x "ollama" > /dev/null 2>&1; then
    echo "🤖 Starting Ollama..."
    ollama serve &
    sleep 2
else
    echo "✅ Ollama is running"
fi

# 2. Pull required models if missing
echo "📦 Checking AI models..."
ollama pull llama3.2 2>/dev/null || echo "⚠️  llama3.2 pull failed (may already exist)"
ollama pull llava 2>/dev/null || echo "⚠️  llava pull failed (may already exist)"

# 3. Start servers
if command -v pm2 &> /dev/null; then
    echo "🚀 Starting with PM2..."
    pm2 start server.js --name graveflow-server --no-autorestart 2>/dev/null || pm2 restart graveflow-server
    pm2 start csuite.js --name graveflow-csuite --no-autorestart 2>/dev/null || pm2 restart graveflow-csuite
    pm2 status
else
    echo "🚀 Starting with node (install PM2 for process management: npm install -g pm2)"
    node server.js &
    SERVER_PID=$!
    node csuite.js &
    CSUITE_PID=$!
    echo "✅ GraveFlow backend: PID $SERVER_PID (port 8002)"
    echo "✅ C-Suite AI: PID $CSUITE_PID (port 8003)"
    echo "Press Ctrl+C to stop all services"
    wait
fi

echo "🪦 All GraveFlow services started"

