// Cheap-food map: loads spots from /api/spots, shows them on the map and in the
// list, and sends the "ابعتلنا مكانك" form to /api/submissions.
import { KINDS, KIND_LABEL } from '/kinds.js';
import { priceCheck } from '/checks.js';

const MAPLIBRE = '/vendor/maplibre-gl-6.12.0/maplibre-gl.mjs';
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const CAIRO = [31.2357, 30.0444]; // [lng, lat]

const egp = new Intl.NumberFormat('ar-EG');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = matchMedia('(min-width: 900px)');

const state = { spots: [], max: 0, kind: '', here: null, map: null, maplibregl: null, popup: null, hereMarker: null };
const markers = new Map(); // spot id → price-tag marker on the map
const $ = (selector) => document.querySelector(selector);

bindFilters();
bindKinds();
bindNear();
bindForm();
$('#share-site').href = whatsapp(`رخيص: أكل رخيص في مصر، بأسعار حقيقية بالجنيه\n${location.origin}`);
loadSpots();
startMap();
addEventListener('hashchange', openFromHash);

// ---------- data + list ----------

async function loadSpots() {
  try {
    const res = await fetch('/api/spots');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { spots } = await res.json();
    state.spots = spots.map((spot) => ({ ...spot, cheapest: spot.items[0].price_egp }));
    render();
    openFromHash();
  } catch (err) {
    console.error(err);
    setStatus('مش قادرين نحمّل الأماكن دلوقتي. جرّب تاني كمان شوية.');
  }
}

function bindFilters() {
  const chips = document.querySelectorAll('.filters .chip');
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      state.max = Number(chip.dataset.max);
      for (const other of chips) {
        other.classList.toggle('on', other === chip);
        other.setAttribute('aria-pressed', String(other === chip));
      }
      render();
    });
  }
}

// Food-type chips (كشري، فول وطعمية…) above the list, and the same list in the form.
function bindKinds() {
  const box = $('#kinds');
  const chips = [['', 'كل الأكل'], ...KINDS].map(([id, label]) => {
    const chip = el('button', id ? 'chip' : 'chip on', label);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(!id));
    chip.addEventListener('click', () => {
      state.kind = id;
      for (const other of chips) {
        other.classList.toggle('on', other === chip);
        other.setAttribute('aria-pressed', String(other === chip));
      }
      render();
    });
    return chip;
  });
  box.replaceChildren(...chips);
  const select = $('#kind-select');
  for (const [id, label] of KINDS) select.append(new Option(label, id));
}

function visibleSpots() {
  const list = state.spots.filter((spot) => (!state.max || spot.cheapest <= state.max) && (!state.kind || spot.kind === state.kind));
  if (!state.here) return list.sort((a, b) => a.cheapest - b.cheapest);
  return list.map((spot) => ({ ...spot, km: km(state.here, spot) })).sort((a, b) => a.km - b.km);
}

function render() {
  const list = visibleSpots();
  $('#spots').replaceChildren(...list.map(card));
  if (!state.spots.length) setStatus('لسه بنجمع الأماكن. عندك مكان رخيص وحلو؟ ابعته، وإحنا هنراجعه وننزله.');
  else if (!list.length) setStatus('مفيش أماكن في الحدود دي. جرّب سعر أعلى.');
  else setStatus(placesLabel(list.length));
  updateMap(list);
}

function card(spot) {
  const li = el('li', 'spot');
  li.id = `spot-${spot.id}`;
  li.tabIndex = -1;

  const head = el('div', 'spot-head');
  const name = el('h3', 'spot-name');
  const page = el('a', '', spot.name);
  page.href = `/spot/${spot.id}`;
  name.append(page);
  head.append(name, amount('price', spot.cheapest));

  const where = [spot.area, spot.city].filter(Boolean).join('، ');
  const metaParts = [where, KIND_LABEL[spot.kind], spot.km == null ? null : distance(spot.km)].filter(Boolean);
  const meta = el('p', 'meta', metaParts.join(' · '));

  const items = el('ul', 'items');
  for (const item of spot.items) {
    const row = el('li');
    row.append(el('span', 'dish', item.dish), amount('dish-price', item.price_egp));
    items.append(row);
  }

  const check = el('div', 'check');
  priceCheck(check, { id: spot.id, checked: spot.checked, verified: spot.verified, dishes: spot.items.map((i) => i.dish) });

  const actions = el('div', 'spot-actions');
  const show = el('button', 'btn', 'على الخريطة');
  show.type = 'button';
  show.addEventListener('click', () => focusSpot(spot, { scrollToMap: true }));
  const shareText = `${spot.name} (${where}): ${spot.items[0].dish} بـ ${price(spot.cheapest)}\n${location.origin}/spot/${spot.id}`;
  actions.append(
    show,
    link('btn', 'الطريق', `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`),
    link('btn', 'ابعته لصاحبك', whatsapp(shareText)),
  );

  li.append(head, meta, items, check, actions);
  return li;
}

