import * as THREE from 'three';
import '@fontsource/arimo/latin-700.css';
import theme from '../themes/memcard.json';
import specs from '../phones.json';
import { buildLocked, buildPhone, framed, label, type PhoneSpec } from './phone';
import { buildLogo } from './logo';
import { READY, order, styleName, year } from './catalog';
import { built, exportStl, load, loadTemplates, saveTemplates } from './cases';
import { inkLayer } from './ink';
import * as sfx from './sound';

const S = theme.strings;
const C = theme.colors;
const css = document.documentElement.style;
css.setProperty('--font', theme.font);
for (const [k, v] of Object.entries(C)) if (typeof v === 'string') css.setProperty(`--${k}`, v);
C.field.forEach((v, i) => css.setProperty(`--field${i}`, v));
C.detail.forEach((v, i) => css.setProperty(`--detail${i}`, v));

const $ = (id: string) => document.getElementById(id)!;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const clock = () => performance.now() / 1000;
const phones = order(specs as unknown as PhoneSpec[]);
const spec = (id: string) => phones.find((p) => p.id === id)!;
const card = spec(theme.card);

// scene: 1 unit = 100 mm
const MM = 0.01;
const COLS = 3;
const CELL = { w: 1.2, h: 1.6 }; // under TILT a row's lower third tucks behind the next row, so three rows clear the footer
const FOV = 40;
const T = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const TILT = 0.3; // the grid's plane leans back by this: lower rows sit nearer the camera and read bigger
const REST = { x: 0.2, y: 0 }; // grid pose: upright and square, top leaning toward the camera
const D = 4.2; // distance from the camera of the front page's icons and the open phone
const FLIP = THREE.MathUtils.degToRad(95);
const LOGO_H = 100; // mm

// two renderers over one scene: layer 0 at the console's line count, layer 1 (the open case) at full resolution
const low = new THREE.WebGLRenderer({ canvas: $('view') as HTMLCanvasElement, alpha: true });
const hi = new THREE.WebGLRenderer({ canvas: $('hi') as HTMLCanvasElement, alpha: true, antialias: true });
const ink = inkLayer($('ink') as HTMLCanvasElement, $('ui'), C.pick);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
// key and rim ride with the camera, aimed at the icons' distance; neither may sit near the view axis,
// or a straight-on black back mirrors it and reads grey
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-3, 4, -1);
const rim = new THREE.DirectionalLight(0xffffff, 1.2);
rim.position.set(3, -1, -7);
const sky = new THREE.HemisphereLight(0xffffff, 0x404040, 1.6);
for (const l of [key, rim, sky]) l.layers.enableAll();
for (const l of [key, rim]) {
  l.target.position.set(0, 0, -D);
  camera.add(l.target);
}
camera.add(key, rim);
scene.add(camera, sky);

/** a hot white core whose light bleeds past the icon's edges: the selection glows */
function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, C.glow);
  r.addColorStop(0.08, C.glow);
  r.addColorStop(0.18, C.glow + 'aa');
  r.addColorStop(0.36, C.glow + '33');
  r.addColorStop(0.65, C.glow + '0c');
  r.addColorStop(1, C.glow + '00');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  s.renderOrder = 1;
  return s;
}
const glow = glowSprite();
const dot = glowSprite();
scene.add(glow, dot);

type Item = {
  holder: THREE.Group;
  materials: THREE.Material[];
  h: number; // height at scale 1
  pos: THREE.Vector3;
  scale: number;
  opacity: number;
  spin: number;
  tilt: number;
  born: number; // when it pops in on a page
  ready: boolean;
};
function item(object: THREE.Object3D, materials: THREE.Material[], h: number): Item {
  const holder = new THREE.Group();
  object.scale.setScalar(MM);
  holder.add(object);
  holder.visible = false;
  scene.add(holder);
  return { holder, materials, h: h * MM, pos: new THREE.Vector3(), scale: 1, opacity: 0, spin: REST.y, tilt: REST.x, born: 0, ready: true };
}

// the models page: one finish for every phone, an outline with a padlock where no case is finished yet
const bodies = phones.map((p) => (READY.has(p.id) ? buildPhone(p, theme.finish, 8) : buildLocked(p, 8)));
const models = bodies.map((b, i) => item(b.object, b.materials, phones[i].L));
const fit = models[phones.indexOf(card)];

// the open phone's case: full resolution and see-through, over a depth-only copy of the phone so the phone hides what is behind it
const caseMat = new THREE.MeshStandardMaterial({
  color: theme.case.color, roughness: 0.3, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
});
const caseMesh = new THREE.Mesh(new THREE.BufferGeometry(), caseMat);
const centre = new THREE.Vector3(card.W / 2, -card.L / 2, -card.T / 2);
{
  const g = bodies[phones.indexOf(card)].frame;
  // pushed back a hair: the case's inner skin lies on the phone and would otherwise z-fight it
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
  for (const m of [...g.children] as THREE.Mesh[]) {
    const d = new THREE.Mesh(m.geometry, depthOnly);
    d.layers.set(1);
    g.add(d);
  }
  caseMesh.layers.set(1);
  g.add(caseMesh);
}

