const https = require('https');

const PORT = process.env.PORT || 3000;

require('http').createServer((req, res) => {

  // ── CORS — must be set BEFORE any early return ──────────
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age',       '86400');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check / wake-up ping
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'Avinya Proxy' }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }

  // Collect POST body
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {

    // Validate JSON
    let parsed;
    try { parsed = JSON.parse(body); }
    catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } }));
      return;
    }

    // Forward to Anthropic
    const payload = JSON.stringify(parsed);
    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'Content-Length':    Buffer.byteLength(payload),
        'x-api-key':         process.env.ANTHROPIC_KEY || '',
        'anthropic-version': '2023-06-01',
      },
    };

    const upstream = https.request(options, (uRes) => {
      let data = '';
      uRes.on('data', chunk => { data += chunk; });
      uRes.on('end', () => {
        res.writeHead(uRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    });

    upstream.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Upstream error: ' + err.message } }));
    });

    upstream.write(payload);
    upstream.end();
  });

}).listen(PORT, () => console.log('Avinya proxy listening on port ' + PORT));
