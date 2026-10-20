// Review what people sent through the form, from this PC.
//
//   npm run review                               list pending submissions
//   npm run review -- spots                      list spots on the map
//   npm run review -- approve 12                 put #12 on the map (it needs a location)
//   npm run review -- approve 12 --lat 30.0444 --lng 31.2357 --kind "كشري"
//   npm run review -- approve 12 --spot 3        add #12's price to spot #3 instead of a new spot
//   npm run review -- approve 12 --team          we checked this price ourselves
//   npm run review -- reject 12
//
// Add --local to use the local dev database instead of the live one.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { EGYPT } from '../src/validate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const NOW = `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`;

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    local: { type: 'boolean' },
    lat: { type: 'string' },
    lng: { type: 'string' },
    kind: { type: 'string' },
    spot: { type: 'string' },
    team: { type: 'boolean' },
  },
});
const [command = 'list', idArg] = positionals;

switch (command) {
  case 'list':
    list();
    break;
  case 'spots':
    spots();
    break;
  case 'approve':
    approve(toId(idArg, 'submission id'));
    break;
  case 'reject':
    reject(toId(idArg, 'submission id'));
    break;
  default:
    fail(`Unknown command "${command}". Use list, spots, approve <id> or reject <id>.`);
}

function list() {
  const rows = d1(
    `SELECT id, created_at, spot_name, area, city, dish, price_egp, lat, lng, maps_url, note
       FROM submissions WHERE status = 'pending' ORDER BY id`,
  );
  if (!rows.length) return console.log('No pending submissions.');
  for (const r of rows) {
    const where = r.lat != null ? `${r.lat}, ${r.lng}` : r.maps_url ?? 'no location: find it, then approve with --lat and --lng';
    console.log(`#${r.id}  ${r.created_at.slice(0, 10)}  ${r.spot_name} · ${r.area}${r.city ? ` · ${r.city}` : ''}`);
    console.log(`     ${r.dish}: ${r.price_egp} EGP`);
    console.log(`     ${where}`);
    if (r.note) console.log(`     note: ${r.note}`);
  }
  console.log(`\n${rows.length} pending. Approve: npm run review -- approve <id>   Reject: npm run review -- reject <id>`);
}

function spots() {
  // "from" = the cheapest current price (newest row per dish), like the site shows.
  const rows = d1(
    `SELECT s.id, s.name, s.area, s.status,
            (SELECT MIN(p.price_egp) FROM prices p
              WHERE p.spot_id = s.id
                AND p.id = (SELECT p2.id FROM prices p2 WHERE p2.spot_id = s.id AND p2.dish = p.dish
                             ORDER BY p2.checked_on DESC, p2.id DESC LIMIT 1)) AS cheapest,
            (SELECT MAX(p.checked_on) FROM prices p WHERE p.spot_id = s.id) AS checked
       FROM spots s ORDER BY s.id`,
  );
  if (!rows.length) return console.log('No spots yet.');
  for (const r of rows) {
    console.log(`#${r.id}  ${r.name} · ${r.area}  from ${r.cheapest ?? '?'} EGP  checked ${r.checked ?? 'never'}  [${r.status}]`);
  }
}

function approve(id) {
  const sub = d1(`SELECT * FROM submissions WHERE id = ${id} AND status = 'pending'`)[0];
  if (!sub) fail(`#${id} is not a pending submission.`);

  let spotId;
  if (opt.spot) {
    spotId = toId(opt.spot, '--spot');
    if (!d1(`SELECT id FROM spots WHERE id = ${spotId}`).length) fail(`Spot #${spotId} doesn't exist.`);
  } else {
    const lat = opt.lat != null ? toNumber(opt.lat, '--lat', EGYPT.minLat, EGYPT.maxLat) : sub.lat;
    const lng = opt.lng != null ? toNumber(opt.lng, '--lng', EGYPT.minLng, EGYPT.maxLng) : sub.lng;
    if (lat == null || lng == null) {
      fail(`#${id} has no location. Open ${sub.maps_url ?? 'Google Maps'}, then add --lat and --lng.`);
    }
    spotId = d1(
      `INSERT INTO spots (name, area, city, lat, lng, kind, maps_url)
       VALUES (${text(sub.spot_name)}, ${text(sub.area)}, ${text(sub.city ?? 'القاهرة')}, ${lat}, ${lng},
               ${opt.kind ? text(opt.kind) : 'NULL'}, ${sub.maps_url ? text(sub.maps_url) : 'NULL'})
       RETURNING id`,
    )[0].id;
  }

  const source = opt.team ? 'team' : 'submission';
  try {
    d1(
      `INSERT INTO prices (spot_id, dish, price_egp, checked_on, source)
         SELECT ${spotId}, dish, price_egp, substr(created_at, 1, 10), '${source}' FROM submissions WHERE id = ${id};
       UPDATE submissions SET status = 'approved', spot_id = ${spotId}, reviewed_at = ${NOW} WHERE id = ${id};`,
    );
  } catch (err) {
    fail(`Spot #${spotId} exists, but saving the price failed. Retry with: npm run review -- approve ${id} --spot ${spotId}`);
  }
  console.log(`✓ #${id} is on the map as spot #${spotId}.`);
}

function reject(id) {
  const done = d1(
    `UPDATE submissions SET status = 'rejected', reviewed_at = ${NOW}
      WHERE id = ${id} AND status = 'pending' RETURNING id`,
  );
  if (!done.length) fail(`#${id} is not a pending submission.`);
  console.log(`✓ #${id} rejected.`);
}

// Runs SQL through Wrangler (no shell, so quotes and Arabic text pass through safely).
function d1(sql) {
  const args = [wrangler, 'd1', 'execute', 'DB', opt.local ? '--local' : '--remote', '--json', '--command', sql];
  let out;
  try {
    out = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`wrangler failed:\n${err.stderr || err.stdout || err.message}`);
  }
  const start = out.indexOf('[');
  if (start === -1) throw new Error(`Unexpected wrangler output:\n${out}`);
  return JSON.parse(out.slice(start)).flatMap((result) => result.results ?? []);
}

// Escapes a value as an SQL string literal.
function text(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toNumber(value, name, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail(`${name} must be a number from ${min} to ${max}.`);
  return n;
}

function toId(value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) fail(`Give a ${name}, e.g. 12.`);
  return n;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
