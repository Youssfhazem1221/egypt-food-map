// API for the cheap-food map: /api/* (functions/api/[[route]].js sends requests here).
// Cloudflare serves everything else from public/; spot pages come from functions/spot/[id].js.
import { liveSpots } from './spots.js';
import { validateCheck, validateSubmission } from './validate.js';

const MAX_BODY_BYTES = 4096;

// All senders together, per 10 minutes. Stops floods without storing anything about who sent what.
const SUBMISSION_FLOOD_LIMIT = 30;
const CHECK_FLOOD_LIMIT = 60;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/api/spots':
          return request.method === 'GET' ? await listSpots(env) : methodNotAllowed('GET');
        case '/api/submissions':
          return request.method === 'POST' ? await createSubmission(request, env, url) : methodNotAllowed('POST');
        case '/api/checks':
          return request.method === 'POST' ? await createCheck(request, env, url) : methodNotAllowed('POST');
        case '/api/health':
          return json({ ok: true });
        default:
          return json({ error: 'not_found' }, 404);
      }
    } catch (err) {
      console.error(err);
      return json({ error: 'server_error' }, 500);
    }
  },
};

async function listSpots(env) {
  return json({ spots: await liveSpots(env) }, 200, { 'Cache-Control': 'public, max-age=60' });
}

async function createSubmission(request, env, url) {
  const { body, error } = await readJson(request, url);
  if (error) return error;

  // Honeypot: people never see this field, bots fill it in. Pretend it worked.
  if (body?.website) return json({ ok: true }, 201);

  const check = validateSubmission(body);
  if (!check.ok) return json({ error: 'invalid', fields: check.errors }, 422);
  if (await tooBusy(env, 'submissions', SUBMISSION_FLOOD_LIMIT)) return busy();

  const v = check.value;
  await env.DB.prepare(
    `INSERT INTO submissions (spot_name, area, city, dish, price_egp, lat, lng, maps_url, note, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(v.spot_name, v.area, v.city, v.dish, v.price_egp, v.lat, v.lng, v.maps_url, v.note, v.kind)
    .run();

  return json({ ok: true }, 201);
}

// "السعر لسه كده؟": a confirm counts right away; a new price waits for review.
async function createCheck(request, env, url) {
  const { body, error } = await readJson(request, url);
  if (error) return error;
  if (body?.website) return json({ ok: true, status: 'applied' }, 201);

  const check = validateCheck(body);
  if (!check.ok) return json({ error: 'invalid', fields: check.errors }, 422);
  const v = check.value;

  const spot = await env.DB.prepare(`SELECT id FROM spots WHERE id = ? AND status = 'live'`).bind(v.spot_id).first();
  if (!spot) return json({ error: 'invalid', fields: ['spot_id'] }, 422);
  if (await tooBusy(env, 'price_checks', CHECK_FLOOD_LIMIT)) return busy();

  const status = v.kind === 'confirm' ? 'applied' : 'pending';
  await env.DB.prepare(`INSERT INTO price_checks (spot_id, kind, dish, price_egp, status) VALUES (?, ?, ?, ?, ?)`)
    .bind(v.spot_id, v.kind, v.dish, v.price_egp, status)
    .run();

  return json({ ok: true, status }, 201);
}

// Same-site JSON only. JSON makes other sites' browsers ask first (CORS), and we never say yes.
async function readJson(request, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return { error: json({ error: 'forbidden' }, 403) };
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) {
    return { error: json({ error: 'json_only' }, 415) };
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return { error: json({ error: 'too_large' }, 413) };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: json({ error: 'too_large' }, 413) };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: json({ error: 'bad_json' }, 400) };
  }
}

// table is one of two fixed names, never user input.
async function tooBusy(env, table, limit) {
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')`,
  ).first('n');
  return recent >= limit;
}

function busy() {
  return json({ error: 'busy' }, 429, { 'Retry-After': '600' });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function methodNotAllowed(allow) {
  return json({ error: 'method_not_allowed' }, 405, { Allow: allow });
}
