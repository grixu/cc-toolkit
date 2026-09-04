import http from 'node:http';

const PORT = Number(process.env.PDP_PORT || 4320);

// Policy is intentionally tiny: the app owns the interesting authorization branches, the PDP
// only answers org-scoped resource access so that pausing it takes a real decision offline.
function decide({ user, action, resource }) {
  if (!user) return { allow: false, reason: 'no_principal' };
  if (user.role === 'admin') return { allow: true, reason: 'admin' };

  if (action === 'project.read') {
    const memberships = resource?.memberships || [];
    const active = memberships.some((m) => m.orgId === resource.orgId && m.status === 'active');
    return { allow: active, reason: active ? 'active_membership' : 'no_active_membership' };
  }
  if (action === 'project.delete') return { allow: false, reason: 'requires_admin' };

  return { allow: false, reason: 'no_matching_policy' };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method !== 'POST' || req.url !== '/check') {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'not_found' }));
  }

  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    let parsed;
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'bad_request' }));
    }
    // Protocol bound: a resource id past 64 word characters is refused outright, never evaluated.
    const rid = parsed.resource?.id;
    if (rid !== undefined && !/^[\w-]{1,64}$/.test(String(rid))) {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_resource_id' }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(decide(parsed)));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[pdp] listening on ${PORT}`);
});
