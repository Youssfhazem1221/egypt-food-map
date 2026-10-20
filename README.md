# Egypt food map · أكل رخيص في مصر

Cheap food in Egypt with **real prices in EGP**. Every price shows the day someone checked it. Arabic first, built for phones.

| Part | What |
|---|---|
| Hosting | Cloudflare Worker + static files, free plan |
| Database | Cloudflare D1 `egypt-food-map` (spots, prices, submissions) |
| Map | [MapLibre GL JS](https://maplibre.org/) 6.12, served from `public/vendor/` · tiles from [OpenFreeMap](https://openfreemap.org/) (free, no key) |
| Deploys | Every push to `main` → Cloudflare builds and goes live |
| Live URL | Shown in the Cloudflare dashboard after the first build (`egypt-food-map.<subdomain>.workers.dev`) |

## How a spot gets on the map

```
visitor fills "ابعتلنا مكانك" → submissions (pending) → you review → spots + prices → map
```

- Nothing a visitor sends goes live without review.
- Old prices stay in `prices`, so price changes can be tracked over time.

## Files

| Path | What |
|---|---|
| `public/` | The site: `index.html`, `app.js`, `styles.css`, `_headers` (security headers) |
| `src/worker.js` | The API: `GET /api/spots`, `POST /api/submissions`, `GET /api/health` |
| `src/validate.js` | Checks form input (reads Arabic digits like ٢٥) |
| `migrations/` | Database tables |
| `scripts/review.mjs` | Approve or reject submissions from your PC |
| `seeds/dev-only.sql` | **Fake** sample spots, local database only |

## Run it on your PC

```bash
npm install
npm run db:local         # create the local database
npm run db:seed-local    # optional: fake sample spots (local only)
npm run dev              # http://localhost:8787
npm test
```

## Review what people send

| Do | Command |
|---|---|
| See pending | `npm run review` |
| Approve | `npm run review -- approve 12` |
| Approve, no location sent | `npm run review -- approve 12 --lat 30.0444 --lng 31.2357` |
| Add the price to an existing spot | `npm run review -- approve 12 --spot 3` |
| You checked the price yourself | add `--team` |
| Reject | `npm run review -- reject 12` |
| See all spots | `npm run review -- spots` |

Add `--local` to any of these to use the local database.

## Change the database

1. Add `migrations/000N_what.sql`.
2. `npm run db:local`, then test.
3. `npm run db:remote` **before** pushing code that needs the change.

## One-time Cloudflare setup

Dashboard → **Workers & Pages** → **Create application** → import the GitHub repo `egypt-food-map`.

| Setting | Value |
|---|---|
| Project name | `egypt-food-map` (must match `name` in `wrangler.jsonc`, or builds fail) |
| Build command | `npm test` (a failing test stops the deploy) |
| Deploy command | `npx wrangler deploy` (the default) |
| Root directory | `/` |

If the first build fails with a permission error about D1: open **My Profile → API Tokens**, edit the token the build uses, and add **D1: Edit**.

## Data rules

- Real prices only, each with the day it was checked.
- Don't scrape Talabat or elmenus (their terms forbid it).
- The form asks for no personal data, and the site stores no IP addresses.

## Update MapLibre

```bash
npm install --save-dev --save-exact maplibre-gl@<version>
npm run vendor
```

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · [OpenMapTiles](https://openmaptiles.org/) · [OpenFreeMap](https://openfreemap.org/). MapLibre GL JS is BSD-3-Clause; its license is in `public/vendor/`.
