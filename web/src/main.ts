import * as THREE from 'three';
import '@fontsource/arimo/latin-700.css';
import theme from '../themes/memcard.json';
import specs from '../phones.json';
import { buildPhone, framed, label, type PhoneSpec } from './phone';
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
const CELL = { w: 0.9, h: 1.75 };
const FOV = 40;
const T = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const TILT = 0.6; // the grid's plane leans back by this: lower rows sit nearer the camera and read bigger
const REST = { x: 0.45, y: 0 }; // grid pose: upright and square, top leaning toward the camera
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

/** the glare on the selected icon: a hot white dot whose light bleeds past the object's edges */
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
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  s.renderOrder = 1;
  return s;
}
const glow = glowSprite();
scene.add(glow);

type Item = {
  holder: THREE.Group;
  materials: THREE.Material[];
  h: number; // height at scale 1
  pos: THREE.Vector3;
  scale: number;
  opacity: number;
  spin: number;
  tilt: number;
  born: number; // when it pops in on a grid
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

// the models page: one finish for every phone, grey where no case is finished yet
const bodies = phones.map((p) => buildPhone(p, READY.has(p.id) ? theme.finish : theme.ghost, 8));
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

// the front page: the apple opens the models, the phone opens its cases
const OPENS = ['models', 'cases'] as const;
const front = theme.front.map((f) => {
  const { object, materials } =
    f.icon === 'logo' ? buildLogo(LOGO_H, card.T, theme.finish, f.seg) : buildPhone(spec(f.icon), theme.finish, f.seg);
  return item(object, materials, f.icon === 'logo' ? LOGO_H : spec(f.icon).L);
});

// the cases page and the templates, once the built cases are known
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

type View = 'boot' | 'models' | 'cases' | 'detail' | 'edit';
type Grid = 'models' | 'cases';
let view: View = 'boot';
let from: Grid = 'models'; // the grid the open phone came from
const sel: Record<Grid, number> = { models: 0, cases: 0 };
let fsel = 0; // front page icon
let cmd = 0; // detail: 0 edit, 1 print
let ask = 0; // print: 0 not asked, 1 are you sure, 2 printing
let yes = false;
let editFrom = 0;
let printAt = -1;
let flip: { i: number; t0: number; dir: 1 | -1 } | null = null;
let busy = false;
let camV = 0; // camera along the grid plane, in flat grid units
let fling = 0; // extra spin from a swipe, decays to the theme's spin
let dist = 4;
let loading = false;

const isGrid = (v: View): v is Grid => v === 'models' || v === 'cases';
const gridOf = (g: Grid) => (g === 'cases' ? caseItems : models);
const here = (): Grid => (isGrid(view) ? view : from);
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
const BOTTOM = -0.5 + 0.22;
const camLimits = () => {
  const n = gridOf(here()).length;
  const max = solve(0, TOP);
  return { min: Math.min(max, solve(Math.max(n - 1, 0), BOTTOM)), max };
};
/** scroll just enough to keep the selected row inside the band */
function follow() {
  const i = sel[here()];
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
  // fit four columns across, and at least two rows of height
  dist = Math.max((COLS * CELL.w + 0.4) / 2 / (T * camera.aspect), (CELL.h * 2.4) / 2 / T);
  follow();
}

type Target = { pos: THREE.Vector3; scale: number; opacity: number; spin: boolean; tilt?: number };
const gone = (i: number): Target => ({ pos: slot(i).setZ(slot(i).z - 2), scale: 0.6, opacity: 0, spin: false });

const PULL = 2.4; // the picked icon comes this far toward the camera along its sight line, clear of the nearer row
function gridTarget(g: Grid, i: number): Target {
  if (view !== g) return gone(i);
  if (i !== sel[g]) return { pos: slot(i), scale: 1, opacity: 1, spin: false };
  // same place on screen, nearer: position and scale shrink together toward the camera
  const c = camAt();
  const p = slot(i).sub(c);
  const f = 1 - PULL / p.length();
  return { pos: p.multiplyScalar(f).add(c), scale: theme.pick * f, opacity: 1, spin: false };
}
/** the open phone: upper middle in portrait, left in landscape; bigger and still, back to the camera, in edit */
function openTarget(it: Item): Target {
  const pt = portrait();
  if (view === 'edit') return { pos: ahead(0, pt ? 0.04 : 0.02, D), scale: fill(pt ? 0.56 : 0.78, D, it.h), opacity: 1, spin: false, tilt: 0 };
  return { pos: ahead(pt ? 0 : -0.2, pt ? 0.2 : 0.02, D), scale: fill(pt ? 0.36 : 0.62, D, it.h), opacity: 1, spin: true };
}
const frontTarget = (i: number): Target => ({
  pos: ahead((i - (front.length - 1) / 2) * (portrait() ? 0.48 : 0.3), 0.02, D),
  scale: fill((portrait() ? 0.26 : 0.36) * (theme.front[i].size ?? 1), D, front[i].h) * (i === fsel ? 1.12 : 1),
  opacity: view === 'boot' ? 1 : 0,
  spin: false,
});

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
    it.spin = damp(unwind(it.spin, REST.y), REST.y, 5, dt);
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
  const open = view === 'detail' || view === 'edit';

  models.forEach((it, i) => pose(it, open && it === fit ? openTarget(it) : gridTarget('models', i), dt, view === 'models' ? pop(it, now) : 1));
  caseItems.forEach((it, i) => pose(it, gridTarget('cases', i), dt, view === 'cases' ? pop(it, now) : 1));

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

  const grid = isGrid(view) ? gridOf(view) : [];
  const busyPop = grid.some((it) => !it.ready || now < it.born + 0.3);
  if (busyPop !== loading) {
    loading = busyPop;
    paint();
  }

  // the case on the open phone; printing blows it outward and away
  let alpha = open ? fit.opacity * theme.case.opacity : 0;
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

  // the glare: on the selected front icon, at the foot of the selected grid item; it jumps, never glides
  const lit = view === 'boot' ? front[fsel] : isGrid(view) ? grid[sel[view]] : null;
  if (lit && !flip && !busy) {
    const g = view === 'boot' ? 0 : pop(lit, now);
    glow.position.copy(lit.pos);
    if (view !== 'boot') glow.position.add(new THREE.Vector3(0, -lit.h * lit.scale * 0.48, 0.15));
    else glow.position.z += 0.3;
    glow.scale.setScalar(lit.h * lit.scale * (view === 'boot' ? 0.55 : 0.32));
    glow.material.opacity = theme.dot * (0.85 + 0.15 * Math.sin(now * 2.1)) * lit.opacity * (view === 'boot' ? 1 : Math.min(g, 1));
  } else glow.material.opacity = 0;

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
  cases: [['cross', S.enter], ['circle', S.back], ['triangle', S.options]],
  detail: [['cross', S.enter], ['circle', S.back]],
  edit: [['cross', S.enter], ['circle', S.back]],
};

