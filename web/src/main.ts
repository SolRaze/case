import { PHONES, STYLES, why, phoneWhy } from './data';
import { createView } from './view';
import plaza from '../themes/plaza.json';

type Theme = typeof plaza;
const theme: Theme = plaza;
const S = theme.strings;

const root = document.documentElement.style;
for (const [k, v] of Object.entries(theme.colors)) root.setProperty(`--${k}`, v);
root.setProperty('--font', theme.font);
root.setProperty('--radius', theme.radius);
root.setProperty('--spring', theme.spring);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tabs = $('tabs'), title = $('title'), about = $('about'), grid = $('grid'), loading = $('loading');
// no WebGL: the stage shows the prebuilt preview png instead of the model
let view: ReturnType<typeof createView> | null = null;
try {
  view = createView($('view'), theme.camera, theme.colors.model);
} catch {
  $('view').replaceWith(Object.assign(document.createElement('img'), { id: 'view', alt: '' }));
}

/** phone -> styles with a prebuilt glb, written by glb.mjs */
const built: Record<string, string[]> = await fetch('glb/index.json').then((r) => (r.ok ? r.json() : {}));
const has = (p: string, s: string) => built[p]?.includes(s) ?? false;

let phone = '17';
let style = 'base';
let tab: 'phone' | 'style' = 'phone';
/** #<phone>/<style> picks both, as written by render() */
function fromHash() {
  const [hp, hs] = location.hash.slice(1).split('/');
  if (!PHONES.some((p) => p.id === hp)) return false;
  phone = hp;
  style = hs in STYLES ? hs : 'base';
  tab = 'style';
  return true;
}
fromHash();
addEventListener('hashchange', () => fromHash() && (render(), load()));

function tile(label: string, locked: boolean, reason: string | null, onPick: () => void) {
  const b = document.createElement('button');
  b.className = 'tile';
  b.classList.toggle('locked', locked);
  b.classList.toggle('invalid', !!reason);
  b.setAttribute('aria-pressed', String(locked));
  b.innerHTML = `<span class="label">${label}</span>`;
  b.onclick = () => {
    if (reason) {
      about.textContent = reason;
      about.classList.add('warn');
      return;
    }
    onPick();
  };
  return b;
}

function silhouette(w: number, l: number, corner: number) {
  // drawn to scale against the largest phone so sizes compare across the roster
  const max = Math.max(...PHONES.map((p) => p.l));
  const r = corner ? corner * 0.55 : w * 0.14;
  const svg = `<svg viewBox="0 0 ${max * 0.55} ${max}" aria-hidden="true"><rect x="${(max * 0.55 - w) / 2}" y="${max - l}" width="${w}" height="${l}" rx="${r}"/></svg>`;
  return svg;
}

function render() {
  if (tab === 'style' || location.hash) history.replaceState(null, '', `#${phone}/${style}`);
  tabs.innerHTML = '';
  for (const t of ['phone', 'style'] as const) {
    const b = document.createElement('button');
    b.textContent = t === 'phone' ? `${S.tabPhone} · ${phone}` : `${S.tabStyle} · ${style}`;
    b.className = t === tab ? 'on' : '';
    b.onclick = () => ((tab = t), render());
    tabs.append(b);
  }
  about.classList.remove('warn');
  grid.innerHTML = '';
  grid.className = tab;
  if (tab === 'phone') {
    title.textContent = S.phone;
    about.textContent = '';
    for (const p of PHONES) {
      const b = tile(p.id, p.id === phone, phoneWhy(p.id), () => {
        phone = p.id;
        if (!has(phone, style)) style = has(phone, 'base') ? 'base' : built[phone]?.[0] ?? style;
        tab = 'style';
        render();
        load();
      });
      b.insertAdjacentHTML('afterbegin', silhouette(p.w, p.l, p.corner));
      grid.append(b);
    }
  } else {
    title.textContent = S.style;
    about.textContent = STYLES[style].about;
    for (const s of Object.keys(STYLES)) {
      const reason = why(phone, s) ?? (has(phone, s) ? null : S.missing);
      const b = tile(s, s === style, reason, () => {
        style = s;
        render();
        load();
      });
      if (has(phone, s)) b.insertAdjacentHTML('afterbegin', `<img src="glb/${phone}/${s}.png" alt="" loading="lazy">`);
      grid.append(b);
    }
  }
}

async function load() {
  if (!has(phone, style)) return;
  if (!view) return void ($<HTMLImageElement>('view').src = `glb/${phone}/${style}.png`);
  loading.textContent = S.loading;
  loading.hidden = false;
  try {
    await view.show(`glb/${phone}/${style}.glb`);
  } finally {
    loading.hidden = true;
  }
}

render();
load();
