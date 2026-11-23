const encoder = new TextEncoder();
const sessionName = '__Host-moyan_session';
const stateName = '__Host-moyan_oauth';
const maximumBytes = 512 * 1024;
const sessionLifetime = 7 * 86400;

const base64url = bytes => btoa(String.fromCharCode(...bytes))
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const now = () => Math.floor(Date.now() / 1000);
const cookie = (name, value, age) =>
  `${name}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;

function respond(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

function readCookie(request, name) {
  return request.headers.get('Cookie')?.split(';').map(s => s.trim())
    .find(s => s.startsWith(name + '='))?.slice(name.length + 1);
}

function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function signature(secret, value) {
  const key = await hmacKey(secret, 'sign');
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function sign(secret, value) {
  return value + '.' + base64url(await signature(secret, value));
}

async function verify(secret, token) {
  const parts = token?.split('.') ?? [];
  if (parts.length !== 2 || !/^[\w-]{43}$/.test(parts[1])) return null;
  const bytes = Uint8Array.from(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  const key = await hmacKey(secret, 'verify');
  if (!await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(parts[0]))) return null;
  return parts[0].split(':');
}

async function googleLogin(env, origin) {
  const state = random();
  const verifier = random();
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
  const value = await sign(env.GOOGLE_CLIENT_SECRET, `oauth:${state}:${verifier}:${now() + 600}`);
  const query = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: origin + '/api/auth/callback',
    response_type: 'code',
    scope: 'openid',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });
  return redirect('https://accounts.google.com/o/oauth2/v2/auth?' + query, [cookie(stateName, value, 600)]);
}

async function googleCallback(request, env, url) {
  const clear = cookie(stateName, '', 0);
  const failed = () => redirect('/?login=failed', [clear]);
  const payload = await verify(env.GOOGLE_CLIENT_SECRET, readCookie(request, stateName));
  const code = url.searchParams.get('code');
  if (!payload || payload[0] !== 'oauth' || Number(payload[3]) < now() ||
      payload[1] !== url.searchParams.get('state') || !code) return failed();

  const exchange = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code', code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: url.origin + '/api/auth/callback',
      code_verifier: payload[2]
    })
  });
  if (!exchange.ok) return failed();
  const { access_token: token } = await exchange.json();
  if (typeof token !== 'string' || !token) return failed();
  const user = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!user.ok) return failed();
  const { sub } = await user.json();
  if (typeof sub !== 'string' || !/^[\w-]{1,128}$/.test(sub)) return failed();
  const session = await sign(env.GOOGLE_CLIENT_SECRET, `session:${sub}:${now() + sessionLifetime}`);
  return redirect('/?login=done', [clear, cookie(sessionName, session, sessionLifetime)]);
}

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json') || !request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let source = '';
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      return null;
    }
    source += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(source + decoder.decode()); } catch { return null; }
}

const text = value => typeof value === 'string';
const time = value => text(value) && Number.isFinite(Date.parse(value));
const optionalTime = value => value === null || time(value);
const int = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const optionalInt = (value, max) => value === null || int(value, 0, max);
const list = (value, validate) => Array.isArray(value) && value.every(validate);
const identity = value => value && text(value.id) && time(value.createdAt);
const prediction = p => identity(p) && text(p.text) && optionalInt(p.probability, 100)
  && ['pending', 'yes', 'partial', 'no', 'unknown', 'unjudgeable'].includes(p.outcome) && text(p.outcomeNote);
const action = a => identity(a) && text(a.title) && int(a.minutes, 1, 10080)
  && Object.hasOwn({ practice: 1, preparation: 1, communication: 1, research: 1, rest: 1, other: 1 }, a.kind)
  && text(a.purpose) && (a.targetPredictionId === null || text(a.targetPredictionId))
  && optionalInt(a.anxietyBefore, 10) && optionalInt(a.anxietyAfter, 10)
  && (a.review === null || (a.review && optionalInt(a.review.relief, 5)
    && optionalInt(a.review.contribution, 5) && [null, true, false].includes(a.review.reuse) && text(a.review.reason)));
const session = s => identity(s) && int(s.minutes, 1, 10080) && ['manual', 'timer'].includes(s.method) && text(s.note);
const journal = e => identity(e) && text(e.title) && text(e.category) && int(e.intensity, 0, 10)
  && optionalTime(e.eventAt) && optionalTime(e.reviewDueAt)
  && list(e.predictions, prediction) && list(e.sessions, session) && list(e.actions, action);

async function save(request, env, subject, scope) {
  const input = await readBody(request);
  if (!input || !int(input.revision, 0, Number.MAX_SAFE_INTEGER - 1) || !list(input.events, journal)) {
    return respond({ error: 'invalid_records' }, 400);
  }
  if (input.scope !== scope) return respond({ error: 'account_changed' }, 409);
  const events = JSON.stringify(input.events);
  const result = input.revision === 0
    ? await env.DB.prepare('INSERT INTO journals (subject, revision, events) VALUES (?, 1, ?) ON CONFLICT DO NOTHING').bind(subject, events).run()
    : await env.DB.prepare('UPDATE journals SET revision = revision + 1, events = ? WHERE subject = ? AND revision = ?').bind(events, subject, input.revision).run();
  return result.meta.changes === 1
    ? respond({ revision: input.revision + 1 })
    : respond({ error: 'revision_conflict' }, 409);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const configured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.DB);
    try {
      if (request.method === 'GET' && url.pathname === '/api/auth/login') {
        return configured ? await googleLogin(env, url.origin) : redirect('/?login=failed');
      }
      if (request.method === 'GET' && url.pathname === '/api/auth/callback') {
        return configured ? await googleCallback(request, env, url) : redirect('/?login=failed');
      }
      if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
        return respond({ error: 'origin' }, 403);
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        return redirect('/', [cookie(sessionName, '', 0)]);
      }
      if (url.pathname !== '/api/journal') return respond({ error: 'not_found' }, 404);
      const payload = configured && await verify(env.GOOGLE_CLIENT_SECRET, readCookie(request, sessionName));
      const subject = payload && payload[0] === 'session' && Number(payload[2]) >= now() && payload[1];
      if (!subject) return request.method === 'GET' ? respond({ configured, signedIn: false }) : respond({ error: 'sign_in' }, 401);
      const scope = base64url(await signature(env.GOOGLE_CLIENT_SECRET, 'scope:' + subject));
      if (request.method === 'PUT') return await save(request, env, subject, scope);
      if (request.method !== 'GET') return respond({ error: 'method' }, 405);
      const row = await env.DB.prepare('SELECT revision, events FROM journals WHERE subject = ?').bind(subject).first();
      return respond({ configured, signedIn: true, scope, revision: row?.revision ?? 0, events: row ? JSON.parse(row.events) : [] });
    } catch {
      return url.pathname === '/api/auth/callback' ? redirect('/?login=failed', [cookie(stateName, '', 0)])
        : respond({ error: 'unavailable' }, 503);
    }
  }
};