const text = (id: string, s: string) => ($(id).textContent = s);
const ink$ = (tag: string, s: string, cls = '') => {
  const e = document.createElement(tag);
  e.className = 'ink' + (cls && ' ' + cls);
  e.textContent = s;
  return e;
};

function paint() {
  document.body.dataset.view = view;
  const p = phones[sel.models];
  const t = store.list[store.cur];
  text('brand', S.brand);
  text('sub', !isGrid(view) ? '' : loading ? S.loading : view === 'cases' ? `${caseItems.length} ${S.cases}` : `${models.length} ${S.models}`);

  let n1 = '';
  let n2 = '';
  if (view === 'boot') {
    const f = theme.front[fsel].icon;
    n1 = f === 'logo' ? S.title : label(f);
    n2 = OPENS[fsel] === 'models' ? `${models.length} ${S.models}` : `${styles.length} ${S.cases}`;
  } else if (view === 'models') {
    n1 = label(p.id);
    n2 = year(p.id);
  } else if (view === 'cases' && styles.length) {
    n1 = styleName(styles[sel.cases]);
    n2 = label(card.id);
  } else if (view === 'edit' && t) {
    n1 = styleName(t.style);
    n2 = `${store.cur + 1} / ${store.list.length}`;
  }
  text('n1', n1);
  text('n2', n2);

  text('d-maker', S.title);
  text('d-name', label(p.id));
  text('d-case', t ? `${styleName(t.style)} ${S.case}` : '');
  text('d-size', `${p.W} × ${p.L} × ${p.T} mm`);

  // the console's delete flow: the chosen option stays as the heading, then a question, then the work
  const ul = $('commands');
  const li = (e: HTMLElement) => {
    const l = document.createElement('li');
    l.append(e);
    return l;
  };
  const button = (s: string, on: boolean, click: () => void) => {
    const b = ink$('button', s, on ? 'on' : '');
    b.onclick = click;
    return li(b);
  };
  if (ask === 0) {
    ul.replaceChildren(
      ...[S.edit, S.print].map((s, i) => button(s, i === cmd, () => (cmd === i ? press('cross') : (sfx.tick(), (cmd = i), paint())))),
    );
  } else if (ask === 1) {
    ul.replaceChildren(
      li(ink$('p', S.print)),
      li(ink$('p', S.sure)),
      button(S.yes, yes, () => (yes ? press('cross') : (sfx.tick(), (yes = true), paint()))),
      button(S.no, !yes, () => (!yes ? press('cross') : (sfx.tick(), (yes = false), paint()))),
    );
  } else ul.replaceChildren(li(ink$('p', S.print)), li(ink$('p', S.printing)), li(ink$('p', S.keep)));

  const bar = $('bar');
  bar.replaceChildren(
    ...bars[view].map(([k, s]) => {
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

/** the console's memory card select: the icon flips up into the camera, then the page fades in and its icons pop in one by one */
function enterFront() {
  sfx.card();
  busy = true;
  flip = { i: fsel, t0: clock(), dir: 1 };
  document.body.dataset.busy = '';
  setTimeout(() => {
    view = OPENS[fsel];
    flip = null;
    for (const it of front) it.opacity = 0;
    follow();
    camera.position.copy(camAt());
    const now = clock();
    gridOf(view).forEach((it, i) => {
      it.pos.copy(gridTarget(view as Grid, i).pos);
      it.born = now + 0.35 + i * 0.06;
    });
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
    for (const it of gridOf(view as Grid)) it.opacity = 0;
    view = 'boot';
    camera.position.copy(camAt());
    front.forEach((it, i) => {
      it.pos.copy(frontTarget(i).pos);
      it.opacity = 1;
    });
    flip = { i: fsel, t0: clock(), dir: -1 };
    busy = false;
    lift(300);
    paint();
  }, 180);
}

function print() {
  const t = store.list[store.cur];
  if (!t) return;
  ask = 2;
  sfx.print();
  printAt = clock();
  geo(t.style).then((g) => exportStl(g, `iphone-${card.id}-${t.style}.stl`));
  t.printed = new Date().toISOString();
  saveTemplates(store);
  setTimeout(() => {
    ask = 0;
    printAt = -1;
    paint();
  }, 1800);
}

function press(k: Press) {
  if (busy || flip) return;
  if (view === 'boot') {
    if (k === 'cross') enterFront();
    return;
  }
  if (isGrid(view)) {
    if (k === 'circle') return leave();
    if (k !== 'cross') return;
    if (view === 'models' && phones[sel.models].id !== card.id) return sfx.cancel();
    if (view === 'cases') {
      if (!styles.length) return;
      const i = store.list.findIndex((t) => t.style === styles[sel.cases]);
      if (i >= 0) store.cur = i;
      saveTemplates(store);
      wear();
      sel.models = models.indexOf(fit);
    }
    sfx.confirm();
    from = view;
    view = 'detail';
    cmd = 0;
    ask = 0;
  } else if (view === 'detail') {
    if (ask === 2) return;
    if (ask === 1) {
      if (k === 'cross' && yes) print();
      else if (k === 'cross' || k === 'circle') {
        sfx.cancel();
        ask = 0;
      } else return;
    } else if (k === 'circle') {
      sfx.cancel();
      view = from;
      follow();
    } else if (k === 'cross') {
      sfx.confirm();
      if (cmd === 0) {
        view = 'edit';
        editFrom = store.cur;
      } else {
        ask = 1;
        yes = false;
      }
    } else return;
  } else if (view === 'edit') {
    if (k === 'cross') {
      sfx.confirm();
      saveTemplates(store);
    } else if (k === 'circle') {
      sfx.cancel();
      store.cur = editFrom;
      wear();
    } else return;
    view = 'detail';
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
    const n = clamp(fsel + dx, 0, front.length - 1);
    if (n === fsel) return;
    fsel = n;
  } else if (isGrid(view)) {
    const list = gridOf(view);
    const i = sel[view];
    const n = i + dx + dy * COLS;
    if (n < 0 || n >= list.length || (dx && rowOf(n) !== rowOf(i))) return;
    sel[view] = n;
    follow();
  } else if (view === 'edit') {
    if (!dx) return;
    return swap(dx);
  } else if (ask === 1) yes = !yes;
  else if (ask === 0 && dy) cmd = (cmd + 2 + dy) % 2;
  else return;
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

// touch: tap picks, a second tap on the picked icon enters; vertical drag scrolls a grid,
// horizontal drag flings the open phone round, a horizontal swipe in edit changes the case
const ray = new THREE.Raycaster();
const canvas = $('view');
let down: { x: number; y: number; camV: number; last: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, camV, last: e.clientX };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  if (isGrid(view)) {
    const { min, max } = camLimits();
    camV = clamp(down.camV + ((e.clientY - down.y) / innerHeight) * 2 * dist * T, min, max);
  } else if (view === 'detail') {
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
  const list = view === 'boot' ? front : isGrid(view) ? gridOf(view) : [];
  if (!list.length) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(list.filter((it) => it.holder.visible).map((it) => it.holder), true)[0];
  if (!hit) return;
  let o: THREE.Object3D = hit.object;
  while (o.parent && o.parent !== scene) o = o.parent;
  const i = list.findIndex((it) => it.holder === o);
  if (i < 0) return;
  const cur = view === 'boot' ? fsel : sel[view as Grid];
  if (i === cur) return press('cross');
  if (view === 'boot') fsel = i;
  else {
    sel[view as Grid] = i;
    follow();
  }
  sfx.tick();
  paint();
});

addEventListener('resize', layout);
sel.models = models.indexOf(fit);
layout();
models.forEach((it, i) => it.pos.copy(gone(i).pos));
front.forEach((it, i) => {
  const t = frontTarget(i);
  it.pos.copy(t.pos);
  it.scale = t.scale;
});
camera.position.copy(camAt());
paint();
