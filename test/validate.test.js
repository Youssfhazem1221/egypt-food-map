import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isKind } from '../public/kinds.js';
import { parsePrice, toLatinDigits, validateCheck, validateSubmission } from '../src/validate.js';

const good = { spot_name: 'عربية كشري', area: 'وسط البلد', dish: 'كشري صغير', price_egp: '25' };
const RLO = String.fromCharCode(0x202e); // right-to-left override, can disguise text

test('accepts a normal submission', () => {
  const result = validateSubmission(good);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.price_egp, 25);
  assert.equal(result.value.city, null);
  assert.equal(result.value.kind, null);
  assert.equal(result.value.lat, null);
});

test('reads Arabic digits and words around the price', () => {
  assert.equal(toLatinDigits('٢٥ و ۳۰'), '25 و 30');
  assert.equal(parsePrice('٣٥ جنيه'), 35);
  assert.equal(parsePrice('١٢٫٥'), 13);
  assert.equal(parsePrice(40), 40);
  assert.ok(Number.isNaN(parsePrice('')));
});

test('rejects missing fields and prices that make no sense', () => {
  assert.deepEqual(validateSubmission({}).errors.sort(), ['area', 'dish', 'price_egp', 'spot_name']);
  for (const price_egp of ['0', '', 'كتير', '1.2.3', '5000']) {
    assert.ok(validateSubmission({ ...good, price_egp }).errors.includes('price_egp'), price_egp);
  }
  assert.equal(validateSubmission(null).ok, false);
});

test('food type is optional and must be on the list', () => {
  assert.equal(validateSubmission({ ...good, kind: 'koshary' }).value.kind, 'koshary');
  assert.ok(validateSubmission({ ...good, kind: 'pizza' }).errors.includes('kind'));
  assert.ok(validateSubmission({ ...good, kind: 'constructor' }).errors.includes('kind'));
  assert.equal(isKind('toString'), false);
});

test('location comes as a pair and must be inside Egypt', () => {
  const cairo = validateSubmission({ ...good, lat: '30.04441234', lng: 31.2357 });
  assert.equal(cairo.ok, true);
  assert.equal(cairo.value.lat, 30.044412);
  assert.ok(validateSubmission({ ...good, lat: '30.04' }).errors.includes('location'));
  assert.ok(validateSubmission({ ...good, lat: '48.85', lng: '2.35' }).errors.includes('location')); // Paris
  assert.ok(validateSubmission({ ...good, lat: 'x', lng: 'y' }).errors.includes('location'));
});

test('only plain web links', () => {
  assert.equal(validateSubmission({ ...good, maps_url: 'https://maps.app.goo.gl/abc' }).ok, true);
  assert.ok(validateSubmission({ ...good, maps_url: 'javascript:alert(1)' }).errors.includes('maps_url'));
  assert.ok(validateSubmission({ ...good, maps_url: 'not a link' }).errors.includes('maps_url'));
});

test('cleans control characters and bidi overrides, enforces lengths', () => {
  const result = validateSubmission({ ...good, spot_name: `  عربية${RLO} كشري\n\n`, note: 'x'.repeat(301) });
  assert.equal(result.value.spot_name, 'عربية كشري');
  assert.ok(result.errors.includes('note'));
  assert.ok(validateSubmission({ ...good, spot_name: 'x' }).errors.includes('spot_name'));
});

test('price checks: confirm needs only the spot, update needs a dish and a price', () => {
  assert.deepEqual(validateCheck({ spot_id: 3, kind: 'confirm' }), { ok: true, errors: [], value: { spot_id: 3, kind: 'confirm', dish: null, price_egp: null } });
  const update = validateCheck({ spot_id: '3', kind: 'update', dish: 'كشري كبير', price_egp: '٤٥' });
  assert.equal(update.ok, true);
  assert.equal(update.value.price_egp, 45);
  assert.deepEqual(validateCheck({ spot_id: 3, kind: 'update' }).errors.sort(), ['dish', 'price_egp']);
  assert.deepEqual(validateCheck({ spot_id: 'x', kind: 'delete' }).errors.sort(), ['kind', 'spot_id']);
  assert.equal(validateCheck(null).ok, false);
});
