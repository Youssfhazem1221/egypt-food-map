import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toLatinDigits, validateSubmission } from '../src/validate.js';

const good = { spot_name: 'عربية كشري', area: 'وسط البلد', dish: 'كشري صغير', price_egp: '25' };

test('accepts a normal submission', () => {
  const result = validateSubmission(good);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.price_egp, 25);
  assert.equal(result.value.city, null);
  assert.equal(result.value.lat, null);
});

test('reads Arabic digits and words around the price', () => {
  assert.equal(toLatinDigits('٢٥ و ۳۰'), '25 و 30');
  assert.equal(validateSubmission({ ...good, price_egp: '٣٥ جنيه' }).value.price_egp, 35);
  assert.equal(validateSubmission({ ...good, price_egp: '١٢٫٥' }).value.price_egp, 13);
  assert.equal(validateSubmission({ ...good, price_egp: 40 }).value.price_egp, 40);
});

test('rejects missing fields and prices that make no sense', () => {
  assert.deepEqual(validateSubmission({}).errors.sort(), ['area', 'dish', 'price_egp', 'spot_name']);
  for (const price_egp of ['0', '', 'كتير', '1.2.3', '5000']) {
    assert.ok(validateSubmission({ ...good, price_egp }).errors.includes('price_egp'), price_egp);
  }
  assert.equal(validateSubmission(null).ok, false);
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
  const result = validateSubmission({ ...good, spot_name: '  عربية‮ كشري\n\n', note: 'x'.repeat(301) });
  assert.equal(result.value.spot_name, 'عربية كشري');
  assert.ok(result.errors.includes('note'));
  assert.ok(validateSubmission({ ...good, spot_name: 'x' }).errors.includes('spot_name'));
});
