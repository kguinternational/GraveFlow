/**
 * KGU Sovereign Local AI Mesh Router & Load Balancer
 * Interconnects 7 Hardware Nodes (4 MacBooks + 3 Windows PCs, 512GB RAM, 17TB Storage)
 * Provides zero-cost, failover-protected local AI inference across the cluster.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const configPath = path.join(__dirname, 'mesh_config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Track node status
const nodeHealth = new Map();

config.nodes.forEach(node => {
  nodeHealth.set(node.id, {
    ...node,
    status: 'UNKNOWN',
    latency_ms: -1,
    last_check: 0,
    active_requests: 0
  });
});

// Periodic health checks (every 10 seconds)
async function probeNodes() {
  for (const [id, node] of nodeHealth.entries()) {
    const startTime = Date.now();
    const url = `http://${node.ip}:${node.port}/api/tags`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        const latency = Date.now() - startTime;
        nodeHealth.set(id, {
          ...node,
          status: 'ONLINE',
          latency_ms: latency,
          models: data.models ? data.models.map(m => m.name) : [],
          last_check: Date.now()
        });
      } else {
        nodeHealth.set(id, { ...node, status: 'OFFLINE', latency_ms: -1, last_check: Date.now() });
      }
    } catch (err) {
      nodeHealth.set(id, { ...node, status: 'OFFLINE', latency_ms: -1, last_check: Date.now() });
    }
  }
}

// Select best node for request
function selectNode(requestedCapability = 'text') {
  const onlineNodes = Array.from(nodeHealth.values()).filter(n => n.status === 'ONLINE');
  if (onlineNodes.length === 0) {
    // Fallback to local master
    return nodeHealth.get('mac-node-01');
  }

  // Filter by capability if matching
  const capableNodes = onlineNodes.filter(n => n.capabilities && n.capabilities.includes(requestedCapability));
  const candidatePool = capableNodes.length > 0 ? capableNodes : onlineNodes;

  // Pick node with lowest active requests then lowest latency
  candidatePool.sort((a, b) => {
    if (a.active_requests !== b.active_requests) {
      return a.active_requests - b.active_requests;
    }
    return (a.latency_ms || 0) - (b.latency_ms || 0);
  });

  return candidatePool[0];
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  // Mesh Status Endpoint
  if (reqUrl.pathname === '/mesh/health' || reqUrl.pathname === '/cluster/status') {
    const nodesStatus = Array.from(nodeHealth.values());
    const onlineCount = nodesStatus.filter(n => n.status === 'ONLINE').length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      cluster: config.cluster_name,
      total_nodes: config.total_nodes,
      online_nodes: onlineCount,
      total_ram_gb: config.total_ram_gb,
      total_storage_tb: config.total_storage_tb,
      nodes: nodesStatus
    }, null, 2));
    return;
  }

  // Determine target node
  const targetNode = selectNode();
  targetNode.active_requests += 1;

  const targetUrl = `http://${targetNode.ip}:${targetNode.port}${req.url}`;

  try {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', async () => {
      const buffer = Buffer.concat(body);
      
      const proxyRes = await fetch(targetUrl, {
        method: req.method,
        headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
        body: req.method !== 'GET' && req.method !== 'HEAD' ? buffer : undefined
      });

      res.writeHead(proxyRes.status, Object.fromEntries(proxyRes.headers.entries()));
      proxyRes.body.pipe(res);
      
      proxyRes.body.on('end', () => {
        targetNode.active_requests = Math.max(0, targetNode.active_requests - 1);
      });
    });
  } catch (err) {
    targetNode.active_requests = Math.max(0, targetNode.active_requests - 1);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Mesh Node Proxy Error', details: err.message }));
  }
});

const PORT = config.listen_port || 11435;
server.listen(PORT, () => {
  console.log(`🌐 [KGU Sovereign AI Mesh] Load Balancer running on port ${PORT}`);
  console.log(`💻 Hardware Pool: 7 Nodes (4 MacBooks + 3 Windows PCs) | 512 GB RAM | 17 TB Storage`);
  probeNodes();
  setInterval(probeNodes, 10000);
});