// the front page: a phone opens its cases page, the apple opens the models
const front = theme.front.map((f) => {
  const { object, materials } =
    f.icon === 'logo' ? buildLogo(LOGO_H, card.T, theme.finish, f.seg) : buildPhone(spec(f.icon), theme.finish, f.seg);
  return item(object, materials, f.icon === 'logo' ? LOGO_H : spec(f.icon).L);
});

// one ring item per built style, once the built cases are known; the cases page shows the edited ones
let caseItems: Item[] = [];
let styles: string[] = [];
let store = loadTemplates([]);
const geos = new Map<string, Promise<THREE.BufferGeometry>>();
const geo = (style: string) => {
  if (!geos.has(style)) geos.set(style, load(card.id, style));
  return geos.get(style)!;
};
/** puts the current template's case on the open phone */
function wear() {
  const t = store.list[store.cur];
  if (!t) return;
  geo(t.style).then((g) => {
    if (store.list[store.cur] === t) caseMesh.geometry = g;
  });
}
built(card.id).then((list) => {
  styles = list;
  store = loadTemplates(list);
  caseItems = list.map((style) => {
    const m = new THREE.MeshStandardMaterial({ color: theme.case.grid, roughness: 0.6, transparent: true });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    const it = item(framed(card, mesh), [m], card.L);
    it.ready = false;
    geo(style).then((g) => {
      mesh.geometry = g;
      it.ready = true;
    });
    return it;
  });
  wear();
  paint();
});

type View = 'boot' | 'models' | 'cases' | 'detail' | 'edit' | 'info';
let view: View = 'boot';
let from: 'boot' | 'models' = 'boot'; // where ○ on the cases page goes
let msel = 0; // models grid
let fsel = 0; // front page, an index into fronts()
let entered = 0; // the theme.front icon the open page came from
let ring = 0; // cases page: the picked design, counted across ring pages
let turn = 0; // the ring's eased rotation, in slots
// the command list: 0 shut, 1 Edit Print Delete, 2 Export Order, 3 are you sure, 4 printing
let menu = 0;
let cmd = 0;
let yes = false;
let undo = -1; // edit: the worn template ○ puts back
let back: 'cases' | 'detail' = 'cases'; // where edit returns
let printAt = -1;
let flip: { i: number; t0: number; dir: 1 | -1 } | null = null;
let busy = false;
let camV = 0; // camera along the grid plane, in flat grid units
let fling = 0; // extra spin from a swipe, decays to the theme's spin
let dist = 4;
let loading = false;

const RING = 8; // designs on one ring page
const edited = () => styles.filter((s) => store.list.some((t) => t.style === s && t.edited));
const shown = () => edited().map((s) => caseItems[styles.indexOf(s)]);
/** the picked design's template, -1 with none */
const tpl = () => store.list.findIndex((t) => t.style === edited()[ring]);
/** the front page's icons, as theme.front indices: the phones with a design, then the apple */
const fronts = () => theme.front.flatMap((f, i) => (f.icon === 'logo' || (f.icon === card.id && edited().length) ? [i] : []));
const opens = (i: number) => (theme.front[i].icon === 'logo' ? 'models' : 'cases');
const portrait = () => camera.aspect < 1;

const rowOf = (i: number) => Math.floor(i / COLS);
const flat = (i: number) => ({ x: ((i % COLS) - (COLS - 1) / 2) * CELL.w, v: -rowOf(i) * CELL.h });
const onPlane = (x: number, v: number) => new THREE.Vector3(x, v * Math.cos(TILT), -v * Math.sin(TILT));
const slot = (i: number) => onPlane(flat(i).x, flat(i).v);
const camAt = (v = camV) => onPlane(0, v).add(new THREE.Vector3(0, 0, dist));
/** a point d in front of the camera's resting place, fx and fy in fractions of the view's width and height there */
const ahead = (fx: number, fy: number, d: number) =>
  camAt().add(new THREE.Vector3(fx * 2 * d * T * camera.aspect, fy * 2 * d * T, -d));
/** the scale that makes something h tall fill frac of the view's height at distance d */
const fill = (frac: number, d: number, h: number) => (frac * 2 * d * T) / h;

