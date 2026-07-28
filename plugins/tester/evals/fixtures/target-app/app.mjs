import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.APP_PORT || 4310);
const PDP_BASE_URL = process.env.PDP_BASE_URL || 'http://pdp:4320';
const STATE_PATH = process.env.APP_STATE_PATH || path.join(DIR, 'state.json');

const seed = JSON.parse(fs.readFileSync(path.join(DIR, 'seed.json'), 'utf8'));
const store = fs.existsSync(STATE_PATH)
  ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
  : structuredClone(seed);

function persist() {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(store, null, 2)}\n`);
}
persist();

// Sessions live in memory, so restarting the app invalidates every established session.
const sessions = new Map();

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}
const ok = (res, data, status = 200) => json(res, status, { ok: true, data });
const err = (res, status, code) => json(res, status, { ok: false, error: code });

function html(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
    });
    req.on('end', () => resolve(b));
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = v.join('=');
  }
  return out;
}

function currentUser(req) {
  const sid = parseCookies(req).tsid;
  if (!sid) return null;
  const userId = sessions.get(sid);
  if (!userId) return null;
  return store.users.find((u) => u.id === userId) || null;
}

function membershipsOf(userId) {
  return store.memberships.filter((m) => m.userId === userId);
}

async function pdpCheck(user, action, resource) {
  const r = await fetch(`${PDP_BASE_URL}/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user, action, resource }),
    signal: AbortSignal.timeout(2000),
  });
  if (!r.ok) throw new Error(`pdp status ${r.status}`);
  return r.json();
}

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('POST', /^\/api\/session$/, async (req, res) => {
  const { email, password } = JSON.parse((await readBody(req)) || '{}');
  const user = store.users.find((u) => u.email === email && u.password === password);
  if (!user) return err(res, 401, 'invalid_credentials');
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, user.id);
  res.setHeader('set-cookie', `tsid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  return ok(res, { id: user.id, email: user.email, role: user.role });
});

route('DELETE', /^\/api\/session$/, async (req, res) => {
  const sid = parseCookies(req).tsid;
  if (sid) sessions.delete(sid);
  res.setHeader('set-cookie', 'tsid=; Path=/; Max-Age=0');
  return ok(res, { ended: true });
});

route('GET', /^\/api\/user$/, async (req, res) => {
  const user = currentUser(req);
  if (!user) return err(res, 401, 'unauthenticated');
  return ok(res, { id: user.id, email: user.email, role: user.role, orgId: user.orgId });
});

route('GET', /^\/api\/projects$/, async (req, res) => {
  const user = currentUser(req);
  if (!user) return err(res, 401, 'unauthenticated');

  const memberships = membershipsOf(user.id);
  const visible = [];
  for (const project of store.projects) {
    let decision;
    try {
      decision = await pdpCheck(user, 'project.read', { orgId: project.orgId, memberships });
    } catch {
      decision = { allow: true, reason: 'pdp_unreachable' };
    }
    if (decision.allow) visible.push(project);
  }
  return ok(res, visible);
});

route('GET', /^\/api\/projects\/([\w-]+)$/, async (req, res, [id]) => {
  const user = currentUser(req);
  if (!user) return err(res, 401, 'unauthenticated');
  const project = store.projects.find((p) => p.id === id);
  if (!project) return err(res, 404, 'not_found');

  let decision;
  try {
    decision = await pdpCheck(user, 'project.read', {
      orgId: project.orgId,
      memberships: membershipsOf(user.id),
    });
  } catch {
    return err(res, 503, 'authorization_unavailable');
  }
  if (!decision.allow) return err(res, 403, 'forbidden');
  return ok(res, project);
});

route('DELETE', /^\/api\/projects\/([\w-]+)$/, async (req, res, [id]) => {
  const user = currentUser(req);
  if (!user) return err(res, 401, 'unauthenticated');
  const idx = store.projects.findIndex((p) => p.id === id);
  if (idx === -1) return err(res, 404, 'not_found');

  let decision;
  try {
    decision = await pdpCheck(user, 'project.delete', { orgId: store.projects[idx].orgId });
  } catch {
    return err(res, 503, 'authorization_unavailable');
  }
  if (!decision.allow) return err(res, 403, 'forbidden');

  const [removed] = store.projects.splice(idx, 1);
  persist();
  return ok(res, { deleted: removed.id });
});

route('PATCH', /^\/api\/memberships\/([\w-]+)$/, async (req, res, [id]) => {
  const user = currentUser(req);
  if (!user) return err(res, 401, 'unauthenticated');
  const membership = store.memberships.find((m) => m.id === id);
  if (!membership) return err(res, 404, 'not_found');
  if (membership.userId !== user.id && user.role !== 'admin') return err(res, 403, 'forbidden');

  const patch = JSON.parse((await readBody(req)) || '{}');
  if (patch.status && !['active', 'rejected'].includes(patch.status)) {
    return err(res, 422, 'unsupported_status');
  }
  if (patch.status && membership.status !== 'pending') {
    return err(res, 409, 'not_pending');
  }
  if (patch.status) membership.status = patch.status;
  persist();
  return ok(res, membership);
});

route('GET', /^\/api\/admin\/audit$/, async (req, res) => {
  const user = currentUser(req);
  if (!user) return err(res, 401, 'unauthenticated');
  if (!user.role) return err(res, 403, 'forbidden');
  return ok(res, store.auditEvents);
});

const page = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body>${body}</body></html>`;

route('GET', /^\/login$/, async (req, res) => {
  const failed = new URL(req.url, 'http://x').searchParams.has('failed');
  return html(
    res,
    200,
    page(
      'Sign in',
      `<h1>Sign in</h1>
${failed ? '<p data-testid="login-error">Invalid email or password.</p>' : ''}
<form method="post" action="/login">
  <input type="email" name="email" data-testid="login-email" required>
  <input type="password" name="password" data-testid="login-password" required>
  <button type="submit" data-testid="login-submit">Sign in</button>
</form>`,
    ),
  );
});

route('POST', /^\/login$/, async (req, res) => {
  const form = new URLSearchParams(await readBody(req));
  const user = store.users.find(
    (u) => u.email === form.get('email') && u.password === form.get('password'),
  );
  if (!user) {
    res.writeHead(302, { location: '/login?failed=1' });
    return res.end();
  }
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, user.id);
  res.writeHead(302, {
    location: '/dashboard',
    'set-cookie': `tsid=${sid}; Path=/; HttpOnly; SameSite=Lax`,
  });
  return res.end();
});

route('GET', /^\/dashboard$/, async (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.writeHead(302, { location: '/login' });
    return res.end();
  }
  return html(
    res,
    200,
    page(
      'Dashboard',
      `<nav>
  <a href="/dashboard" data-testid="nav-dashboard">Dashboard</a>
  <a href="/admin" data-testid="nav-admin">Admin</a>
</nav>
<h1 data-testid="dashboard-heading">Dashboard</h1>
<p data-testid="current-user">${user.email}</p>`,
    ),
  );
});

route('GET', /^\/health$/, async (req, res) => ok(res, { status: 'up' }));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = url.pathname.match(r.pattern);
    if (!m) continue;
    try {
      return await r.handler(req, res, m.slice(1));
    } catch (e) {
      console.error(`[app] ${req.method} ${url.pathname} failed:`, e.message);
      return err(res, 500, 'internal_error');
    }
  }
  return err(res, 404, 'not_found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[app] listening on ${PORT}, pdp at ${PDP_BASE_URL}`);
});
