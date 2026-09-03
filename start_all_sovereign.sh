#!/usr/bin/env bash
# KGU Sovereign AI Mesh & GraveFlow Engine Unified 1-Click Launcher

echo "=========================================================="
echo "🚀 LAUNCHING KGU SOVEREIGN AI ENGINE & HARDWARE MESH"
echo "=========================================================="

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# 1. Kill any stale server processes
killall node 2>/dev/null

# 2. Boot Local Hardware AI Mesh Router (Port 11435)
echo "🌐 Starting Sovereign Local AI Mesh Router (Port 11435)..."
node sovereign_mesh_router.js > /tmp/mesh_router.log 2>&1 &
sleep 2

# 3. Boot Core Server (Port 8002)
echo "❤️ Starting GraveFlow Core Server (Port 8002)..."
node server.js > /tmp/graveflow_server.log 2>&1 &
sleep 2

# 4. Boot C-Suite AI Executive Hub (Port 8003)
echo "👑 Starting C-Suite AI Executive Hub (Port 8003)..."
node csuite.js > /tmp/csuite_server.log 2>&1 &
sleep 2

echo "=========================================================="
echo "✅ SOVEREIGN ENGINE FULLY ONLINE!"
echo "=========================================================="
echo "🌐 Admin Dashboard:  http://localhost:8002/admin.html"
echo "📱 Driver Operations: http://localhost:8002/driver.html"
echo "👑 C-Suite AI Board: http://localhost:8003"
echo "⚡ AI Mesh Router:   http://localhost:11435/mesh/health"
echo "=========================================================="

# Display live status
node mesh_status.js