/** where grid item i lands on screen, as a fraction of the view's height from its centre */
function screenY(i: number, v: number) {
  const p = slot(i).sub(camAt(v));
  return p.y / (-p.z * 2 * T);
}
/** the camera position that puts item i at screen height y; screenY falls as v rises */
function solve(i: number, y: number) {
  let lo = flat(i).v - 3 * CELL.h;
  let hi = flat(i).v + 3 * CELL.h;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (screenY(i, mid) > y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
// rows stay between the header and the button bar
const TOP = 0.5 - 0.24;
const BOTTOM = -0.5 + 0.3;
const camLimits = () => {
  const max = solve(0, TOP);
  return { min: Math.min(max, solve(models.length - 1, BOTTOM)), max };
};
/** scroll just enough to keep the selected row inside the band */
function follow() {
  const i = msel;
  camV = clamp(camV, solve(i, TOP), solve(i, BOTTOM));
  const { min, max } = camLimits();
  camV = clamp(camV, min, max);
}

function layout() {
  const w = innerWidth;
  const h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const pr = clamp(theme.lines / h, 0.2, 1);
  low.setPixelRatio(pr);
  low.setSize(w, h, false);
  hi.setPixelRatio(Math.min(devicePixelRatio, 2));
  hi.setSize(w, h, false);
  ink.resize(pr);
  // fit the columns across, and at least two rows of height
  dist = Math.max((COLS * CELL.w + 0.4) / 2 / (T * camera.aspect), (CELL.h * 2.4) / 2 / T);
  follow();
}

type Target = { pos: THREE.Vector3; scale: number; opacity: number; spin: boolean; tilt?: number; sway?: number };
const gone = (i: number): Target => ({ pos: slot(i).setZ(slot(i).z - 2), scale: 0.6, opacity: 0, spin: false });

// the picked icon keeps its slot and size, rocks gently about its upright axis and carries the glow
// a row whose centre leaves the band fades out, so nothing sits under the header or the button bar
const sway = (picked: boolean) => (picked ? 0.35 * Math.sin(clock() * 1.6) : 0);
function gridTarget(i: number): Target {
  const y = screenY(i, camV);
  const opacity = clamp(Math.min(y - BOTTOM + 0.16, TOP + 0.16 - y) / 0.06, 0, 1);
  return view === 'models' ? { pos: slot(i), scale: 1, opacity, spin: false, sway: sway(i === msel) } : gone(i);
}
/** the cases page's middle, in fractions of the view: the ring sits round it */
const hub = () => (portrait() ? { x: 0, y: 0.06 } : { x: -0.2, y: 0.02 });
/** the open phone: in the ring's middle, turning; bigger and still, back to the camera, in edit */
function openTarget(it: Item): Target {
  const pt = portrait();
  if (view === 'edit') return { pos: ahead(0, pt ? 0.04 : 0.02, D), scale: fill(pt ? 0.56 : 0.78, D, it.h), opacity: 1, spin: false, tilt: 0 };
  return { pos: ahead(hub().x, hub().y, D), scale: fill(pt ? 0.24 : 0.36, D, it.h), opacity: 1, spin: true };
}
const page = () => Math.floor(ring / RING);
/** design j on the cases page: this page's designs evenly round the phone, the picked one at the bottom */
function ringTarget(it: Item, j: number): Target {
  const n = shown().length;
  const k = j - page() * RING;
  const m = Math.min(RING, n - page() * RING);
  if (view !== 'cases' || k < 0 || k >= m) return gone(j);
  const a = -Math.PI / 2 + ((k - turn) * 2 * Math.PI) / m;
  const pt = portrait();
  const pos = ahead(hub().x + Math.cos(a) * (pt ? 0.34 : 0.17), hub().y + Math.sin(a) * (pt ? 0.22 : 0.3), D);
  return { pos, scale: fill(pt ? 0.1 : 0.13, D, it.h), opacity: 1, spin: false, sway: sway(j === ring) };
}
/** △ on a model: the phone small and rocking, centred over the labels and level with the name in style.css #info */
function infoTarget(it: Item): Target {
  const col = $('i-list').querySelector('dt')?.getBoundingClientRect();
  const row = $('i-name').getBoundingClientRect();
  const x = col ? (col.left + col.right) / 2 / innerWidth - 0.5 : -0.3;
  const y = 0.5 - (row.top + row.bottom) / 2 / innerHeight;
  return { pos: ahead(x, y, D), scale: fill(portrait() ? 0.2 : 0.3, D, it.h), opacity: 1, spin: false, sway: sway(true) };
}
function frontTarget(i: number): Target {
  const shown = fronts();
  const k = Math.max(shown.indexOf(i), 0);
  return {
    pos: ahead((k - (shown.length - 1) / 2) * (portrait() ? 0.48 : 0.3), 0.02, D),
    scale: fill((portrait() ? 0.26 : 0.36) * (theme.front[i].size ?? 1), D, front[i].h) * (k === fsel ? 1.12 : 1),
    opacity: view === 'boot' && shown.includes(i) ? 1 : 0,
    spin: false,
  };
}

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const unwind = (a: number, rest: number) => rest + (((a - rest) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
/** pop-in: 0 before it is born, overshooting a little to 1 over 0.3 s */
const pop = (it: Item, now: number) => {
  const k = it.ready ? clamp((now - it.born) / 0.3, 0, 1) : 0;
  return k && 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
};

function pose(it: Item, t: Target, dt: number, grow = 1) {
  it.pos.x = damp(it.pos.x, t.pos.x, 7, dt);
  it.pos.y = damp(it.pos.y, t.pos.y, 7, dt);
  it.pos.z = damp(it.pos.z, t.pos.z, 7, dt);
  it.scale = damp(it.scale, t.scale, 7, dt);
  it.opacity = damp(it.opacity, t.opacity, 6, dt);
  if (t.spin) {
    it.spin += dt * (theme.spin + fling);
    it.tilt = damp(it.tilt, -0.05, 4, dt);
  } else {
    // ease back to the rest pose the short way round
    it.spin = damp(unwind(it.spin, REST.y), REST.y + (t.sway ?? 0), 5, dt);
    it.tilt = damp(it.tilt, t.tilt ?? REST.x, 5, dt);
  }
  it.holder.position.copy(it.pos);
  it.holder.scale.setScalar(it.scale * grow);
  it.holder.rotation.set(it.tilt, it.spin, 0);
  it.holder.visible = it.opacity > 0.01 && grow > 0;
  for (const m of it.materials) {
    m.opacity = it.opacity;
    m.depthWrite = it.opacity > 0.98;
  }
}

const timer = new THREE.Timer();
let hiDrawn = false;
low.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.05);
  const now = clock();
  fling = damp(fling, 0, 1.5, dt);
  const open = view === 'cases' || view === 'detail' || view === 'edit';

  models.forEach((it, i) => pose(it, view === 'info' && i === msel ? infoTarget(it) : open && it === fit ? openTarget(it) : gridTarget(i), dt, view === 'models' ? pop(it, now) : 1));
  // the ring turns the short way round to the picked design
  const list = shown();
  const m = Math.min(RING, list.length - page() * RING);
  if (m > 0) {
    const to = ring - page() * RING;
    turn = (turn + m) % m;
    turn += ((((to - turn) % m) + m * 1.5) % m - m / 2) * (1 - Math.exp(-8 * dt));
  }
  caseItems.forEach((it, i) => {
    const j = list.indexOf(it);
    pose(it, j < 0 ? gone(i) : ringTarget(it, j), dt, view === 'cases' ? pop(it, now) : 1);
  });

  // the front icons hold their own pose; the entered one flips toward the camera and blows up
  let k = 0;
  if (flip) {
    const s = clamp((now - flip.t0) / 0.35, 0, 1);
    k = flip.dir > 0 ? s * s : (1 - s) ** 2;
    if (flip.dir < 0 && s >= 1) flip = null;
  }
  front.forEach((it, i) => {
    pose(it, frontTarget(i), dt);
    const f = flip && flip.i === i ? k : 0;
    it.holder.rotation.set(theme.front[i].pose[0] + f * FLIP, theme.front[i].pose[1], theme.front[i].pose[2]);
    it.holder.scale.setScalar(it.scale * (1 + 8 * f));
  });

  const grid = view === 'models' ? models : view === 'cases' ? list : [];
  const busyPop = grid.some((it) => !it.ready || now < it.born + 0.3);
  if (busyPop !== loading) {
    loading = busyPop;
    paint();
  }

  // the case on 17e: any template while editing, else the worn one, open or on the models page; printing blows it outward and away
  const caseOn = view === 'edit' || (store.worn >= 0 && (open || view === 'models' || view === 'info'));
  let alpha = caseOn ? fit.opacity * theme.case.opacity : 0;
  let s = 1;
  if (printAt >= 0) {
    const p = clamp((now - printAt) / 0.7, 0, 1);
    s = 1 + 0.6 * (1 - (1 - p) ** 3);
    alpha *= 1 - p;
  }
  caseMesh.scale.setScalar(s);
  caseMesh.position.copy(centre).multiplyScalar(1 - s);
  caseMat.opacity = alpha;
  caseMesh.visible = alpha > 0.003;

  // front page: a centre dot in front of the icon and an underglow behind it on the same spot
  // phone selection grid and the cases ring: one glow on the icon's lower part, depth-tested so a row in front covers it
  // both jump, never glide
  const lit = view === 'boot' ? front[fronts()[fsel]] : view === 'models' ? models[msel] : view === 'cases' && !menu ? list[ring] : null;
  if (lit && !flip && !busy) {
    const g = view === 'boot' ? 1 : Math.min(pop(lit, now), 1);
    const h = lit.h * lit.scale;
    const toCam = camera.position.clone().sub(lit.pos);
    const o = theme.dot * (0.85 + 0.15 * Math.sin(now * 2.1)) * lit.opacity * g;
    if (view === 'boot') {
      dot.position.copy(lit.pos).add(toCam.clone().setLength(0.3));
      dot.scale.setScalar(h * 0.55);
      // past the icon's bounding radius, or the tilted icon's far half pokes through the additive glow
      glow.position.copy(lit.pos).sub(toCam.setLength(h * 0.55));
      glow.scale.set(h * 1.9, h * 0.9, 1);
      glow.material.opacity = dot.material.opacity = o;
    } else {
      dot.position.copy(lit.pos);
      dot.position.y -= h * 0.42;
      dot.position.add(camera.position.clone().sub(dot.position).setLength(0.3));
      dot.scale.setScalar(h * 1.2);
      dot.material.opacity = o;
      glow.material.opacity = 0;
    }
    dot.material.depthTest = view !== 'boot';
  } else glow.material.opacity = dot.material.opacity = 0;

  const c = camAt();
  camera.position.set(damp(camera.position.x, c.x, 8, dt), damp(camera.position.y, c.y, 8, dt), damp(camera.position.z, c.z, 8, dt));
  camera.layers.set(0);
  low.render(scene, camera);
  if (caseMesh.visible || hiDrawn) {
    camera.layers.set(1);
    hi.render(scene, camera);
    camera.layers.set(0);
    hiDrawn = caseMesh.visible;
  }
  ink.draw();
});

// text and buttons
/** a button: the mark drawn in straight strokes, in its official colour's grey, inside a black disc */
const disc = (mark: string, color: string) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11.5" fill="#000"/>` +
      `<g fill="none" stroke="${color}" stroke-width="2.6">${mark}</g></svg>`,
  );
