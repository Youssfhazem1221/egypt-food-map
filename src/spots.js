// Live spots as the site shows them: the newest price of each dish (cheapest first),
// how many times the prices were checked, and the day of the last check.
export async function liveSpots(env) {
  const [spots, prices, checks] = await env.DB.batch([
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
    env.DB.prepare(
      `SELECT spot_id, COUNT(*) AS n, MAX(substr(created_at, 1, 10)) AS last
         FROM price_checks
        WHERE status = 'applied'
        GROUP BY spot_id`,
    ),
  ]);

  // Rows arrive newest first, so the first row per dish is its current price.
  const itemsBySpot = new Map();
  for (const { spot_id, dish, price_egp, checked_on } of prices.results) {
    const items = itemsBySpot.get(spot_id) ?? [];
    if (!items.some((item) => item.dish === dish)) items.push({ dish, price_egp, checked_on });
    itemsBySpot.set(spot_id, items);
  }
  const checksBySpot = new Map(checks.results.map((c) => [c.spot_id, c]));

  const out = [];
  for (const spot of spots.results) {
    const items = itemsBySpot.get(spot.id);
    if (!items) continue; // a spot without a price isn't useful yet
    items.sort((a, b) => a.price_egp - b.price_egp);
    const check = checksBySpot.get(spot.id);
    let checked = items.reduce((latest, item) => (item.checked_on > latest ? item.checked_on : latest), '');
    if (check?.last && check.last > checked) checked = check.last;
    out.push({ ...spot, items, checked, verified: 1 + (check?.n ?? 0) });
  }
  out.sort((a, b) => a.items[0].price_egp - b.items[0].price_egp);
  return out;
}

// Straight-line distance in km.
export function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
