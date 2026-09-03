'use strict';
require('dotenv').config();
const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

const TUNNEL_URLS_PATH = path.join(__dirname, 'tunnel_urls.json');

async function startTunnels() {
    console.log('🚇 GraveFlow — Starting internet tunnels...');

    try {
        // Tunnel port 8002 (The Love Effect OS backend)
        const tunnel8002 = await localtunnel({ port: 8002, subdomain: 'graveflow' });
        console.log(`✅ The Love Effect OS (port 8002) → ${tunnel8002.url}`);

        // Tunnel port 8003 (C-Suite AI)
        const tunnel8003 = await localtunnel({ port: 8003, subdomain: 'graveflow-csuite' });
        console.log(`✅ C-Suite AI (port 8003) → ${tunnel8003.url}`);

        const urls = {
            tleo: tunnel8002.url,
            csuite_ai: tunnel8003.url,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(TUNNEL_URLS_PATH, JSON.stringify(urls, null, 2));
        console.log(`\n📋 Public URLs written to tunnel_urls.json`);
        console.log(`\n🌐 Share these URLs to give remote access:`);
        console.log(`   The Love Effect OS Backend: ${tunnel8002.url}`);
        console.log(`   C-Suite AI:        ${tunnel8003.url}`);
        console.log(`\nPress Ctrl+C to close tunnels.`);

        tunnel8002.on('close', () => console.log('🔌 The Love Effect OS tunnel closed'));
        tunnel8003.on('close', () => console.log('🔌 C-Suite tunnel closed'));

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Closing tunnels...');
            tunnel8002.close();
            tunnel8003.close();
            // Clear the URLs file on exit
            fs.writeFileSync(TUNNEL_URLS_PATH, JSON.stringify({ status: 'offline', timestamp: new Date().toISOString() }, null, 2));
            process.exit(0);
        });

    } catch (err) {
        // Subdomain may not be available — retry without subdomain
        console.warn(`⚠️  Subdomain unavailable (${err.message}), using random URLs...`);
        try {
            const tunnel8002 = await localtunnel({ port: 8002 });
            const tunnel8003 = await localtunnel({ port: 8003 });
            const urls = {
                tleo: tunnel8002.url,
                csuite_ai: tunnel8003.url,
                timestamp: new Date().toISOString()
            };
            fs.writeFileSync(TUNNEL_URLS_PATH, JSON.stringify(urls, null, 2));
            console.log(`\n🌐 Public URLs:`);
            console.log(`   The Love Effect OS Backend: ${tunnel8002.url}`);
            console.log(`   C-Suite AI:        ${tunnel8003.url}`);
            console.log(`\nPress Ctrl+C to close tunnels.`);
            tunnel8002.on('close', () => console.log('🔌 The Love Effect OS tunnel closed'));
            tunnel8003.on('close', () => console.log('🔌 C-Suite tunnel closed'));
            process.on('SIGINT', () => {
                tunnel8002.close();
                tunnel8003.close();
                fs.writeFileSync(TUNNEL_URLS_PATH, JSON.stringify({ status: 'offline', timestamp: new Date().toISOString() }, null, 2));
                process.exit(0);
            });
        } catch (err2) {
            console.error('❌ Failed to start tunnels:', err2.message);
            process.exit(1);
        }
    }
}

startTunnels();