const glyph = {
  cross: disc('<path d="M6.3 6.3 17.7 17.7M17.7 6.3 6.3 17.7"/>', theme.buttons.cross),
  circle: disc('<circle cx="12" cy="12" r="6.4"/>', theme.buttons.circle),
  triangle: disc('<path d="M12 4.6 18.6 16H5.4Z" stroke-linejoin="miter"/>', theme.buttons.triangle),
};
type Press = keyof typeof glyph;
const bars: Record<View, [Press, string][]> = {
  boot: [['cross', S.enter]],
  models: [['cross', S.enter], ['circle', S.back], ['triangle', S.options]],
  cases: [['cross', S.pick], ['circle', S.back], ['triangle', S.options]],
  detail: [],
  edit: [['cross', S.enter], ['circle', S.back]],
  info: [['circle', S.back]],
};

const text = (id: string, s: string) => ($(id).textContent = s);
const ink$ = (tag: string, s: string, cls = '') => {
  const e = document.createElement(tag);
  e.className = 'ink' + (cls && ' ' + cls);
  e.textContent = s;
  return e;
};

/** the command list's rows and whether each can be picked; a phone with no design only edits */
function rows(): [string, boolean][] {
  const has = shown().length > 0;
  if (menu === 1 && view === 'detail') return [[S.copy, true], [S.delete, !!store.list[store.worn]?.edited]];
  if (menu === 1) return [[S.edit, true], [S.print, has], [S.delete, has]];
  if (menu === 2) return [[S.export, true], [S.order, !!theme.order]];
  return [];
}

