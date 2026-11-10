// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* Serve the built page as it would run inside Claude, for tests and for trying it without Claude:
 *     node test/serve.js [port]      then open http://127.0.0.1:<port>/
 * The page gets a stand-in runtime (test/fake_claude.js): a canned tutor, an in-memory store, and the REAL engine
 * (strategy-lab/ml-engine, started here in MCP mode). On a machine without PyTorch only the numpy experiments run.
 *     http://127.0.0.1:<port>/?off=mcp,sample    the same page with those capabilities missing */
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
function engine() {
  const proc = spawn('python3', ['-m', 'mllab_engine', '--mcp'], { cwd: path.join(ROOT, '..', 'strategy-lab', 'ml-engine'), stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = '', next = 1; const waiting = new Map();
  proc.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; let m; try { m = JSON.parse(line); } catch (e) { continue; } const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m); } } });
  const rpc = (method, params) => new Promise((ok) => { const id = next++; waiting.set(id, ok); proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const ready = rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dllab-test', version: '0' } }).then(() => { proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'); });
  return { call: async (tool, input) => { await ready; const m = await rpc('tools/call', { name: tool, arguments: input || {} }); return m.error ? { content: [{ type: 'text', text: m.error.message }], isError: true } : m.result; }, close: () => { try { proc.kill(); } catch (e) {} } };
}
function start(port) {
  const eng = engine(), fake = fs.readFileSync(path.join(__dirname, 'fake_claude.js'), 'utf8');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/__mcp') {
      let body = ''; req.on('data', (d) => { body += d; }); req.on('end', async () => {
        let out; try { const { tool, input } = JSON.parse(body); out = await eng.call(tool, input); } catch (e) { out = { transport: 'server_unavailable', message: String(e.message || e) }; }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
      }); return;
    }
    if (url.pathname !== '/') { res.writeHead(404); return res.end('not found'); }
    const off = (url.searchParams.get('off') || '').replace(/[^a-z,]/g, '');
    const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('<body>', () => '<body>\n<script>window.__FAKE_OFF = ' + JSON.stringify(off) + ';\n' + fake + '\n</script>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(page);
  });
  return new Promise((ok) => server.listen(port || 0, '127.0.0.1', () => ok({ url: 'http://127.0.0.1:' + server.address().port + '/', close: () => { eng.close(); server.close(); } })));
}
module.exports = { start };
if (require.main === module) start(+process.argv[2] || 8270).then((s) => console.log('Deep Learning Lab with a stand-in Claude runtime: ' + s.url + '   (Ctrl-C to stop)'));
