// Checks what people send through the "ابعتلنا مكانك" form.
// Pure functions, so they run in the Worker and in `npm test`.

// Egypt's bounding box, with a small margin. The database checks the same range.
export const EGYPT = { minLat: 21.5, maxLat: 32, minLng: 24.5, maxLng: 37 };

export const MAX_PRICE_EGP = 1000;

// [min, max] length after cleaning. min 0 = optional.
const TEXT_FIELDS = {
  spot_name: [2, 80],
  area: [2, 60],
  city: [0, 40],
  dish: [2, 60],
  maps_url: [0, 300],
  note: [0, 300],
};

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits to 0-9, so "٢٥" counts as 25.
export function toLatinDigits(value) {
  return String(value).replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

// Drops control characters and bidi overrides (they can disguise text), and squashes spaces.
function clean(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function number(value) {
  if (value == null || value === '') return null;
  const n = Number(toLatinDigits(clean(value)));
  return Number.isFinite(n) ? n : NaN;
}

export function validateSubmission(input) {
  if (!input || typeof input !== 'object') return { ok: false, errors: ['body'], value: null };

  const errors = [];
  const value = {};

  for (const [field, [min, max]] of Object.entries(TEXT_FIELDS)) {
    const text = clean(input[field]);
    if (text.length < min || text.length > max) errors.push(field);
    value[field] = text || null;
  }

  // "25", "٢٥", "25 جنيه", "12.5" and "١٢٫٥" all work; stored as whole pounds.
  const priceText = toLatinDigits(clean(input.price_egp)).replace(/٫/g, '.').replace(/[^\d.]/g, '');
  const price = Math.round(Number(priceText));
  if (!Number.isInteger(price) || price < 1 || price > MAX_PRICE_EGP) errors.push('price_egp');
  value.price_egp = price;

  // Location is optional, but it comes as a pair and must be inside Egypt.
  const lat = number(input.lat);
  const lng = number(input.lng);
  if (lat == null && lng == null) {
    value.lat = null;
    value.lng = null;
  } else if (
    lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng) ||
    lat < EGYPT.minLat || lat > EGYPT.maxLat || lng < EGYPT.minLng || lng > EGYPT.maxLng
  ) {
    errors.push('location');
  } else {
    value.lat = Math.round(lat * 1e6) / 1e6;
    value.lng = Math.round(lng * 1e6) / 1e6;
  }

  // Only plain web links, so a javascript: link can't sneak into the review list.
  if (value.maps_url) {
    let url = null;
    try {
      url = new URL(value.maps_url);
    } catch {}
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) errors.push('maps_url');
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)], value };
}
