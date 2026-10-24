// Spot page (/spot/<id>): wires up "السعر لسه كده؟". The rest of the page is plain HTML.
import { priceCheck } from '/checks.js';

for (const box of document.querySelectorAll('.check[data-spot]')) {
  let dishes = [];
  try { dishes = JSON.parse(box.dataset.dishes || '[]'); } catch {}
  priceCheck(box, {
    id: Number(box.dataset.spot),
    checked: box.dataset.checked,
    verified: Number(box.dataset.verified) || 1,
    dishes,
  });
}