function paint() {
  document.body.dataset.view = view;
  if (menu) document.body.dataset.menu = '';
  else delete document.body.dataset.menu;
  const p = phones[msel];
  const t = store.list[store.cur];
  const list = edited();
  const pages = Math.ceil(list.length / RING);
  text('brand', S.brand);
  const count = view === 'models' ? `${models.length} ${S.models}` : view === 'cases' ? `${list.length} ${S.cases}` : '';
  text('sub', count && loading ? S.loading : count);

  let n1 = '';
  let n2 = '';
  if (view === 'boot') {
    const f = theme.front[fronts()[fsel]].icon;
    n1 = f === 'logo' ? S.title : label(f);
    n2 = f === 'logo' ? `${models.length} ${S.models}` : `${list.length} ${S.cases}`;
  } else if (view === 'models') {
    n1 = label(p.id);
    n2 = year(p.id);
  } else if (view === 'cases') {
    n1 = list.length ? styleName(list[ring]) : S.noCases;
    n2 = pages > 1 ? `${label(card.id)} ${page() + 1}/${pages}` : label(card.id);
  } else if (view === 'edit' && t) {
    n1 = styleName(t.style);
  }
  text('n1', n1);
  text('n2', n2);

  const w = store.list[store.worn];
  text('d-maker', S.title);
  text('d-name', label(p.id));
  text('d-case', w ? `${styleName(w.style)} ${S.case}`.toUpperCase() : '');
  text('d-size', `${p.W} × ${p.L} × ${p.T} mm`);

  const made = p.id === card.id ? list.length : 0;
  text('i-name', `${S.product} ${label(p.id)}`);
  const on = p.id === card.id && store.worn >= 0 ? styleName(store.list[store.worn].style) : S.bare;
  $('i-list').replaceChildren(
    ...[
      [S.maker, S.title],
      [S.released, year(p.id)],
      [S.size, `${p.W} × ${p.L} × ${p.T} mm`],
      [S.made, made ? String(made) : S.none],
      [S.wearing, on],
    ].flatMap(([k, v]) => [ink$('dt', k), ink$('dd', v)]),
  );

  // the console's flow: the chosen option stays as the heading, then a question or the work
  const ul = $('commands');
  const li = (e: HTMLElement) => {
    const l = document.createElement('li');
    l.append(e);
    return l;
  };
  const button = (s: string, on: boolean, click: () => void, cls = '') => {
    const b = ink$('button', s, [on ? 'on' : '', cls].filter(Boolean).join(' '));
    b.onclick = click;
    return li(b);
  };
  const row = ([s, ok]: [string, boolean], i: number) =>
    button(s, ok && i === cmd, () => (!ok ? sfx.cancel() : cmd === i ? press('cross') : (sfx.tick(), (cmd = i), paint())), [ok ? '' : 'off', s === S.delete ? 'del' : ''].filter(Boolean).join(' '));
  if (menu === 1) ul.replaceChildren(...rows().map(row));
  else if (menu === 2) ul.replaceChildren(li(ink$('p', S.print)), ...rows().map(row));
  else if (menu === 3) {
    ul.replaceChildren(
      li(ink$('p', S.delete, 'del')),
      li(ink$('p', S.sure)),
      button(S.yes, yes, () => (yes ? press('cross') : (sfx.tick(), (yes = true), paint()))),
      button(S.no, !yes, () => (!yes ? press('cross') : (sfx.tick(), (yes = false), paint()))),
    );
  } else if (menu === 4) ul.replaceChildren(li(ink$('p', S.print)), li(ink$('p', S.printing)), li(ink$('p', S.keep)));
  else ul.replaceChildren();

  const bar = $('bar');
  const keys: [Press, string][] = menu === 4 ? [] : menu ? [['cross', S.enter], ['circle', S.back]] : bars[view];
  bar.replaceChildren(
    ...keys.map(([k, s]) => {
      const b = document.createElement('button');
      const img = document.createElement('img');
      img.className = 'px';
      img.src = glyph[k];
      img.alt = '';
      b.append(img, ink$('span', s));
      b.onclick = () => press(k);
      return b;
    }),
  );
}

