import * as THREE from 'three';
import '@fontsource/arimo/latin-700.css';
import theme from '../themes/memcard.json';
import specs from '../phones.json';
import { buildLocked, buildPhone, framed, label, type PhoneSpec } from './phone';
import { buildLogo } from './logo';
import { READY, order, styleName, year } from './catalog';
import { built, exportStl, isSet, load, loadTemplates, placing, saveTemplates, solid, type Template } from './cases';
import { STEPS, combine, opsKey, partList, type Move, type Moves, type Op, type Part } from './parts';
import { inkLayer } from './ink';
import * as sfx from './sound';
import { picker, screenRect } from './pick';

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
const EDIT = 3; // edit's phone sits this many D away, scaled to match
const FLIP = THREE.MathUtils.degToRad(95);
const LOGO_H = 100; // mm

// two renderers over one scene: layer 0 at the console's line count, layer 1 (the open case) at full resolution
const low = new THREE.WebGLRenderer({ canvas: $('view') as HTMLCanvasElement, alpha: true });
const hi = new THREE.WebGLRenderer({ canvas: $('hi') as HTMLCanvasElement, alpha: true, antialias: true });
hi.localClippingEnabled = true; // edit's ghost is cut to the case's outline, as the solve cuts the part
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

// the models page: one finish for every phone, a black silhouette where no case is finished yet
const bodies = phones.map((p) => (READY.has(p.id) ? buildPhone(p, theme.finish, 8) : buildLocked(p, 8)));
const models = bodies.map((b, i) => item(b.object, b.materials, phones[i].L));
const fit = models[phones.indexOf(card)];

// the open phone's case: full resolution and see-through, over a depth-only copy of the phone so the phone hides what is behind it
const caseMat = new THREE.MeshStandardMaterial({
  color: theme.case.color, roughness: 0.3, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
});
const caseMesh = new THREE.Mesh(new THREE.BufferGeometry(), caseMat);
const centre = new THREE.Vector3(card.W / 2, -card.L / 2, -card.T / 2);
// edit's move: the part where it will go, drawn over the case, and the grid it snaps to
const ghost = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ color: C.pick, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false, clippingPlanes: [] }),
);
ghost.matrixAutoUpdate = false;
const snapGrid = new THREE.LineSegments(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: C.pick, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false }),
);
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
  for (const o of [ghost, snapGrid]) {
    o.layers.set(1);
    o.visible = false;
    o.renderOrder = 2;
    g.add(o);
  }
}

// the front page: a phone opens its cases page, the apple opens the models
const front = theme.front.map((f) => {
  const { object, materials } =
    f.icon === 'logo' ? buildLogo(LOGO_H, card.T, theme.finish, f.seg) : buildPhone(spec(f.icon), theme.finish, f.seg);
  return item(object, materials, f.icon === 'logo' ? LOGO_H : spec(f.icon).L);
});

// the built styles and part sets; the parts of each set, read once; the starts edit offers in its first row
let styles: string[] = [];
const setParts = new Map<string, Part[]>();
type Look = Pick<Template, 'style' | 'ops' | 'moves'>;
const copyLook = (l: Look): Look => ({ style: l.style, ops: l.ops && { ...l.ops }, moves: l.moves && { ...l.moves } });
let starts: { name: string; look: Look }[] = [];
let store = loadTemplates([]);

/** solved cases by style and ops, shared by the ring, the phone, edit and print; oldest dropped past GEOS */
const geos = new Map<string, Promise<THREE.BufferGeometry>>();
const GEOS = 24;
const keyOf = (t: Look) => (isSet(t.style) ? `${t.style}|${opsKey(t.ops, setParts.get(t.style) ?? [], t.moves)}` : t.style);
const sameLook = (a: Look, b: Look) => a.style === b.style && keyOf(a) === keyOf(b);
/** a design's case; lane 'edit' replaces the queued solve it overtakes, which then rejects and leaves the cache */
function caseOf(t: Look, lane?: string) {
  const k = keyOf(t);
  if (!geos.has(k)) {
    const p = isSet(t.style) ? combine(card.id, t.style, t.ops ?? {}, t.moves ?? {}, lane) : load(card.id, t.style);
    p.catch(() => geos.delete(k));
    geos.set(k, p);
    if (geos.size > GEOS) geos.delete(geos.keys().next().value!);
  }
  return geos.get(k)!;
}
let solving = 0; // the phone's solve in flight, a later one wins
/** puts a design's case on the open phone */
function wear(t?: Look) {
  if (!t) return;
  const n = ++solving;
  caseOf(t, 'edit').then(
    (g) => {
      if (n !== solving) return;
      solving = 0;
      caseMesh.geometry = g;
      paint();
    },
    () => {
      if (n !== solving) return;
      solving = 0;
      sfx.cancel();
      paint();
    },
  );
}

/** one ring item per saved design, made the first time the ring asks; a solve another lane overtook is asked again */
const items = new Map<Template, Item>();
function itemOf(t: Template) {
  let it = items.get(t);
  if (it) return it;
  const m = new THREE.MeshStandardMaterial({ color: theme.case.grid, roughness: 0.6, transparent: true });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
  it = item(framed(card, mesh), [m], card.L);
  it.ready = false;
  const fill = (): Promise<void> =>
    caseOf(t).then((g) => {
      mesh.geometry = g;
      it!.ready = true;
    }, fill);
  fill();
  items.set(t, it);
  return it;
}
function dropItem(t: Template) {
  const it = items.get(t);
  if (!it) return;
  scene.remove(it.holder);
  it.materials.forEach((m) => m.dispose());
  items.delete(t);
}

