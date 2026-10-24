// "السعر لسه كده؟" under a spot: the visitor confirms the prices with one tap,
// or reports a new price for one dish (that one waits for review).
const egp = new Intl.NumberFormat('ar-EG');
const longDay = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const OTHER = '__other';

// مرة واحدة، مرتين، ٣–١٠ مرات، ١١+ مرة
export function timesLabel(n) {
  if (n === 1) return 'مرة واحدة';
  if (n === 2) return 'مرتين';
  if (n <= 10) return `${egp.format(n)} مرات`;
  return `${egp.format(n)} مرة`;
}

export function checkedLine(checked, verified) {
  return `آخر تأكيد: ${longDay.format(new Date(checked))} · اتأكد ${timesLabel(verified)}`;
}

// box: an empty element. spot: { id, checked, verified, dishes }
export function priceCheck(box, spot) {
  const line = el('p', 'checked', checkedLine(spot.checked, spot.verified));
  const ask = el('div', 'check-ask');
  const yes = button('btn', 'أيوه، لسه كده');
  const no = button('btn', 'لا، اتغير');
  ask.append(el('span', 'check-q', 'السعر لسه كده؟'), yes, no);
  const form = updateForm(spot.dishes);
  const done = el('p', 'check-done');
  done.setAttribute('role', 'status');
  box.replaceChildren(line, ask, form, done);

  const key = `rkhees-checked-${spot.id}`;
  if (checkedToday(key)) {
    ask.hidden = true;
    done.textContent = 'اتأكدت من الأسعار دي النهارده. شكراً!';
  }

  yes.addEventListener('click', async () => {
    yes.disabled = no.disabled = true;
    const result = await send({ spot_id: spot.id, kind: 'confirm' });
    if (result.ok) {
      remember(key);
      spot.verified += 1;
      spot.checked = today();
      line.textContent = checkedLine(spot.checked, spot.verified);
      ask.hidden = true;
      done.textContent = 'شكراً! اتسجل إن السعر لسه كده.';
    } else {
      done.textContent = result.message;
      yes.disabled = no.disabled = false;
    }
  });

  no.addEventListener('click', () => {
    ask.hidden = true;
    done.textContent = '';
    form.hidden = false;
    form.elements.price_egp.focus();
  });

  form.querySelector('.cancel').addEventListener('click', () => {
    form.hidden = true;
    ask.hidden = false;
  });

  form.elements.dish.addEventListener('change', () => {
    form.querySelector('.other').hidden = form.elements.dish.value !== OTHER;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = form.querySelector('.form-error');
    error.textContent = '';
    const dish = form.elements.dish.value === OTHER ? form.elements.dish_other.value.trim() : form.elements.dish.value;
    const price = form.elements.price_egp.value.trim();
    if (dish.length < 2 || !price) {
      error.textContent = 'اكتب الأكلة والسعر الجديد.';
      return;
    }
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    const result = await send({ spot_id: spot.id, kind: 'update', dish, price_egp: price, website: form.elements.website.value });
    submit.disabled = false;
    if (result.ok) {
      remember(key);
      form.hidden = true;
      done.textContent = 'وصل! هنراجع السعر الجديد وننزله.';
    } else {
      error.textContent = result.message;
    }
  });
}

function updateForm(dishes) {
  const form = el('form', 'check-form');
  form.noValidate = true;
  form.hidden = true;

  const dishLabel = el('label', '', 'الأكلة');
  const select = document.createElement('select');
  select.name = 'dish';
  for (const dish of dishes) select.append(new Option(dish, dish));
  select.append(new Option('أكلة تانية', OTHER));
  dishLabel.append(select);

  const otherLabel = el('label', 'other', 'اسمها');
  otherLabel.hidden = dishes.length > 0;
  if (!dishes.length) select.value = OTHER;
  otherLabel.append(input('dish_other', { maxLength: 60, placeholder: 'مثلاً: كشري كبير' }));

  const priceLabel = el('label', '', 'السعر الجديد بالجنيه');
  priceLabel.append(input('price_egp', { inputMode: 'numeric', maxLength: 8, placeholder: 'مثلاً: ٣٥' }));

  // Honeypot: hidden from people, bots fill it in.
  const trap = el('label', 'hp', 'سيبه فاضي');
  trap.setAttribute('aria-hidden', 'true');
  trap.append(input('website', { tabIndex: -1 }));

  const actions = el('div', 'actions');
  const submit = button('primary small', 'ابعت');
  submit.type = 'submit';
  actions.append(submit, button('btn cancel', 'إلغاء'));

  const error = el('p', 'form-error');
  error.setAttribute('role', 'alert');
  form.append(dishLabel, otherLabel, priceLabel, trap, actions, error);
  return form;
}

async function send(body) {
  try {
    const res = await fetch('/api/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 201) return { ok: true };
    if (res.status === 422) return { ok: false, message: 'راجع الأكلة والسعر.' };
    if (res.status === 429) return { ok: false, message: 'فيه ضغط دلوقتي. جرّب تاني بعد شوية.' };
    return { ok: false, message: 'حصلت مشكلة عندنا. جرّب تاني كمان شوية.' };
  } catch {
    return { ok: false, message: 'النت فصل أو فيه مشكلة. جرّب تاني.' };
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function checkedToday(key) {
  try { return localStorage.getItem(key) === today(); } catch { return false; }
}
function remember(key) {
  try { localStorage.setItem(key, today()); } catch {}
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function button(className, text) {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}
function input(name, props = {}) {
  const field = document.createElement('input');
  field.name = name;
  field.autocomplete = 'off';
  Object.assign(field, props);
  return field;
}
