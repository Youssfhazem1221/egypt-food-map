// A page per spot: /spot/<id>. Rendered on request so a WhatsApp share shows the spot's
// name and price in the link preview. The "السعر لسه كده؟" buttons come from /checks.js.
import { KIND_LABEL } from '../public/kinds.js';
import { km, liveSpots } from './spots.js';

const egp = new Intl.NumberFormat('ar-EG');
const longDay = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Same as public/_headers (those only cover static files).
const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=60',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

// Keep in step with the rules block in public/index.html.
const RULES = `
  <section class="rules" aria-labelledby="rules-title">
    <h2 id="rules-title" class="rules-title">ضد الغلا</h2>
    <p>رخيص خريطة لأكل حقيقي بأسعار حقيقية، من الناس للناس.</p>
    <ul>
      <li>مفيش سلاسل كبيرة: عربيات ومحلات الحتة بس.</li>
      <li>مفيش ترتيب بفلوس: محدش يقدر يدفع عشان يطلع فوق.</li>
      <li>كل سعر عليه تاريخ آخر مرة اتأكدنا منه.</li>
      <li>أي حد يقدر يضيف مكان أو يصحح سعر، وإحنا بنراجع قبل ما ينزل.</li>
    </ul>
  </section>`;

export async function spotPage(request, env, id) {
  if (!/^\d{1,9}$/.test(id)) return notFound(request, env);
  const spots = await liveSpots(env);
  const spot = spots.find((s) => s.id === Number(id));
  if (!spot) return notFound(request, env);

  const nearby = spots
    .filter((s) => s.id !== spot.id)
    .map((s) => ({ ...s, km: km(spot, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 5);

  return new Response(render(spot, nearby, new URL(request.url).origin), { headers: HEADERS });
}

async function notFound(request, env) {
  const page = await env.ASSETS.fetch(new URL('/404.html', request.url));
  return new Response(page.body, { status: 404, headers: HEADERS });
}

function render(spot, nearby, origin) {
  const url = `${origin}/spot/${spot.id}`;
  const cheapest = spot.items[0].price_egp;
  const where = [spot.area, spot.city].filter(Boolean).join('، ');
  const kind = spot.kind && KIND_LABEL[spot.kind];
  const title = `${spot.name} · ${egp.format(cheapest)} ج`;
  const description = [
    spot.items.slice(0, 3).map((i) => `${i.dish} ${egp.format(i.price_egp)} ج`).join(' · '),
    `آخر تأكيد ${longDay.format(new Date(spot.checked))}`,
    where,
  ].join(' · ');
  const share = `https://wa.me/?text=${encodeURIComponent(`${spot.name} (${where}): ${spot.items[0].dish} بـ ${egp.format(cheapest)} جنيه\n${url}`)}`;
  const prices = spot.items.map((i) => i.price_egp);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: spot.name,
    url,
    servesCuisine: kind || undefined,
    priceRange: `${Math.min(...prices)}–${Math.max(...prices)} EGP`,
    address: { '@type': 'PostalAddress', addressLocality: spot.area, addressRegion: spot.city, addressCountry: 'EG' },
    geo: { '@type': 'GeoCoordinates', latitude: spot.lat, longitude: spot.lng },
  }).replace(/</g, '\\u003c');

  const items = spot.items
    .map((i) => `<li><span class="dish">${esc(i.dish)}</span><span class="dish-price">${egp.format(i.price_egp)}<span class="unit">ج</span></span></li>`)
    .join('');
  const near = nearby
    .map((s) => `<li><a href="/spot/${s.id}"><span class="near-name">${esc(s.name)}</span><span class="near-meta">${esc(s.area)} · ${distance(s.km)}</span><span class="dish-price">${egp.format(s.items[0].price_egp)}<span class="unit">ج</span></span></a></li>`)
    .join('');
  const dishes = esc(JSON.stringify(spot.items.map((i) => i.dish)));

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)} · رخيص</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta name="theme-color" content="#eef4ec">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="رخيص">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:locale" content="ar_EG">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/fonts/baloo-bhaijaan-2-arabic-643bd83b.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/katibeh-arabic-b22f602a.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${jsonLd}</script>
  <script type="module" src="/spot.js"></script>
</head>
<body class="spot-page">
  <header class="top">
    <div class="brand">
      <a class="mark-link" href="/"><span class="mark">رخيص</span></a>
      <p class="tagline">ارخص و احلى أكل ف مصر, من تحت 150 جنيه</p>
    </div>
    <a class="share" href="${esc(share)}" target="_blank" rel="noopener">ابعته لصاحبك</a>
  </header>

  <main class="page">
    <nav class="crumbs" aria-label="إنت فين"><a href="/">كل الأماكن</a> › <span>${esc(spot.area)}</span></nav>

    <article class="spot spot-big">
      <div class="spot-head">
        <h1 class="spot-name">${esc(spot.name)}</h1>
        <span class="price">${egp.format(cheapest)}<span class="unit">ج</span></span>
      </div>
      <p class="meta">${esc(where)}${kind ? ` · ${esc(kind)}` : ''}</p>
      <ul class="items">${items}</ul>
      <div class="check" data-spot="${spot.id}" data-checked="${esc(spot.checked)}" data-verified="${spot.verified}" data-dishes="${dishes}">
        <p class="checked">آخر تأكيد: ${longDay.format(new Date(spot.checked))}</p>
      </div>
      <div class="spot-actions">
        <a class="btn" href="https://www.google.com/maps/dir/?api=1&amp;destination=${spot.lat},${spot.lng}" target="_blank" rel="noopener">الطريق</a>
        <a class="btn" href="/#spot-${spot.id}">على الخريطة</a>
        <a class="btn" href="${esc(share)}" target="_blank" rel="noopener">ابعته لصاحبك</a>
      </div>
    </article>

    ${near ? `<section class="nearby" aria-labelledby="near-title"><h2 id="near-title">أماكن رخيصة قريبة</h2><ol>${near}</ol></section>` : ''}
    ${RULES}
  </main>

  <footer class="foot">
    <p>الأسعار بتتغير، فكل سعر مكتوب جنبه آخر مرة اتأكدنا منه.</p>
    <p>الخريطة: OpenFreeMap · OpenMapTiles · © OpenStreetMap</p>
  </footer>
</body>
</html>`;
}

function distance(kmAway) {
  if (kmAway < 1) return `${egp.format(Math.max(50, Math.round((kmAway * 1000) / 50) * 50))} متر`;
  return `${egp.format(Math.round(kmAway * 10) / 10)} كم`;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
