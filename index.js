const https = require('https');
const PORT  = process.env.PORT || 3000;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400'
};

require('http').createServer((req, res) => {

  // CORS on every response
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); res.end(); return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ status: 'ok', service: 'Avinya Proxy' }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain', ...CORS });
    res.end('Method not allowed'); return;
  }

  // Collect body as Buffer (safe for large base64 payloads)
  const chunks = [];
  let totalSize = 0;
  const MAX = 25 * 1024 * 1024; // 25 MB limit

  req.on('data', chunk => {
    totalSize += chunk.length;
    if (totalSize > MAX) {
      res.writeHead(413, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ error: { message: 'Request too large (max 25 MB)' } }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (res.writableEnded) return;

    const bodyBuf = Buffer.concat(chunks);

    // Validate JSON
    let parsed;
    try { parsed = JSON.parse(bodyBuf.toString('utf8')); }
    catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } }));
      return;
    }

    // Re-serialise for upstream (ensure clean JSON)
    const payload    = Buffer.from(JSON.stringify(parsed), 'utf8');
    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'Content-Length':    payload.length,
        'x-api-key':         process.env.ANTHROPIC_KEY || '',
        'anthropic-version': '2023-06-01',
      }
    };

    const upstream = https.request(options, uRes => {
      const out = [];
      uRes.on('data', c => out.push(c));
      uRes.on('end', () => {
        const data = Buffer.concat(out).toString('utf8');
        res.writeHead(uRes.statusCode, {
          'Content-Type': 'application/json', ...CORS
        });
        res.end(data);
      });
    });

    upstream.on('error', err => {
      if (res.writableEnded) return;
      res.writeHead(502, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ error: { message: 'Upstream error: ' + err.message } }));
    });

    upstream.write(payload);
    upstream.end();
  });

  req.on('error', () => {});

}).listen(PORT, () => console.log('Avinya proxy on port ' + PORT));