const fade = $('fade');
/** black over everything: snaps on, then lifts over ms */
function lift(ms: number) {
  fade.style.transition = 'none';
  fade.style.opacity = '1';
  void fade.offsetWidth;
  fade.style.transition = `opacity ${ms}ms linear`;
  fade.style.opacity = '0';
}

/** the cases page; its designs pop in one by one after delay seconds */
function openCases(delay: number) {
  view = 'cases';
  menu = 0;
  ring = clamp(ring, 0, Math.max(shown().length - 1, 0));
  turn = ring - page() * RING;
  const now = clock();
  shown().forEach((it, j) => {
    it.pos.copy(ringTarget(it, j).pos);
    it.born = now + delay + (j % RING) * 0.06;
  });
}

/** the console's memory card select: the icon flips up into the camera, then the page fades in and its icons pop in one by one */
function enterFront() {
  sfx.card();
  busy = true;
  const i = (entered = fronts()[fsel]);
  flip = { i, t0: clock(), dir: 1 };
  document.body.dataset.busy = '';
  setTimeout(() => {
    flip = null;
    for (const it of front) it.opacity = 0;
    if (opens(i) === 'cases') {
      from = 'boot';
      camera.position.copy(camAt());
      fit.pos.copy(openTarget(fit).pos);
      openCases(0.35);
    } else {
      view = 'models';
      follow();
      camera.position.copy(camAt());
      const now = clock();
      models.forEach((it, j) => {
        it.pos.copy(gridTarget(j).pos);
        it.born = now + 0.35 + j * 0.06;
      });
    }
    delete document.body.dataset.busy;
    busy = false;
    lift(500);
    paint();
  }, 350);
}

