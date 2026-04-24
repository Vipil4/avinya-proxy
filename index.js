const https = require('https');
const PORT  = process.env.PORT || 3000;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age',       '86400');
}

require('http').createServer((req, res) => {

  cors(res);  // always set CORS first

  // Preflight — browser sends this before every POST
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400'
    });
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ status: 'ok', service: 'Avinya Proxy' }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('Method not allowed');
    return;
  }

  // Collect body
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {

    let parsed;
    try { parsed = JSON.parse(body); }
    catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: { message: 'Invalid JSON' } }));
      return;
    }

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
      }
    };

    const upstream = https.request(options, uRes => {
      let data = '';
      uRes.on('data', c => { data += c; });
      uRes.on('end', () => {
        res.writeHead(uRes.statusCode, {
          'Content-Type':                'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
      });
    });

    upstream.on('error', err => {
      res.writeHead(502, {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: { message: err.message } }));
    });

    upstream.write(payload);
    upstream.end();
  });

}).listen(PORT, () => console.log('Avinya proxy on port ' + PORT));
