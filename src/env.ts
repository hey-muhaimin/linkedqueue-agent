// Loads KEY=value lines from ./.env into process.env. Real env vars win.
// Import this first in every entry point (main.ts, cli.ts).
try {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(process.cwd(), '.env');
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env file */ }