/** back to the front page: a quick black, then the icon un-flips into place */
function leave() {
  sfx.cancel();
  busy = true;
  fade.style.transition = 'opacity 180ms linear';
  fade.style.opacity = '1';
  setTimeout(() => {
    for (const it of view === 'models' ? models : [...shown(), fit]) it.opacity = 0;
    view = 'boot';
    camera.position.copy(camAt());
    // back on the icon it came from; a phone whose last design went is off the front page
    fsel = Math.max(fronts().indexOf(entered), 0);
    front.forEach((it, i) => {
      it.pos.copy(frontTarget(i).pos);
      it.opacity = frontTarget(i).opacity;
    });
    flip = { i: fronts()[fsel], t0: clock(), dir: -1 };
    busy = false;
    lift(300);
    paint();
  }, 180);
}

/** Export: the picked design goes on the phone, blows away and downloads */
function print() {
  const i = tpl();
  const t = store.list[i];
  if (!t) return;
  store.cur = store.worn = i;
  wear();
  menu = 4;
  sfx.print();
  printAt = clock();
  geo(t.style).then((g) => exportStl(g, `iphone-${card.id}-${t.style}.stl`));
  t.printed = new Date().toISOString();
  saveTemplates(store);
  setTimeout(() => {
    menu = 0;
    printAt = -1;
    paint();
  }, 1800);
}

/** Order: a mail to theme.order naming the design, until a checkout exists */
function mail() {
  const t = store.list[tpl()];
  if (!t) return;
  menu = 0;
  location.href = `mailto:${theme.order}?subject=${encodeURIComponent(`${label(card.id)} ${styleName(t.style)} ${S.case}`)}`;
}

/** Delete: that design only; its style stays to be designed again */
function remove() {
  const i = tpl();
  const t = store.list[i];
  if (!t) return;
  delete t.edited;
  delete t.printed;
  if (store.worn === i) store.worn = -1;
  saveTemplates(store);
  menu = 0;
  ring = clamp(ring, 0, Math.max(shown().length - 1, 0));
  turn = ring - page() * RING;
}

/** a key while the command list is open */
function command(k: Press) {
  if (menu === 4) return;
  if (k === 'circle') {
    sfx.cancel();
    // back one level, the cursor on the row that opened it
    cmd = menu - 1;
    menu = menu === 1 ? 0 : 1;
    if (view === 'detail' && !menu) {
      view = 'models';
      follow();
    }
    return paint();
  }
  if (k !== 'cross') return;
  if (menu === 3) {
    if (yes) {
      sfx.confirm();
      remove();
      if (view === 'detail') menu = 1;
    } else {
      sfx.cancel();
      menu = 1;
      cmd = view === 'detail' ? 1 : 2;
    }
    return paint();
  }
  if (!rows()[cmd]?.[1]) return sfx.cancel();
  sfx.confirm();
  if (menu === 1 && cmd === 0) {
    back = view === 'detail' ? 'detail' : 'cases';
    undo = store.worn;
    if (tpl() >= 0) store.cur = tpl();
    wear();
    menu = 0;
    view = 'edit';
  } else if (menu === 1) {
    menu = cmd === 1 && view !== 'detail' ? 2 : 3;
    cmd = 0;
    yes = false;
  } else if (cmd === 0) print();
  else mail();
  paint();
}

function press(k: Press) {
  if (busy || flip) return;
  if (view === 'boot') {
    if (k === 'cross') enterFront();
    return;
  }
  if (view === 'models') {
    if (k === 'circle') return leave();
    if (k === 'triangle') {
      sfx.confirm();
      view = 'info';
      return paint();
    }
    if (k !== 'cross') return;
    if (models[msel] !== fit) return sfx.cancel();
    sfx.confirm();
    view = 'detail';
    menu = 1;
    cmd = 0;
    // detail's Copy and Delete work on the worn design
    ring = Math.max(edited().indexOf(store.list[store.worn]?.style ?? ''), 0);
  } else if (view === 'detail') return command(k);
  else if (view === 'cases') {
    if (menu) return command(k);
    if (k === 'circle') {
      if (from === 'boot') return leave();
      sfx.cancel();
      view = 'models';
      follow();
    } else if (k === 'triangle') {
      sfx.confirm();
      menu = 1;
      cmd = 0;
    } else {
      // ✕ puts the picked design on the phone
      const i = tpl();
      if (i < 0) return sfx.cancel();
      sfx.confirm();
      store.cur = store.worn = i;
      saveTemplates(store);
      wear();
    }
  } else if (view === 'edit') {
    const t = store.list[store.cur];
    if (k === 'cross' && t) {
      sfx.confirm();
      t.edited = new Date().toISOString();
      store.worn = store.cur;
      ring = edited().indexOf(t.style);
    } else if (k === 'circle') {
      sfx.cancel();
      store.worn = undo;
      if (undo >= 0) store.cur = undo;
      wear();
    } else return;
    saveTemplates(store);
    view = back;
    if (back === 'detail') {
      menu = 1;
      cmd = 0;
    }
  } else if (view === 'info') {
    if (k !== 'circle') return;
    sfx.cancel();
    view = 'models';
    follow();
  }
  paint();
}

