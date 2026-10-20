// API for the cheap-food map. Cloudflare serves the files in public/ directly;
// only /api/* reaches this code (run_worker_first in wrangler.jsonc).
import { validateSubmission } from './validate.js';

const MAX_BODY_BYTES = 4096;

// All senders together: at most this many submissions per 10 minutes.
// Stops floods without storing anything about who sent what.
const FLOOD_LIMIT = 30;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/api/spots':
          return request.method === 'GET' ? await listSpots(env) : methodNotAllowed('GET');
        case '/api/submissions':
          return request.method === 'POST' ? await createSubmission(request, env, url) : methodNotAllowed('POST');
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

// Live spots with the newest price of each dish, cheapest dish first.
async function listSpots(env) {
  const [spots, prices] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, name, area, city, lat, lng, kind, maps_url
         FROM spots
        WHERE status = 'live'`,
    ),
    env.DB.prepare(
      `SELECT p.spot_id, p.dish, p.price_egp, p.checked_on
         FROM prices p
         JOIN spots s ON s.id = p.spot_id
        WHERE s.status = 'live'
        ORDER BY p.checked_on DESC, p.id DESC`,
    ),
  ]);

  // Rows arrive newest first, so the first row per dish is its current price.
  const itemsBySpot = new Map();
  for (const { spot_id, dish, price_egp, checked_on } of prices.results) {
    const items = itemsBySpot.get(spot_id) ?? [];
    if (!items.some((item) => item.dish === dish)) items.push({ dish, price_egp, checked_on });
    itemsBySpot.set(spot_id, items);
  }

  const out = [];
  for (const spot of spots.results) {
    const items = itemsBySpot.get(spot.id);
    if (!items) continue; // a spot without a price isn't useful yet
    items.sort((a, b) => a.price_egp - b.price_egp);
    out.push({ ...spot, items });
  }
  out.sort((a, b) => a.items[0].price_egp - b.items[0].price_egp);

  return json({ spots: out }, 200, { 'Cache-Control': 'public, max-age=60' });
}

async function createSubmission(request, env, url) {
  // Same-site form only. JSON-only also makes other sites' browsers ask first (CORS), and we never say yes.
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'forbidden' }, 403);
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) {
    return json({ error: 'json_only' }, 415);
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  // Honeypot: people never see this field, bots fill it in. Pretend it worked.
  if (body?.website) return json({ ok: true }, 201);

  const check = validateSubmission(body);
  if (!check.ok) return json({ error: 'invalid', fields: check.errors }, 422);

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM submissions
      WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')`,
  ).first('n');
  if (recent >= FLOOD_LIMIT) return json({ error: 'busy' }, 429, { 'Retry-After': '600' });

  const v = check.value;
  await env.DB.prepare(
    `INSERT INTO submissions (spot_name, area, city, dish, price_egp, lat, lng, maps_url, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(v.spot_name, v.area, v.city, v.dish, v.price_egp, v.lat, v.lng, v.maps_url, v.note)
    .run();

  return json({ ok: true }, 201);
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
