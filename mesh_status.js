/**
 * CLI Health & Hardware Monitor for KGU Sovereign AI Mesh Cluster
 */

const http = require('http');

http.get('http://127.0.0.1:11435/mesh/health', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const status = JSON.parse(data);
      console.log('\n================================================================');
      console.log(`⚡  ${status.cluster.toUpperCase()} STATUS REPORT`);
      console.log('================================================================');
      console.log(`🖥️   Hardware Pool : 7 Cluster Nodes (4 MacBooks + 3 Windows PCs)`);
      console.log(`🧠  Total Cluster RAM : ${status.total_ram_gb} GB`);
      console.log(`💾  Total Storage    : ${status.total_storage_tb} TB`);
      console.log(`🟢  Online Nodes     : ${status.online_nodes} / ${status.total_nodes}`);
      console.log('----------------------------------------------------------------');

      status.nodes.forEach(node => {
        const icon = node.status === 'ONLINE' ? '🟢' : '🔴';
        const latency = node.latency_ms >= 0 ? `${node.latency_ms}ms` : 'N/A';
        console.log(`${icon} [${node.id}] ${node.name.padEnd(32)} | ${node.os.toUpperCase()} | ${node.ram_gb}GB RAM | Ping: ${latency}`);
      });
      console.log('================================================================\n');
    } catch (e) {
      console.log('⚠️ Failed to parse mesh status:', e.message);
    }
  });
}).on('error', (err) => {
  console.log('🔴 Sovereign Mesh Router is not currently running on port 11435.');
  console.log('Run `node sovereign_mesh_router.js` to start the cluster load balancer.');
});