/** edit: the next or previous template on the phone */
function swap(d: number) {
  const n = store.list.length;
  if (!n) return;
  store.cur = (store.cur + d + n) % n;
  wear();
  sfx.tick();
  paint();
}

function move(dx: number, dy: number) {
  if (busy || flip) return;
  if (view === 'boot') {
    const n = clamp(fsel + dx, 0, fronts().length - 1);
    if (n === fsel) return;
    fsel = n;
  } else if (view === 'models') {
    const n = msel + dx + dy * COLS;
    if (n < 0 || n >= models.length || (dx && rowOf(n) !== rowOf(msel))) return;
    msel = n;
    follow();
  } else if (view === 'edit') {
    if (!dx) return;
    return swap(dx);
  } else if (view === 'info' || menu === 4) return;
  else if (menu === 3) yes = !yes;
  else if (menu) {
    // up and down step over the rows that cannot be picked
    const r = rows();
    if (!dy) return;
    let n = cmd;
    do n = (n + dy + r.length) % r.length;
    while (!r[n][1]);
    if (n === cmd) return;
    cmd = n;
  } else {
    // ←/→ turn the ring, ↑/↓ change its page
    const n = shown().length;
    const p = page();
    const m = Math.min(RING, n - p * RING);
    if (!n) return;
    if (dx) {
      const r = p * RING + ((ring - p * RING + dx + m) % m);
      if (r === ring) return;
      ring = r;
    } else {
      const q = clamp(p + dy, 0, Math.ceil(n / RING) - 1);
      if (q === p) return;
      ring = q * RING;
      openCases(0);
    }
  }
  sfx.tick();
  paint();
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  const map: Record<string, () => void> = {
    arrowleft: () => move(-1, 0),
    arrowright: () => move(1, 0),
    arrowup: () => move(0, -1),
    arrowdown: () => move(0, 1),
    enter: () => press('cross'),
    x: () => press('cross'),
    ' ': () => press('cross'),
    escape: () => press('circle'),
    backspace: () => press('circle'),
    o: () => press('circle'),
    t: () => press('triangle'),
    m: sfx.toggleMute,
  };
  if (map[k]) {
    e.preventDefault();
    map[k]();
  }
});
// audio may only start inside a gesture
addEventListener('pointerdown', sfx.unlock, { capture: true, once: true });
addEventListener('keydown', sfx.unlock, { capture: true, once: true });

// touch: tap picks, a second tap on the picked icon is ✕; vertical drag scrolls the grid,
// horizontal drag flings the cases page's phone round, a horizontal swipe in edit changes the case
const ray = new THREE.Raycaster();
const canvas = $('view');
let down: { x: number; y: number; camV: number; last: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, camV, last: e.clientX };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  if (view === 'models') {
    const { min, max } = camLimits();
    camV = clamp(down.camV + ((e.clientY - down.y) / innerHeight) * 2 * dist * T, min, max);
  } else if (view === 'cases') {
    fling += (e.clientX - down.last) * 0.08;
    down.last = e.clientX;
  }
});
canvas.addEventListener('pointerup', (e) => {
  const d = down;
  down = null;
  if (!d) return;
  const dx = e.clientX - d.x;
  if (view === 'edit' && Math.abs(dx) > 40) return swap(dx < 0 ? 1 : -1);
  if (Math.hypot(dx, e.clientY - d.y) > 8) return;
  const list = view === 'boot' ? fronts().map((i) => front[i]) : view === 'models' ? models : view === 'cases' && !menu ? shown() : [];
  if (!list.length) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(list.filter((it) => it.holder.visible).map((it) => it.holder), true)[0];
  if (!hit) return;
  let o: THREE.Object3D = hit.object;
  while (o.parent && o.parent !== scene) o = o.parent;
  const i = list.findIndex((it) => it.holder === o);
  if (i < 0) return;
  const cur = view === 'boot' ? fsel : view === 'models' ? msel : ring;
  if (i === cur) return press('cross');
  if (view === 'boot') fsel = i;
  else if (view === 'cases') ring = i;
  else {
    msel = i;
    follow();
  }
  sfx.tick();
  paint();
});

addEventListener('resize', layout);
msel = models.indexOf(fit);
layout();
models.forEach((it, i) => it.pos.copy(gone(i).pos));
front.forEach((it, i) => {
  const t = frontTarget(i);
  it.pos.copy(t.pos);
  it.scale = t.scale;
});
camera.position.copy(camAt());
paint();