function openFromHash() {
  const match = /^#spot-(\d+)$/.exec(location.hash);
  const spot = match && state.spots.find((s) => s.id === Number(match[1]));
  if (spot) focusSpot(spot, { scrollToCard: true, instant: true });
}

// ---------- map ----------

async function startMap() {
  try {
    loadCss(MAPLIBRE.replace('maplibre-gl.mjs', 'maplibre-gl.css'));
    const maplibregl = await import(MAPLIBRE);
    const map = new maplibregl.Map({
      container: 'map',
      style: MAP_STYLE,
      center: CAIRO,
      zoom: 11,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    state.maplibregl = maplibregl;
    map.on('load', () => {
      arabicLabels(map);
      state.map = map;
      updateMap(visibleSpots());
      openFromHash();
    });
  } catch (err) {
    console.error(err);
    $('#map').hidden = true;
    $('.map-off').hidden = false;
  }
}

// The style shows Latin and local names together; show Arabic names instead.
function arabicLabels(map) {
  const name = ['coalesce', ['get', 'name:ar'], ['get', 'name:nonlatin'], ['get', 'name']];
  for (const layer of map.getStyle().layers) {
    const field = layer.layout?.['text-field'];
    if (field && JSON.stringify(field).includes('name')) map.setLayoutProperty(layer.id, 'text-field', name);
  }
}

// Price tags on the map: one small button per visible spot, its tip on the spot.
function updateMap(list) {
  const { map, maplibregl } = state;
  if (!map) return;
  const visible = new Set(list.map((spot) => spot.id));
  for (const [id, marker] of markers) {
    if (!visible.has(id)) { marker.remove(); markers.delete(id); }
  }
  for (const spot of list) {
    if (markers.has(spot.id)) continue;
    const pin = el('button', 'pin', `${egp.format(spot.cheapest)}ج`);
    pin.type = 'button';
    pin.setAttribute('aria-label', `${spot.name}: ${price(spot.cheapest)}`);
    pin.addEventListener('click', (event) => {
      event.stopPropagation();
      const current = state.spots.find((s) => s.id === spot.id);
      if (current) focusSpot(current, { scrollToCard: wide.matches });
    });
    const marker = new maplibregl.Marker({ element: pin, anchor: 'bottom', offset: [0, -6] })
      .setLngLat([spot.lng, spot.lat])
      .addTo(map);
    markers.set(spot.id, marker);
  }
}

function focusSpot(spot, { scrollToMap = false, scrollToCard = false, instant = false } = {}) {
  const behavior = reduceMotion || instant ? 'auto' : 'smooth';
  const spotCard = document.getElementById(`spot-${spot.id}`);
  for (const active of document.querySelectorAll('.spot.active')) active.classList.remove('active');
  spotCard?.classList.add('active');
  for (const [id, marker] of markers) marker.getElement().classList.toggle('active', id === spot.id);
  if (scrollToCard) spotCard?.scrollIntoView({ behavior, block: 'nearest' });
  if (scrollToMap && !wide.matches) $('.map-pane').scrollIntoView({ behavior, block: 'start' });

  const { map, maplibregl } = state;
  if (!map) return;
  map[reduceMotion ? 'jumpTo' : 'flyTo']({ center: [spot.lng, spot.lat], zoom: Math.max(map.getZoom(), 15) });

  const box = el('div', 'popup');
  box.append(el('strong', '', spot.name), el('span', '', `${spot.items[0].dish}: ${price(spot.cheapest)}`));
  if (!wide.matches && spotCard) {
    const more = el('button', 'linkish', 'التفاصيل');
    more.type = 'button';
    more.addEventListener('click', () => spotCard.scrollIntoView({ behavior, block: 'center' }));
    box.append(more);
  }
  state.popup?.remove();
  state.popup = new maplibregl.Popup({ offset: 40, closeButton: false, maxWidth: '240px' })
    .setLngLat([spot.lng, spot.lat])
    .setDOMContent(box)
    .addTo(map);
}

// ---------- near me ----------

function bindNear() {
  $('#near').addEventListener('click', () => {
    setStatus('بنحدد مكانك…');
    locate((here) => {
      state.here = here;
      $('#near').setAttribute('aria-pressed', 'true');
      render();
      const { map, maplibregl } = state;
      if (!map) return;
      if (!state.hereMarker) {
        const dot = el('div', 'here-dot');
        dot.setAttribute('aria-label', 'مكانك');
        state.hereMarker = new maplibregl.Marker({ element: dot }).setLngLat([here.lng, here.lat]).addTo(map);
      } else {
        state.hereMarker.setLngLat([here.lng, here.lat]);
      }
      map[reduceMotion ? 'jumpTo' : 'flyTo']({ center: [here.lng, here.lat], zoom: 14 });
    }, setStatus);
  });
}

function locate(onFound, onError) {
  if (!navigator.geolocation) return onError('المتصفح ده مش بيعرف يحدد المكان.');
  navigator.geolocation.getCurrentPosition(
    (pos) => onFound({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => onError('محتاجين إذن الموقع عشان نحدد مكانك.'),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
}

// ---------- "ابعتلنا مكانك" form ----------

function bindForm() {
  const dialog = $('#add-dialog');
  const form = $('#add-form');
  const thanks = $('#thanks');
  const error = $('#form-error');
  const hereStatus = $('#here-status');
  const ask = 'راجع الخانات اللي عليها علامة حمرا.';

  const open = () => {
    form.hidden = false;
    thanks.hidden = true;
    error.textContent = '';
    if (!dialog.open) dialog.showModal();
  };
  $('#add').addEventListener('click', open);
  $('#again').addEventListener('click', open);
  $('#cancel').addEventListener('click', () => dialog.close());
  $('#done').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => event.target === dialog && dialog.close());

  $('#here').addEventListener('click', () => {
    hereStatus.textContent = 'بنحدد المكان…';
    locate(({ lat, lng }) => {
      form.elements.lat.value = lat.toFixed(6);
      form.elements.lng.value = lng.toFixed(6);
      hereStatus.textContent = '✓ اتحدد المكان';
    }, (message) => (hereStatus.textContent = message));
  });

  // People often paste "maps.app.goo.gl/…" without https://
  const mapsUrl = form.elements.maps_url;
  mapsUrl.addEventListener('change', () => {
    const value = mapsUrl.value.trim();
    if (value && !/^https?:\/\//i.test(value)) mapsUrl.value = `https://${value}`;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    for (const field of form.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');

    const invalid = [...form.elements].filter((field) => field.willValidate && !field.validity.valid);
    if (invalid.length) {
      markInvalid(form, invalid.map((field) => field.name));
      error.textContent = ask;
      invalid[0].focus();
      return;
    }

    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (res.status === 201) {
        form.reset();
        hereStatus.textContent = '';
        form.hidden = true;
        thanks.hidden = false;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 422) {
        markInvalid(form, data.fields ?? []);
        error.textContent = ask;
      } else if (res.status === 429) {
        error.textContent = 'فيه ضغط دلوقتي. جرّب تاني بعد ١٠ دقايق.';
      } else {
        error.textContent = 'حصلت مشكلة عندنا. جرّب تاني كمان شوية.';
      }
    } catch {
      error.textContent = 'النت فصل أو فيه مشكلة. جرّب تاني.';
    } finally {
      submit.disabled = false;
    }
  });
}

function markInvalid(form, names) {
  for (const name of names) {
    if (name === 'location') $('#here').setAttribute('aria-invalid', 'true');
    else form.elements[name]?.setAttribute?.('aria-invalid', 'true');
  }
}

// ---------- helpers ----------

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function link(className, text, href) {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

function loadCss(href) {
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = href;
  document.head.append(sheet);
}

function setStatus(text) {
  $('#status').textContent = text;
}

function price(n) {
  return `${egp.format(n)} جنيه`;
}

// "٢٥" with a small "ج" after it, for prices on cards.
function amount(className, n) {
  const span = el('span', className);
  span.append(egp.format(n), el('span', 'unit', 'ج'));
  return span;
}

function whatsapp(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// Arabic counts: مكان واحد، مكانين، ٣–١٠ أماكن، ١١+ مكان
function placesLabel(n) {
  if (n === 1) return 'مكان واحد';
  if (n === 2) return 'مكانين';
  if (n <= 10) return `${egp.format(n)} أماكن`;
  return `${egp.format(n)} مكان`;
}

function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function distance(kmAway) {
  if (kmAway < 1) return `${egp.format(Math.max(50, Math.round((kmAway * 1000) / 50) * 50))} متر`;
  return `${egp.format(Math.round(kmAway * 10) / 10)} كم`;
}
