// Minimal MCP stdio test server speaking newline-delimited JSON-RPC 2.0.
// Usage: node scripts/mock-mcp.js
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
let initialized = false;
rl.on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!msg || typeof msg !== 'object') return;
  if (msg.method === 'initialize') {
    out({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock', version: '1.0.0' } } });
    initialized = true;
  } else if (msg.method === 'notifications/initialized') {
    // no response
  } else if (msg.method === 'tools/list') {
    out({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'echo', description: 'Echo back a message', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }] } });
  } else if (msg.method === 'tools/call') {
    const msgText = (msg.params && msg.params.arguments && msg.params.arguments.message) || '';
    out({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'echo: ' + msgText }] } });
  } else if (msg.id != null) {
    out({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
  }
});
process.stdin.on('end', () => process.exit(0));
