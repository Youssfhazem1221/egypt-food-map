// Checks what people send: the "ابعتلنا مكانك" form and "السعر لسه كده؟".
// Pure functions, so they run in the Worker and in `npm test`.
import { isKind } from '../public/kinds.js';

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

// Drops control characters and bidi controls (they can disguise text), and squashes spaces.
function clean(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[\p{Cc}\p{Bidi_Control}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function number(value) {
  if (value == null || value === '') return null;
  const n = Number(toLatinDigits(clean(value)));
  return Number.isFinite(n) ? n : NaN;
}

// "25", "٢٥", "25 جنيه", "12.5" and "١٢٫٥" all work; stored as whole pounds. NaN if it isn't a price.
export function parsePrice(value) {
  const text = toLatinDigits(clean(value)).replace(/٫/g, '.').replace(/[^\d.]/g, '');
  return text ? Math.round(Number(text)) : NaN;
}

function priceOk(price) {
  return Number.isInteger(price) && price >= 1 && price <= MAX_PRICE_EGP;
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

  const price = parsePrice(input.price_egp);
  if (!priceOk(price)) errors.push('price_egp');
  value.price_egp = price;

  // Food type is optional, but only from the fixed list.
  const kind = clean(input.kind);
  if (kind && !isKind(kind)) errors.push('kind');
  value.kind = kind || null;

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

// "السعر لسه كده؟": kind "confirm" (prices still right) or "update" (a dish has a new price).
export function validateCheck(input) {
  if (!input || typeof input !== 'object') return { ok: false, errors: ['body'], value: null };

  const errors = [];
  const spotId = Number(input.spot_id);
  if (!Number.isSafeInteger(spotId) || spotId < 1) errors.push('spot_id');
  const kind = input.kind === 'confirm' || input.kind === 'update' ? input.kind : null;
  if (!kind) errors.push('kind');

  const value = { spot_id: spotId, kind, dish: null, price_egp: null };
  if (kind === 'update') {
    const dish = clean(input.dish);
    if (dish.length < 2 || dish.length > 60) errors.push('dish');
    value.dish = dish;
    const price = parsePrice(input.price_egp);
    if (!priceOk(price)) errors.push('price_egp');
    value.price_egp = price;
  }

  return { ok: errors.length === 0, errors, value };
}