built(card.id).then(async (list) => {
  for (const s of list.filter(isSet)) setParts.set(s, (await partList(card.id, s)).list);
  styles = list;
  // a part set starts bare, its shell with every part off, or with its parts.json ops; a style as built
  const sets = list.filter(isSet);
  starts = [
    ...sets.map((s) => ({
      name: sets.length > 1 ? `${S.base} ${styleName(s)}` : S.base,
      look: { style: s, ops: Object.fromEntries(setParts.get(s)!.filter((p) => p.op !== 'base').map((p): [string, Op] => [p.name, 'off'])) },
    })),
    ...sets.map((s) => ({ name: styleName(s), look: { style: s } })),
    ...list.filter((s) => !isSet(s)).map((s) => ({ name: styleName(s), look: { style: s } })),
  ];
  store = loadTemplates(list);
  wear(store.list[store.worn]);
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
// the command list: 0 shut, 1 Edit Copy Print Delete, 2 Export Order, 3 are you sure, 4 printing
let menu = 0;
let cmd = 0;
let yes = false;
let opener = 0; // the row that opened the command list's second level, where ○ puts the cursor back
let draft: Look | null = null; // edit: the case being made; nothing is saved until ✕
let editing = -1; // edit: the design ✕ saves over, -1 a new one
let psel = 0; // edit: 0 the start row, then the parts added
let adding = false; // edit: □ opened the list of parts not yet added
let asel = 0; // edit: the picked row of that list
// edit: □ on a part moves and turns it on the back; at is its place, from what ○ puts back, snap steps it on the grid and by ANGLE;
// c is the part's middle, lo hi the x y z shifts that keep that middle over the case and within RISE of the back, box the case's outline, part the part's
let moving: {
  name: string; from: Move; at: Move; snap: boolean; c: THREE.Vector3; lo: number[]; hi: number[]; box: THREE.Box3; part: THREE.Box3; union: boolean;
} | null = null;
let side = false; // moving: the phone turned to its edge, the arrows then shift the part along y and z
const RISE = 15; // mm a part may sink into or lift off the back
const GRID = 2; // mm between grid lines, one snapped step
const FINE = 0.25; // mm one free arrow step
const ANGLE = 15; // degrees one snapped turn; a free turn is 1
let back: 'cases' | 'detail' = 'cases'; // where edit returns
let printAt = -1;
let flip: { i: number; t0: number; dir: 1 | -1 } | null = null;
let busy = false;
let camV = 0; // camera along the grid plane, in flat grid units
let fling = 0; // extra spin from a swipe, decays to the theme's spin
let grab = false; // a finger is on the open phone: it turns with the finger, not by itself
let dist = 4;
let loading = false;

const RING = 8; // designs on one ring page
/** the saved designs on built styles, in the order they were made */
const edited = () => store.list.filter((t) => t.edited && styles.includes(t.style));
const shown = () => edited().map(itemOf);
/** the picked design's index in store.list, -1 with none */
const tpl = () => store.list.indexOf(edited()[ring]);
/** a look's start name; a part set's look that is no start is custom */
const lookName = (t: Look) => starts.find((s) => sameLook(s.look, t))?.name ?? (isSet(t.style) ? S.custom : styleName(t.style));
/** a design's name on screen: its look's, numbered when designs share it */
function designName(t: Template) {
  const n = lookName(t);
  const same = edited().filter((x) => lookName(x) === n);
  return same.length > 1 ? `${n} ${same.indexOf(t) + 1}` : n;
}
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

type Target = { pos: THREE.Vector3; scale: number; opacity: number; spin: boolean; tilt?: number; sway?: number; yaw?: number };
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
  if (view === 'edit') {
    // EDIT times as far and as much bigger: the parts stand tens of mm off the back, and up close perspective spreads them past the case's sides
    const E = D * EDIT;
    const yaw = moving && side ? -Math.PI / 2 : 0;
    if (!pt) return { pos: ahead(0, 0.02, E), scale: fill(0.78, E, it.h), opacity: 1, spin: false, tilt: 0, yaw };
    // portrait: in the band between the header and the part list
    const list = $('parts').getBoundingClientRect();
    const top = 0.1 * innerHeight, bottom = list.height ? list.top - 0.02 * innerHeight : 0.88 * innerHeight;
    const y = 0.5 - (top + bottom) / 2 / innerHeight;
    return { pos: ahead(0, y, E), scale: fill(Math.min(0.62, (bottom - top) / innerHeight), E, it.h), opacity: 1, spin: false, tilt: 0, yaw };
  }
  if (view === 'detail') return { pos: ahead(pt ? 0 : -0.2, pt ? 0.1 : 0.02, D), scale: fill(pt ? 0.36 : 0.62, D, it.h), opacity: 1, spin: true };
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
  if (t.spin && grab) {
    // pointermove turns it
  } else if (t.spin) {
    it.spin += dt * (theme.spin + fling);
    it.tilt = damp(it.tilt, -0.05, 4, dt);
  } else {
    // ease back to the rest pose the short way round
    it.spin = damp(unwind(it.spin, REST.y), REST.y + (t.yaw ?? 0) + (t.sway ?? 0), 5, dt);
    it.tilt = damp(it.tilt, t.tilt ?? REST.x, 5, dt);
  }
  it.holder.position.copy(it.pos);
  it.holder.scale.setScalar(it.scale * grow);
  it.holder.rotation.set(it.tilt, it.spin, 0);
  it.holder.visible = it.opacity > 0.01 && grow > 0;
  for (const m of it.materials) {
    const a = m.userData.alpha ?? 1;
    m.opacity = it.opacity * a;
    m.depthWrite = it.opacity > 0.98 && a === 1;
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
  for (const it of items.values()) {
    const j = list.indexOf(it);
    pose(it, j < 0 ? gone(0) : ringTarget(it, j), dt, view === 'cases' ? pop(it, now) : 1);
  }

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
  const busyPop = grid.some((it) => !it.ready || now < it.born + 0.3) || (solving > 0 && open);
  if (busyPop !== loading) {
    loading = busyPop;
    paint();
  }
  // more rows past the band on the models page, more ring pages on the cases page
  const { min, max } = camLimits();
  const pages = Math.ceil(list.length / RING);
  const more = view === 'models' ? [camV < max - 1e-3, camV > min + 1e-3] : view === 'cases' && !menu ? [page() > 0, page() < pages - 1] : [false, false];
  (['up', 'down'] as const).forEach((k, i) => {
    if (more[i] !== k in document.body.dataset) more[i] ? (document.body.dataset[k] = '') : delete document.body.dataset[k];
  });

  // the case on 17e: any template while editing, else the worn one, open or on the models page; printing blows it outward and away
  const caseOn = view === 'edit' || (store.worn >= 0 && (open || view === 'models' || view === 'info'));
  // a solve in flight in edit dims the case it will replace
  let alpha = caseOn ? fit.opacity * theme.case.opacity * (view === 'edit' && solving ? 0.45 : 1) : 0;
  let s = 1;
  if (printAt >= 0) {
    const p = clamp((now - printAt) / 0.7, 0, 1);
    s = 1 + 0.6 * (1 - (1 - p) ** 3);
    alpha *= 1 - p;
  }
  caseMesh.scale.setScalar(s);
  caseMesh.position.copy(centre).multiplyScalar(1 - s);
  caseMat.opacity = alpha;
  if (ghost.visible) clipGhost();
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
  square: disc('<rect x="6.6" y="6.6" width="10.8" height="10.8"/>', theme.buttons.square),
  // the shoulder buttons, drawn as the turn each makes
  l1: disc('<path d="M16.8 9.2A5.6 5.6 0 1 0 17.6 13"/><path d="M17.6 4.6V9.6H12.6" stroke-linejoin="miter"/>', theme.buttons.square),
  r1: disc('<path d="M7.2 9.2A5.6 5.6 0 1 1 6.4 13"/><path d="M6.4 4.6V9.6H11.4" stroke-linejoin="miter"/>', theme.buttons.square),
};
type Press = keyof typeof glyph;
/** the console's more-this-way marker: a flat borderless blue triangle, faded at its base and darkening to the tip */
const arrow = (d: string, base: 0 | 1) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><linearGradient id="g" x1="0" y1="${base}" x2="0" y2="${1 - base}">` +
      `<stop offset="0" stop-color="${C.more}" stop-opacity="0"/><stop offset=".4" stop-color="${C.more}"/>` +
      `<stop offset="1" stop-color="#${new THREE.Color(C.more).multiplyScalar(0.45).getHexString()}"/></linearGradient><path d="${d}" fill="url(#g)"/></svg>`,
  );
($('up') as HTMLImageElement).src = arrow('M12 0 24 12H0Z', 1);
($('down') as HTMLImageElement).src = arrow('M0 0H24L12 12Z', 0);
const bars: Record<View, [Press, string][]> = {
  boot: [['cross', S.enter]],
  models: [['cross', S.enter], ['circle', S.back], ['triangle', S.options]],
  cases: [['cross', S.enter], ['circle', S.back], ['triangle', S.options]],
  detail: [],
  edit: [['cross', S.save], ['circle', S.back]],
  info: [['circle', S.back]],
};

/** edit's buttons follow the picked row: □ adds on the start row and moves a part; moving, they place, snap, cancel and reset it */
function editBar(): [Press, string][] {
  if (adding) return [['cross', S.add], ['circle', S.back]];
  // a turn does not show edge-on, so the edge view has no L1 R1
  if (moving)
    return [
      ['cross', S.place], ['square', moving.snap ? S.free : S.snap], ['circle', S.cancel], ['triangle', side ? S.flat : S.side],
      ...(side ? [] : ([['l1', ''], ['r1', S.turn]] as [Press, string][])),
    ];
  if (psel) return [['cross', S.save], ['square', S.move], ['circle', S.back], ['triangle', S.remove]];
  return [['cross', S.save], ...(addable().length ? [['square', S.add] as [Press, string]] : []), ['circle', S.back]];
}

const text = (id: string, s: string) => ($(id).textContent = s);
const ink$ = (tag: string, s: string, cls = '') => {
  const e = document.createElement(tag);
  e.className = 'ink' + (cls && ' ' + cls);
  e.textContent = s;
  return e;
};

type Row = [id: 'new' | 'edit' | 'copy' | 'print' | 'delete' | 'export' | 'order', label: string, ok: boolean];
/** the command list's rows and whether each can be picked; detail works on the worn design, cases on the picked one */
function rows(): Row[] {
  const has = shown().length > 0;
  if (menu === 1 && view === 'detail')
    return store.worn >= 0
      ? [['copy', S.copy, true], ['delete', S.delete, true]]
      : [['new', S.new, true], ['delete', S.delete, false]];
  if (menu === 1) return [['edit', S.edit, has], ['copy', S.copy, has], ['print', S.print, has], ['delete', S.delete, has]];
  if (menu === 2) return [['export', S.export, true], ['order', S.order, !!theme.order]];
  return [];
}

/** a part set's parts but the base, each with its op in the draft and in parts.json */
const setRows = () =>
  draft && isSet(draft.style)
    ? (setParts.get(draft.style) ?? []).filter((p) => p.op !== 'base').map((p) => ({ name: p.name, def: p.op, op: draft!.ops?.[p.name] ?? p.op }))
    : [];
/** edit's part rows: the parts on the case, joined ones then cut ones, as the list groups them; □ lists the rest */
const partRows = () => {
  const on = setRows();
  return [...on.filter((r) => r.op === 'union'), ...on.filter((r) => r.op === 'difference')];
};
/** a part file's name as a label: clipper-seat reads Clipper seat */
const partName = (n: string) => n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, ' ');
const addable = () => setRows().filter((r) => r.op === 'off' && r.def !== 'off');
/** the draft with one part on op; a part on its parts.json op keeps no entry */
function setOp(name: string, def: Op, op: Op) {
  const ops = { ...draft!.ops, [name]: op };
  if (op === def) delete ops[name];
  // a part taken off forgets its move
  if (op === 'off') setMove(name, [0, 0, 0, 0]);
  draft = { ...draft!, ops: Object.keys(ops).length ? ops : undefined };
  wear(draft);
}
/** the draft with one part placed at at; a part in its own place keeps no entry */
function setMove(name: string, at: Move) {
  const moves: Moves = { ...draft!.moves, [name]: at };
  if (!at.some(Boolean)) delete moves[name];
  draft = { ...draft!, moves: Object.keys(moves).length ? moves : undefined };
}
const moveOf = (name: string): Move => {
  const m = draft?.moves?.[name];
  return [m?.[0] ?? 0, m?.[1] ?? 0, m?.[2] ?? 0, m?.[3] ?? 0];
};
const mm = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${+Math.abs(v).toFixed(2)}`;

/** one part's solid as a geometry, for the ghost, and its box, for the move's range */
const partGeos = new Map<string, Promise<THREE.BufferGeometry>>();
function partGeo(style: string, name: string) {
  const url = `glb/${card.id}/${style}/${name}.glb`;
  if (!partGeos.has(url))
    partGeos.set(
      url,
      solid(url).then(({ pos, idx }) => {
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeBoundingBox();
        return g;
      }),
    );
  return partGeos.get(url)!;
}
/** □ on a part: its ghost over the case, free to go anywhere its middle stays over the base shell */
async function startMove(name: string) {
  const style = draft!.style;
  const [g, base] = await Promise.all([partGeo(style, name), partGeo(style, setParts.get(style)!.find((p) => p.op === 'base')!.name)]);
  if (view !== 'edit' || draft?.style !== style) return;
  const p = g.boundingBox!, b = base.boundingBox!;
  const at = moveOf(name);
  const c = p.getCenter(new THREE.Vector3()).setZ(0);
  const union = partRows().find((r) => r.name === name)?.op === 'union';
  side = false;
  moving = {
    name, from: at, at: [...at], snap: true, c, box: b, part: p, union,
    lo: [b.min.x - c.x, b.min.y - c.y, -RISE], hi: [b.max.x - c.x, b.max.y - c.y, RISE],
  };
  ghost.geometry = g;
  grid();
  placeGhost();
  paint();
}
/** the snap grid: over the shell's outline on its back face, or edge-on across y and every z the part can reach, through the shell's middle */
function grid() {
  const { box: b, part: p } = moving!;
  const v: number[] = [];
  const lines = (from: number, to: number, line: (t: number) => number[]) => {
    for (let t = Math.ceil(from / GRID) * GRID; t <= to; t += GRID) v.push(...line(t));
  };
  if (side) {
    const x = (b.min.x + b.max.x) / 2;
    const z0 = Math.min(b.min.z, p.min.z) - RISE, z1 = Math.max(b.max.z, p.max.z) + RISE;
    lines(z0, z1, (z) => [x, b.min.y, z, x, b.max.y, z]);
    lines(b.min.y, b.max.y, (y) => [x, y, z0, x, y, z1]);
  } else {
    // the back is the face nearer the camera
    caseMesh.updateWorldMatrix(true, false);
    const d = (z: number) => new THREE.Vector3(0, 0, z).applyMatrix4(caseMesh.matrixWorld).distanceTo(camera.position);
    const z = d(b.min.z) < d(b.max.z) ? b.min.z : b.max.z;
    lines(b.min.x, b.max.x, (x) => [x, b.min.y, z, x, b.max.y, z]);
    lines(b.min.y, b.max.y, (y) => [b.min.x, y, z, b.max.x, y, z]);
  }
  snapGrid.geometry.dispose();
  snapGrid.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
}
/** edit's picked part row, faint over the case where it sits, so the row and the part read as one; moving takes over from it */
let picked: { name: string; c: THREE.Vector3; box: THREE.Box3; union: boolean } | null = null;
async function showPart() {
  const r = view === 'edit' && !adding && psel ? partRows()[psel - 1] : undefined;
  const union = r?.op === 'union';
  if (!r || moving) picked = null;
  else if (picked?.name !== r.name || picked.union !== union) {
    const style = draft!.style;
    const [g, base] = await Promise.all([partGeo(style, r.name), partGeo(style, setParts.get(style)!.find((p) => p.op === 'base')!.name)]);
    if (partRows()[psel - 1]?.name !== r.name || moving || view !== 'edit') return;
    picked = { name: r.name, c: g.boundingBox!.getCenter(new THREE.Vector3()).setZ(0), box: base.boundingBox!, union };
    ghost.geometry = g;
  }
  placeGhost();
}
/** the ghost: the moving part where it will go, else the picked one where it is; added parts in the pick colour, cuts in red */
function placeGhost() {
  const s = moving ?? picked;
  ghost.visible = !!s;
  snapGrid.visible = !!moving?.snap;
  if (!s) return;
  const mat = ghost.material as THREE.MeshBasicMaterial;
  mat.color.set(s.union ? C.pick : C.del);
  mat.opacity = moving ? 0.5 : 0.3;
  ghost.matrix.copy(placing(s.c, moving?.at ?? moveOf(s.name)));
}
/** a union part's ghost cut to the case's sides, in world space, so it follows the phone; a cut part shows whole */
function clipGhost() {
  const m = moving ?? picked;
  const planes = (ghost.material as THREE.MeshBasicMaterial).clippingPlanes!;
  planes.length = 0;
  if (!m?.union) return;
  const { min, max } = m.box;
  const n = new THREE.Matrix3().getNormalMatrix(caseMesh.matrixWorld);
  for (const [nx, ny, d] of [[1, 0, -min.x], [-1, 0, max.x], [0, 1, -min.y], [0, -1, max.y]])
    planes.push(new THREE.Plane(new THREE.Vector3(nx, ny, 0), d).applyMatrix4(caseMesh.matrixWorld, n));
}
/** a shift on screen, in px with y down, as a shift in the case's x y z mm: across x and y on the back, z and y edge-on */
function toCase(px: number, py: number): number[] {
  caseMesh.updateWorldMatrix(true, false);
  const s = (v: THREE.Vector3) => {
    v.applyMatrix4(caseMesh.matrixWorld).project(camera);
    return [(v.x * innerWidth) / 2, (-v.y * innerHeight) / 2];
  };
  const [u, w] = side ? [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)] : [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
  const [o, eu, ew] = [s(new THREE.Vector3()), s(u.clone()), s(w.clone())];
  const a = eu[0] - o[0], c = eu[1] - o[1], b = ew[0] - o[0], d = ew[1] - o[1];
  const det = a * d - b * c || 1;
  const du = (d * px - b * py) / det, dw = (a * py - c * px) / det;
  return side ? [0, dw, du] : [du, dw, 0];
}
/** moves the ghost to at, snapped, kept in range and its turn within ±180°; false when it could not go there */
function shift(at: Move) {
  const m = moving!;
  const [x, y, z] = [at[0], at[1], at[3] ?? 0].map((v, i) => clamp(m.snap ? Math.round(v / GRID) * GRID : Math.round(v / FINE) * FINE, m.lo[i], m.hi[i]));
  const deg = Math.round(m.snap ? Math.round(at[2] / ANGLE) * ANGLE : at[2]);
  const q: Move = [x, y, ((((deg + 180) % 360) + 360) % 360) - 180, z];
  if (q.every((v, i) => v === m.at[i])) return false;
  m.at = q;
  placeGhost();
  return true;
}
/** L1 turns the moving part counter-clockwise on screen, R1 clockwise: one ANGLE snapped, a degree free */
function turnBy(dir: 1 | -1) {
  const m = moving!;
  // the back faces the camera mirrored, so a turn on screen is the other way round in the case's frame
  const [x, y] = toCase(1, 0), [x2, y2] = toCase(0, -1);
  const flip = Math.sign(x * y2 - y * x2) || 1;
  return shift([m.at[0], m.at[1], m.at[2] + dir * flip * (m.snap ? ANGLE : 1), m.at[3]]);
}
const opName: Record<Op, string> = { base: '', union: S.union, difference: S.difference, off: S.off };

function paint() {
  document.body.dataset.view = view;
  if (menu) document.body.dataset.menu = '';
  else delete document.body.dataset.menu;
  const p = phones[msel];
  const list = edited();
  const pages = Math.ceil(list.length / RING);
  text('brand', S.brand);
  const count = view === 'models' ? `${models.length} ${S.models}` : view === 'cases' ? `${list.length} ${S.cases}` : '';
  text('sub', count);
  text('loading', S.loading);
  if (loading) document.body.dataset.loading = '';
  else delete document.body.dataset.loading;

  let n1 = '';
  let n2 = '';
  if (view === 'boot') {
    const f = theme.front[fronts()[fsel]].icon;
    n1 = f === 'logo' ? S.title : label(f);
    n2 = f === 'logo' ? `${models.length} ${S.models}` : `${list.length} ${S.cases}`;
  } else if (view === 'models') {
    n1 = label(p.id);
  } else if (view === 'cases') {
    n1 = list.length ? designName(list[ring]) : S.noCases;
    n2 = pages > 1 ? `${label(card.id)} ${page() + 1}/${pages}` : label(card.id);
  } else if (view === 'edit') {
    n1 = editing >= 0 ? designName(store.list[editing]) : S.new;
    n2 = label(card.id);
  }
  text('n1', n1);
  text('n2', n2);

  const w = store.list[store.worn];
  text('d-maker', S.title);
  text('d-name', label(p.id));
  text('d-case', w ? `${designName(w)} ${S.case}`.toUpperCase() : '');
  text('d-size', `${p.W} × ${p.L} × ${p.T} mm`);

  const made = p.id === card.id ? list.length : 0;
  text('i-name', `${S.product} ${label(p.id)}`);
  const on = p.id === card.id && store.worn >= 0 ? designName(store.list[store.worn]) : S.bare;
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
  const row = ([id, s, ok]: Row, i: number) =>
    button(s, ok && i === cmd, () => (!ok ? sfx.cancel() : cmd === i ? press('cross') : (sfx.tick(), (cmd = i), paint())), [ok ? '' : 'off', id === 'delete' ? 'del' : ''].filter(Boolean).join(' '));
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

  // edit's rows: the start, then each part; a tap on a row picks it, ‹ › step it, as ← → do on the picked row
  const parts = $('parts');
  if (view === 'edit' && draft && adding) {
    // □'s list: a tap picks a part, a second tap adds it, as ✕ does
    const list = addable();
    parts.replaceChildren(
      li(ink$('p', list.length ? S.addTitle : S.nothing, 'title')),
      ...list.map((r, i) => {
        const b = ink$('button', `${partName(r.name)}  ${opName[r.def]}`, i === asel ? 'on' : '');
        b.onclick = () => (i === asel ? press('cross') : (sfx.tick(), (asel = i), paint()));
        return li(b);
      }),
    );
  } else if (view === 'edit' && draft) {
    const editRow = (i: number, name: string, value: string, cls = '') => {
      const on = i === psel;
      const l = document.createElement('li');
      if (cls) l.className = cls;
      const b = (s: string, click: () => void, c = '') => {
        const e = ink$('button', s, [on ? 'on' : '', c].filter(Boolean).join(' '));
        e.onclick = click;
        return e;
      };
      const pick = () => {
        if (on || moving) return;
        sfx.tick();
        psel = i;
        paint();
      };
      // moving, the picked row's ‹ › turn the part
      const step = (d: number) => () => {
        if (moving) return on && press(d < 0 ? 'l1' : 'r1');
        psel = i;
        move(d, 0);
      };
      l.append(b(name, pick, 'name'), b('‹', step(-1), 'step'), b(value, pick, 'value'), b('›', step(1), 'step'));
      return l;
    };
    // a moved part shows its shift in mm while it moves, and in the title colour after, as a changed op does
    const value = (r: { name: string; op: Op }) => {
      const at = moving?.name === r.name ? moving.at : null;
      if (!at) return opName[r.op];
      // the axes the view moves along, and z or the turn once set
      const axes = side ? ['y', 'z'] : ['x', 'y', ...(at[3] ? ['z'] : [])];
      const v = { x: at[0], y: at[1], z: at[3] ?? 0 } as Record<string, number>;
      return axes.map((a) => `${a}${mm(v[a])}`).join(' ') + (at[2] && !side ? ` ${at[2]}°` : '');
    };
    const changed = (r: { name: string; op: Op; def: Op }) => r.op !== r.def || moveOf(r.name).some(Boolean);
    // each op's rows under a heading; the headings are not rows, ↑/↓ step over them
    const heading = { union: S.joined, difference: S.cutOut } as Record<Op, string>;
    parts.replaceChildren(
      editRow(0, S.start, lookName(draft)),
      ...partRows().flatMap((r, i, all) => [
        ...(all[i - 1]?.op !== r.op ? [li(ink$('p', heading[r.op], 'group'))] : []),
        editRow(i + 1, partName(r.name), value(r), changed(r) ? 'moved' : ''),
      ]),
    );
    void showPart();
  } else parts.replaceChildren();

  const bar = $('bar');
  const keys: [Press, string][] =
    menu === 4 ? [] : menu ? [['cross', S.enter], ['circle', S.back]] : view === 'edit' ? editBar() : view === 'cases' && !list.length ? [['cross', S.enter], ['circle', S.back]] : bars[view];
  bar.classList.toggle('dense', keys.length > 4);
  bar.replaceChildren(
    ...keys.map(([k, s]) => {
      const b = document.createElement('button');
      const img = document.createElement('img');
      img.className = 'px';
      img.src = glyph[k];
      img.alt = '';
      b.append(img);
      if (s) b.append(ink$('span', s));
      else b.className = 'pair';
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

/** seconds between one icon popping in and the next */
const STAGGER = 0.14;
/** the cases page; its designs pop in one by one after delay seconds */
function openCases(delay: number) {
  view = 'cases';
  menu = 0;
  ring = clamp(ring, 0, Math.max(shown().length - 1, 0));
  turn = ring - page() * RING;
  const now = clock();
  shown().forEach((it, j) => {
    it.pos.copy(ringTarget(it, j).pos);
    it.born = now + delay + (j % RING) * STAGGER;
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
      // the rows in view come in one by one; the rest land with the last of them
      let k = 0;
      models.forEach((it, j) => {
        const t = gridTarget(j);
        it.pos.copy(t.pos);
        it.born = now + 0.35 + (t.opacity > 0 ? k++ : k) * STAGGER;
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
  store.worn = i;
  wear(t);
  menu = 4;
  sfx.print();
  printAt = clock();
  const file = `iphone-${card.id}-${designName(t).toLowerCase().replace(/\s+/g, '-')}.stl`;
  caseOf(t).then((g) => exportStl(g, file));
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
  location.href = `mailto:${theme.order}?subject=${encodeURIComponent(`${label(card.id)} ${designName(t)} ${S.case}`)}`;
}

/** Delete: that design only */
function remove() {
  const i = tpl();
  const t = store.list[i];
  if (!t) return;
  store.list.splice(i, 1);
  if (store.worn === i) store.worn = -1;
  else if (store.worn > i) store.worn--;
  dropItem(t);
  saveTemplates(store);
  menu = 0;
  ring = clamp(ring, 0, Math.max(shown().length - 1, 0));
  turn = ring - page() * RING;
}

/** edit opens on a copy of look; ✕ saves it over design at, or as a new design when at is -1 */
function startEdit(look: Look, at: number) {
  back = view === 'detail' ? 'detail' : 'cases';
  draft = copyLook(look);
  editing = at;
  psel = 0;
  adding = false;
  moving = null;
  placeGhost();
  menu = 0;
  view = 'edit';
  wear(draft);
}

/** a key while the command list is open */
function command(k: Press) {
  if (menu === 4) return;
  if (k === 'circle') {
    sfx.cancel();
    // back one level, the cursor on the row that opened it
    cmd = menu === 1 ? 0 : opener;
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
      cmd = 0;
    } else {
      sfx.cancel();
      menu = 1;
      cmd = opener;
    }
    return paint();
  }
  const r = rows()[cmd];
  if (!r?.[2]) return sfx.cancel();
  sfx.confirm();
  const i = view === 'detail' ? store.worn : tpl();
  const t = store.list[i];
  if (r[0] === 'new') startEdit(starts[0].look, -1);
  else if (r[0] === 'edit') startEdit(t, i);
  else if (r[0] === 'copy') startEdit(t, -1);
  else if (r[0] === 'print' && !theme.order) print();
  else if (r[0] === 'print' || r[0] === 'delete') {
    opener = cmd;
    menu = r[0] === 'print' ? 2 : 3;
    cmd = 0;
    yes = false;
  } else if (r[0] === 'export') print();
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
    // detail's rows work on the worn design
    ring = Math.max(edited().indexOf(store.list[store.worn]), 0);
  } else if (view === 'detail') return command(k);
  else if (view === 'cases') {
    if (menu) return command(k);
    if (k === 'circle') {
      if (from === 'boot') return leave();
      sfx.cancel();
      view = 'models';
      follow();
    } else if (k === 'triangle') {
      if (!shown().length) return sfx.cancel();
      sfx.confirm();
      menu = 1;
      cmd = 0;
    } else if (k === 'cross') {
      // ✕ puts the picked design on the phone; on the bare phone it opens the model's detail, where New is
      const i = tpl();
      sfx.confirm();
      store.worn = i;
      saveTemplates(store);
      wear(store.list[i]);
      if (i < 0) {
        view = 'detail';
        menu = 1;
        cmd = 0;
      }
    }
  } else if (view === 'edit') {
    if (!draft) return;
    // □'s list: ✕ adds the picked part on its parts.json op, ○ shuts the list
    if (adding) {
      const r = addable()[asel];
      if (k === 'cross' && r) {
        sfx.confirm();
        setOp(r.name, r.def, r.def);
        psel = partRows().findIndex((x) => x.name === r.name) + 1;
      } else if (k === 'circle') sfx.cancel();
      else return;
      adding = false;
      return paint();
    }
    // moving: ✕ places the part and solves, □ swaps grid and free, ○ puts it back, △ sends it home
    if (moving) {
      const m = moving;
      if (k === 'cross') {
        sfx.confirm();
        moving = null;
        if (m.at.some((v, i) => v !== m.from[i])) {
          setMove(m.name, m.at);
          wear(draft);
        }
      } else if (k === 'square') {
        sfx.tick();
        m.snap = !m.snap;
        if (m.snap) shift(m.at);
      } else if (k === 'circle') {
        sfx.cancel();
        moving = null;
      } else if (k === 'triangle') {
        sfx.tick();
        side = !side;
        grid();
      } else if (k === 'l1' || k === 'r1') {
        if (side) return sfx.cancel();
        if (!turnBy(k === 'l1' ? 1 : -1)) return sfx.cancel();
        sfx.tick();
      }
      placeGhost();
      return paint();
    }
    if (k === 'square' && psel) {
      sfx.confirm();
      return void startMove(partRows()[psel - 1].name);
    }
    if (k === 'square') {
      if (!addable().length) return sfx.cancel();
      sfx.confirm();
      adding = true;
      asel = 0;
      return paint();
    }
    // △ takes the picked part off
    if (k === 'triangle') {
      const r = partRows()[psel - 1];
      if (!r) return sfx.cancel();
      sfx.cancel();
      setOp(r.name, r.def, 'off');
      psel = Math.min(psel, partRows().length);
      return paint();
    }
    if (k === 'cross') {
      sfx.confirm();
      const old = store.list[editing];
      const t: Template = { ...old, style: draft.style, ops: draft.ops, moves: draft.moves, edited: new Date().toISOString() };
      if (old && !sameLook(old, t)) delete t.printed;
      if (old) {
        dropItem(old);
        store.list[editing] = t;
      } else store.list.push(t);
      store.worn = store.list.indexOf(t);
      ring = edited().indexOf(t);
    } else if (k === 'circle') {
      sfx.cancel();
      wear(store.list[store.worn]);
    } else return;
    draft = null;
    moving = null;
    placeGhost();
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
    // ↑/↓ pick a row; ← → on the start row change the start, on a part step its op; in □'s list ↑/↓ pick a part
    // moving, the arrows step the part one grid line, or a fine step when free, the way they point on screen
    if (!draft) return;
    const parts = partRows();
    if (moving) {
      const v = toCase(dx, dy);
      const big = Math.max(...v.map(Math.abs));
      const step = moving.snap ? GRID : FINE;
      const d = v.map((t) => (Math.abs(t) > big / 2 ? Math.sign(t) * step : 0));
      const a = moving.at;
      if (!shift([a[0] + d[0], a[1] + d[1], a[2], (a[3] ?? 0) + d[2]])) return sfx.cancel();
    } else if (adding) {
      const n = clamp(asel + dy, 0, addable().length - 1);
      if (!dy || n === asel) return;
      asel = n;
    } else if (dy) {
      const n = clamp(psel + dy, 0, parts.length);
      if (n === psel) return;
      psel = n;
    } else if (!psel) {
      if (starts.length < 2) return;
      let at = starts.findIndex((s) => sameLook(s.look, draft!));
      // a changed draft steps from its style's own start, not its Base
      if (at < 0) at = starts.findIndex((s) => s.look.style === draft!.style && !s.look.ops);
      draft = copyLook(starts[(at + dx + starts.length) % starts.length].look);
      wear(draft);
    } else {
      const r = parts[psel - 1];
      setOp(r.name, r.def, STEPS[(STEPS.indexOf(r.op) + dx + STEPS.length) % STEPS.length]);
      // the row changes group; the pick goes with it
      psel = partRows().findIndex((x) => x.name === r.name) + 1;
    }
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
    s: () => press('square'),
    q: () => press('l1'),
    e: () => press('r1'),
    m: sfx.toggleMute,
    r: () => {
      if (view !== 'edit' || !moving) return;
      if (!shift([0, 0, 0, 0])) return sfx.cancel();
      sfx.tick();
      placeGhost();
      paint();
    },
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
// on the cases and detail pages a touch holds the phone and a drag turns and tips it, let go mid-swipe and it flings on
const ray = new THREE.Raycaster();
const canvas = $('view');
/** radians per pixel dragged across the open phone */
const TURN = 0.012;
let down: { x: number; y: number; camV: number; last: number; lastY: number; t: number; v: number; from?: Move } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, camV, last: e.clientX, lastY: e.clientY, t: e.timeStamp, v: 0 };
  if ((view === 'cases' || view === 'detail') && menu < 2) {
    grab = true;
    fling = 0;
  }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  if (moving && view === 'edit') {
    // a drag carries the ghost from where the touch found it
    const [x, y, z] = toCase(e.clientX - down.x, e.clientY - down.y);
    const f = (down.from ??= [...moving.at]);
    shift([f[0] + x, f[1] + y, moving.at[2], (f[3] ?? 0) + z]);
    paint();
  } else if (view === 'models') {
    const { min, max } = camLimits();
    camV = clamp(down.camV + ((e.clientY - down.y) / innerHeight) * 2 * dist * T, min, max);
  } else if (grab) {
    const dx = (e.clientX - down.last) * TURN;
    fit.spin += dx;
    fit.tilt = clamp(fit.tilt + (e.clientY - down.lastY) * TURN, -0.7, 0.7);
    down.v = dx / Math.max((e.timeStamp - down.t) / 1000, 1e-3);
    down.last = e.clientX;
    down.lastY = e.clientY;
    down.t = e.timeStamp;
  }
});
canvas.addEventListener('pointercancel', () => {
  down = null;
  grab = false;
});
canvas.addEventListener('pointerup', (e) => {
  const d = down;
  down = null;
  if (!d) return;
  if (grab) {
    grab = false;
    // a swipe still moving at release carries on, a held stop does not
    if (e.timeStamp - d.t < 80) fling = clamp(d.v - theme.spin, -30, 30);
  }
  const dx = e.clientX - d.x;
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

if (import.meta.env.DEV)
  picker(
    () => (menu ? `${view} menu ${menu}` : view),
    (x, y) => {
      const named: [Item, string][] = [
        ...models.map((it, i): [Item, string] => [it, `model ${phones[i].id}`]),
        ...front.map((it, i): [Item, string] => [it, `front ${theme.front[i].icon}`]),
        ...[...items].map(([t, it]): [Item, string] => [it, `case ${designName(t)}`]),
      ].filter(([it]) => it.holder.visible && it.opacity > 0.05);
      ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
      const hit = ray.intersectObjects(named.map(([it]) => it.holder), true)[0];
      let o = hit?.object;
      while (o?.parent && o.parent !== scene) o = o.parent;
      const n = named.find(([it]) => it.holder === o);
      return n ? { name: `${n[1]} (3D)`, rect: screenRect(n[0].holder, camera) } : null;
    },
  );

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
