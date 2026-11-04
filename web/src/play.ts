// the playground: a print bed and blocks melted into one part, worked like a game; main.ts hands it the keys, the frame and the hud while view is 'play'
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import theme from '../themes/memcard.json';
import { dropImport, exportStl, FEATURED, featuredPiece, featuredSolid, IMPORT, keepImport, loadMy, MY, partSolid, pieceMatrix, saveMy, type Piece, type Shape } from './cases';
import * as sfx from './sound';

export type Key = 'a' | 'b' | 'y' | 'x' | 'l' | 'r' | 'zl' | 'zr';
/** the d-pad, drawn in the bar where it steps the held piece */
export type Dir = 'left' | 'right' | 'up' | 'down';
type Deps = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  paint: () => void;
  leave: () => void;
  ink: (tag: string, s: string, cls?: string) => HTMLElement;
};

const S = theme.strings;
const C = theme.colors;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const MM = 0.01; // main.ts's scene unit is 100 mm
const DIST = 7; // the bed's distance from the camera
// mm, solder's build volume: printer.cfg stepper_x and stepper_y position_max 235, stepper_z 200
const BED = 235;
const HEIGHT = 200;
const GRID = 1; // mm one move or size step
const SNAP = 2; // mm a moving piece's middle jumps onto another's, or the bed's
const ANGLE = 15; // degrees one turn
const BLEND = 0.5; // mm one blend step
const TOOLS = ['move', 'turn', 'size', 'blend'] as const;
const SHAPES: Shape[] = ['box', 'cylinder', 'sphere', 'cone', 'torus'];
const SIZES: Record<Shape, number[]> = { box: [20, 20, 20], cylinder: [20, 20, 30], sphere: [24, 24, 24], cone: [24, 24, 30], torus: [36, 36, 12] };
// the keyboard naming uses; the last row's words are keys of their own
const KEYS = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ0123', '456789-'].map((r) => [...r]);
KEYS[3].push(S.space, S.del, S.ok);
const NAME = 24; // characters a name may have

/** cells live, and on save and export: about 1 mm, then 0.2 to 0.3 mm as the part grows */
const liveEdge = (n: number) => Math.max(1, n / 100);
const fineEdge = (n: number) => clamp(n / 350, 0.2, 0.3);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'part';

// the unit shapes the worker's field draws, filling [-1, 1]; three's cylinder and cone stand on y, turned onto z
const UNIT: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(2, 2, 2),
  sphere: new THREE.SphereGeometry(1, 32, 16),
  cylinder: new THREE.CylinderGeometry(1, 1, 2, 40).rotateX(Math.PI / 2),
  cone: new THREE.ConeGeometry(1, 2, 40).rotateX(Math.PI / 2),
  torus: new THREE.TorusGeometry(0.7, 0.3, 16, 48).scale(1, 1, 1 / 0.3),
};
for (const g of Object.values(UNIT)) g.computeBoundingBox();
/** an stl piece's mesh, centred as it was kept */
const stlGeos = new Map<string, Promise<THREE.BufferGeometry>>();
function stlGeo(ref: string) {
  if (!stlGeos.has(ref))
    stlGeos.set(
      ref,
      partSolid('', ref).then(({ pos, idx }) => {
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeVertexNormals();
        g.computeBoundingBox();
        return g;
      }),
    );
  return stlGeos.get(ref)!;
}

type Bench = { name: string; pieces: Piece[] };
const BENCH = 'case.bench';
const copy = (p: Piece): Piece => ({ ...p, pos: [...p.pos], rot: [...p.rot], size: [...p.size] });
function loadBench(): Bench {
  try {
    const b = JSON.parse(localStorage.getItem(BENCH) ?? 'null');
    if (b && Array.isArray(b.pieces)) return b;
  } catch {
    // unreadable storage starts an empty bench
  }
  return { name: '', pieces: [] };
}

type Mesh = { pos: Float32Array<ArrayBuffer>; idx: Uint32Array<ArrayBuffer> };
type Job = { pieces: Piece[]; edge: number; live: boolean; ok: (m: Mesh) => void; no: (e: Error) => void };

export function playground(d: Deps) {
  let bench = loadBench();
  const save = () => localStorage.setItem(BENCH, JSON.stringify(bench));
  let mode: 'browse' | 'palette' | 'held' | 'name' | 'shelf' = 'browse';
  let sel = 0; // browse: the pieces, then the actions
  let row = 0; // palette and shelf
  let key = [0, 0]; // name: the keyboard's column and row
  let typed = '';
  let oops = false; // the last import was no closed solid; the title says so until the next key
  /** the piece in hand: its index, how it was, the tool, mm it floats over what is under it, and the middle it last snapped to */
  let held: { i: number; from: Piece | null; tool: number; lift: number; snapped: string } | null = null;
  const aim = { yaw: -0.6, tilt: 0.65 }; // where a drag or the right stick turns the bed; orbit eases to it
  const orbit = { ...aim };
  let shown = false;
  let squashAt = -1;
  let popAt = -1;
  let now = 0;

  // the bed: a dark plate with a 10 mm grid from its middle, the build volume's outline, the solved part on it, and a ghost per piece; all on layer 1, the full-resolution renderer
  const pivot = new THREE.Group();
  const world = new THREE.Group();
  world.rotation.x = -Math.PI / 2;
  world.scale.setScalar(MM);
  // the view turns about the volume's middle, not the bed's
  world.position.y = (-HEIGHT / 2) * MM;
  pivot.add(world);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(BED, BED), new THREE.MeshStandardMaterial({ color: theme.finish.body, roughness: 0.8 }));
  plate.position.z = -0.05;
  const lines: number[] = [];
  for (let t = -Math.floor(BED / 20) * 10; t <= BED / 2; t += 10) lines.push(t, -BED / 2, 0, t, BED / 2, 0, -BED / 2, t, 0, BED / 2, t, 0);
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)),
    new THREE.LineBasicMaterial({ color: C.dim, transparent: true, opacity: 0.6 }),
  );
  const volume = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BED, BED, HEIGHT)), grid.material);
  volume.position.z = HEIGHT / 2;
  const body = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: theme.case.color, roughness: 0.45 }));
  world.add(plate, grid, volume, body);
  const ghosts: THREE.Mesh[] = [];
  const ghostMat = () =>
    new THREE.MeshStandardMaterial({ color: C.pick, emissive: C.pick, emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 0.4, depthWrite: false });
  pivot.traverse((o) => o.layers.set(1));
  pivot.visible = false;
  d.scene.add(pivot);

  /** a piece's ghost: its shape, sized and placed; an stl piece's waits for its mesh */
  function ghostOf(i: number) {
    const p = bench.pieces[i];
    while (ghosts.length <= i) {
      const g = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat());
      g.matrixAutoUpdate = false;
      g.layers.set(1);
      world.add(g);
      ghosts.push(g);
    }
    const g = ghosts[i];
    if (p.kind !== 'stl') g.geometry = UNIT[p.kind];
    else if (g.userData.ref !== p.ref) {
      g.geometry = new THREE.BufferGeometry();
      stlGeo(p.ref!).then((s) => bench.pieces[i]?.ref === p.ref && (g.geometry = s), () => {});
    }
    g.userData.ref = p.ref;
    const n = native(p, g.geometry);
    g.matrix.copy(pieceMatrix(p).scale(new THREE.Vector3(p.size[0] / n[0], p.size[1] / n[1], p.size[2] / n[2])));
    g.matrixWorldNeedsUpdate = true;
    return g;
  }
  /** the size of a piece's drawn geometry before scaling */
  const native = (p: Piece, g: THREE.BufferGeometry) => {
    if (p.kind !== 'stl') return [2, 2, 2];
    const b = g.boundingBox;
    return b ? b.getSize(new THREE.Vector3()).toArray().map((v) => v || 1) : p.size;
  };
  const syncGhosts = () => {
    bench.pieces.forEach((_, i) => ghostOf(i));
    for (const g of ghosts.splice(bench.pieces.length)) world.remove(g);
  };

  // one solve at a time; a newer live job replaces a queued live one, a fine one always runs
  const worker = new Worker(new URL('./sdf.worker.ts', import.meta.url), { type: 'module' });
  const queue: Job[] = [];
  let running: Job | null = null;
  const pump = () => {
    if (running || !queue.length) return;
    running = queue.shift()!;
    worker.postMessage({ pieces: running.pieces, edge: running.edge });
    d.paint();
  };
  worker.onmessage = (e: MessageEvent<Mesh & { error?: string }>) => {
    const j = running!;
    running = null;
    if (e.data.error) j.no(new Error(e.data.error));
    else j.ok(e.data);
    pump();
    d.paint();
  };
  const extent = (ps: Piece[]) => Math.max(1, ...ps.map((p) => Math.max(...p.size)));
  function solveWith(pieces: Piece[], live: boolean) {
    return new Promise<Mesh>((ok, no) => {
      for (const j of queue.filter((j) => live && j.live)) {
        queue.splice(queue.indexOf(j), 1);
        j.no(new Error('superseded'));
      }
      queue.push({ pieces: pieces.map(copy), edge: (live ? liveEdge : fineEdge)(extent(pieces)), live, ok, no });
      pump();
    });
  }
  const geometry = ({ pos, idx }: Mesh) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)).setIndex(new THREE.BufferAttribute(idx, 1));
    return toCreasedNormals(g, Math.PI / 6);
  };
  /** the bench solved live onto the bed; it pops when it lands */
  function solve() {
    save();
    if (!bench.pieces.length) {
      body.geometry = new THREE.BufferGeometry();
      return;
    }
    solveWith(bench.pieces, true).then(
      (m) => {
        body.geometry.dispose();
        body.geometry = geometry(m);
        popAt = now;
      },
      () => {},
    );
  }

  /** the highest surface under x y: the other join pieces' ghosts, else the bed */
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  function surface(x: number, y: number, skip: number) {
    world.updateMatrixWorld(true);
    const o = world.localToWorld(new THREE.Vector3(x, y, 1000));
    ray.set(o, world.localToWorld(new THREE.Vector3(x, y, 0)).sub(o).normalize());
    const hit = ray.intersectObjects(ghosts.filter((g, i) => i !== skip && bench.pieces[i]?.op === 'join'), false)[0];
    return hit ? Math.max(world.worldToLocal(hit.point.clone()).z, 0) : 0;
  }
  /** mm from a piece's middle down to its lowest point, as turned */
  function under(i: number) {
    const g = ghostOf(i);
    const b = g.geometry.boundingBox;
    return b ? bench.pieces[i].pos[2] - b.clone().applyMatrix4(g.matrix).min.z : bench.pieces[i].size[2] / 2;
  }
  /** the held piece sat on whatever is under its middle, lift above it */
  function ride() {
    const h = held!, p = bench.pieces[h.i];
    p.pos[2] = Math.round((surface(p.pos[0], p.pos[1], h.i) + under(h.i) + h.lift) * 100) / 100;
    ghostOf(h.i);
  }
  const rumble = () =>
    navigator.getGamepads?.().find((g) => g?.connected)?.vibrationActuator?.playEffect('dual-rumble', { duration: 45, strongMagnitude: 0.15, weakMagnitude: 0.5 }).catch(() => {});

  /** a piece in hand from i; from is how it was, null for one just added, which B takes off again */
  function grab(i: number, from: Piece | null) {
    sel = i;
    held = { i, from, tool: 0, lift: 0, snapped: '' };
    const p = bench.pieces[i];
    held.lift = Math.max(p.pos[2] - under(i) - surface(p.pos[0], p.pos[1], i), 0);
    mode = 'held';
  }
  function add(p: Piece) {
    bench.pieces.push(p);
    syncGhosts();
    grab(bench.pieces.length - 1, null);
    held!.lift = 0;
    ride();
    solve();
  }
  const fresh = (kind: Shape): Piece => ({ kind, pos: [0, 0, 0], rot: [0, 0, 0], size: [...SIZES[kind]], op: 'join', blend: 2 });

  /** Import STL: the file welded and centred, kept in IndexedDB and tried alone; one that is no closed solid goes again */
  const file = Object.assign(document.createElement('input'), { type: 'file', accept: '.stl', hidden: true });
  document.body.append(file);
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f || !shown) return;
    const ref = `${IMPORT}${slug(f.name.replace(/\.stl$/i, ''))}-${Date.now().toString(36)}`;
    try {
      const g = mergeVertices(new THREE.BufferGeometry().setAttribute('position', new STLLoader().parse(await f.arrayBuffer()).getAttribute('position')));
      g.computeBoundingBox();
      const b = g.boundingBox!;
      if (!g.index || ![...b.min.toArray(), ...b.max.toArray()].every(isFinite)) throw new Error('empty');
      g.center();
      await keepImport(ref, { pos: Float32Array.from(g.getAttribute('position').array), idx: Uint32Array.from(g.index.array) });
      const size = b.getSize(new THREE.Vector3()).toArray();
      const p: Piece = { kind: 'stl', ref, pos: [0, 0, 0], rot: [0, 0, 0], size, op: 'join', blend: 0 };
      await solveWith([p], true).catch((e) => {
        if (e.message !== 'superseded') throw e;
      });
      mode = 'browse';
      add(p);
      sfx.confirm();
    } catch {
      dropImport(ref).catch(() => {});
      oops = true;
      sfx.cancel();
    }
    d.paint();
  };

  /** Save part: solved fine, the mesh kept under my:<name> and the recipe beside it; a name saved before is replaced, one version on */
  async function savePart(name: string) {
    const ref = MY + slug(name);
    bench.name = name;
    save();
    const m = await solveWith(bench.pieces, false);
    await keepImport(ref, m);
    const my = loadMy();
    saveMy({ ...my, [ref]: { name, version: (my[ref]?.version ?? 0) + 1, pieces: bench.pieces.map(copy) } });
  }

  type Act = 'shapes' | 'import' | 'save' | 'shelf' | 'export';
  const ACTS: Act[] = ['shapes', 'import', 'save', 'shelf', 'export'];
  const actName: Record<Act, string> = { shapes: S.shapes, import: S.importStl, save: S.savePart, shelf: S.shelf, export: S.exportStl };
  const rowsN = () => bench.pieces.length + ACTS.length;
  const actOf = (i: number): Act | undefined => ACTS[i - bench.pieces.length];
  const shelf = () => Object.entries(loadMy());
  const pieceName = (p: Piece, i: number) =>
    p.kind === 'stl' ? (FEATURED.find((f) => IMPORT + f.slug === p.ref)?.name ?? p.ref!.slice(IMPORT.length).replace(/-[a-z0-9]+$/, '')) : `${S[p.kind]} ${i + 1}`;

  /** a step on the held piece: d-pad dx dy, or dz from L2 R2, by the tool */
  function nudge(dx: number, dy: number, dz: number) {
    const h = held!, p = bench.pieces[h.i];
    const tool = TOOLS[h.tool];
    if (dz && tool !== 'size') {
      const l = clamp(Math.round(h.lift + dz * GRID), 0, HEIGHT);
      if (l === h.lift) return false;
      h.lift = l;
    } else if (tool === 'blend') {
      const b = clamp(p.blend + (dx - dy) * BLEND, 0, 20);
      if (b === p.blend) return false;
      p.blend = b;
    }
    else if (tool === 'move') {
      // the d-pad pushes along the bed's axis nearest the way it points on screen
      const c = Math.cos(orbit.yaw), s = Math.sin(orbit.yaw);
      const vx = dx * c - dy * s, vy = -dx * s - dy * c;
      const along = Math.abs(vx) >= Math.abs(vy) ? [Math.sign(vx), 0] : [0, Math.sign(vy)];
      const was = [p.pos[0], p.pos[1]];
      const to = [clamp(Math.round(was[0] + along[0] * GRID), -BED / 2, BED / 2), clamp(Math.round(was[1] + along[1] * GRID), -BED / 2, BED / 2)];
      // a middle ahead within SNAP pulls the piece onto it; one behind lets it go
      const mids = [[0, 0], ...bench.pieces.filter((_, i) => i !== h.i).map((q) => q.pos)];
      const m = mids.find(([x, y]) => Math.hypot(x - to[0], y - to[1]) <= SNAP && (x - was[0]) * along[0] + (y - was[1]) * along[1] > 0);
      const snapped = m ? `${m[0]},${m[1]}` : '';
      if (m) [to[0], to[1]] = [m[0], m[1]];
      if (snapped && snapped !== h.snapped) {
        sfx.tick();
        rumble();
      }
      h.snapped = snapped;
      if (to[0] === was[0] && to[1] === was[1]) return false;
      [p.pos[0], p.pos[1]] = to;
    } else if (tool === 'turn') {
      // ← → roll about y, ↑ ↓ tip about x
      if (dx) p.rot[1] = wrap(p.rot[1] + dx * ANGLE);
      if (dy) p.rot[0] = wrap(p.rot[0] + dy * ANGLE);
    } else {
      const s = [...p.size];
      p.size[0] = clamp(p.size[0] + dx * GRID, 1, BED);
      p.size[1] = clamp(p.size[1] - dy * GRID, 1, BED);
      p.size[2] = clamp(p.size[2] + dz * GRID, 1, HEIGHT);
      if (s.every((v, i) => v === p.size[i])) return false;
    }
    ride();
    solve();
    return true;
  }
  const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

  function press(k: Key) {
    oops = false;
    if (mode === 'held') {
      const h = held!, p = bench.pieces[h.i];
      if (k === 'a') {
        sfx.confirm();
        held = null;
        mode = 'browse';
        squashAt = now;
      } else if (k === 'b') {
        sfx.cancel();
        if (h.from) bench.pieces[h.i] = h.from;
        else bench.pieces.splice(h.i, 1);
        sel = clamp(sel, 0, rowsN() - 1);
        held = null;
        mode = 'browse';
        syncGhosts();
        solve();
      } else if (k === 'y') {
        sfx.tick();
        h.tool = (h.tool + 1) % TOOLS.length;
      } else if (k === 'x') {
        sfx.tick();
        p.op = p.op === 'join' ? 'cut' : 'join';
        solve();
      } else if (k === 'l' || k === 'r') {
        sfx.tick();
        p.rot[2] = wrap(p.rot[2] + (k === 'l' ? ANGLE : -ANGLE));
        ride();
        solve();
      } else if (!nudge(0, 0, k === 'zr' ? 1 : -1)) return sfx.cancel();
      else sfx.tick();
    } else if (mode === 'palette') {
      if (k === 'a') {
        sfx.confirm();
        const f = FEATURED[row - SHAPES.length];
        if (row < SHAPES.length) add(fresh(SHAPES[row]));
        else if (f) {
          mode = 'browse';
          featuredSolid(f.slug).then(
            (s) => (add(featuredPiece(f.slug, s)), d.paint()),
            () => ((oops = true), sfx.cancel(), d.paint()),
          );
        } else {
          mode = 'browse';
          file.click();
        }
      } else if (k === 'b') {
        sfx.cancel();
        mode = 'browse';
      } else return;
    } else if (mode === 'shelf') {
      const s = shelf()[row];
      if (k === 'b') {
        sfx.cancel();
        mode = 'browse';
      } else if (k === 'a' && s) {
        sfx.confirm();
        bench = { name: s[1].name, pieces: s[1].pieces.map(copy) };
        sel = 0;
        mode = 'browse';
        syncGhosts();
        solve();
      } else if (k === 'x' && s) {
        sfx.cancel();
        const my = loadMy();
        delete my[s[0]];
        saveMy(my);
        dropImport(s[0]).catch(() => {});
        row = clamp(row, 0, shelf().length - 1);
      } else return;
    } else if (mode === 'name') {
      if (k === 'b') {
        sfx.cancel();
        mode = 'browse';
      } else if (k === 'x') type('Backspace');
      else if (k === 'y') type(' ');
      else if (k === 'a') {
        const c = KEYS[key[1]][key[0]];
        type(c === S.space ? ' ' : c === S.del ? 'Backspace' : c === S.ok ? 'Enter' : c);
      }
      return d.paint();
    } else {
      const p = bench.pieces[sel];
      if (k === 'b') return d.leave();
      if (k === 'y') {
        sfx.confirm();
        mode = 'palette';
        row = 0;
      } else if (k === 'a' && p) {
        sfx.confirm();
        grab(sel, copy(p));
      } else if (k === 'a') {
        const a = actOf(sel)!;
        if (a !== 'import' && a !== 'shapes' && a !== 'shelf' && !bench.pieces.length) return sfx.cancel();
        sfx.confirm();
        if (a === 'shapes') (mode = 'palette'), (row = 0);
        else if (a === 'import') file.click();
        else if (a === 'shelf') (mode = 'shelf'), (row = 0);
        else if (a === 'save') {
          mode = 'name';
          typed = bench.name.slice(0, NAME);
          key = [KEYS[3].length - 1, 3];
        } else
          void solveWith(bench.pieces, false).then(
            (m) => exportStl(geometry(m), `${slug(bench.name)}.stl`),
            () => sfx.cancel(),
          );
      } else if (k === 'x' && p) {
        sfx.cancel();
        bench.pieces.splice(sel, 1);
        sel = clamp(sel, 0, rowsN() - 1);
        syncGhosts();
        solve();
      } else if (k === 'l' && p) {
        // a copy in hand where the piece stands
        sfx.confirm();
        bench.pieces.push(copy(p));
        syncGhosts();
        grab(bench.pieces.length - 1, null);
        solve();
      } else if (k === 'r' && p) {
        // a copy mirrored across the bed's middle line
        if (!p.pos[0] && !p.rot[1] && !p.rot[2]) return sfx.cancel();
        sfx.confirm();
        const q = copy(p);
        q.pos[0] = -q.pos[0];
        q.rot = [q.rot[0], -q.rot[1], -q.rot[2]];
        bench.pieces.push(q);
        sel = bench.pieces.length - 1;
        syncGhosts();
        solve();
      } else return;
    }
    d.paint();
  }

  function move(dx: number, dy: number) {
    oops = false;
    if (mode === 'held') {
      if (!nudge(dx, dy, 0)) return;
    } else if (mode === 'name') {
      const y = clamp(key[1] + dy, 0, KEYS.length - 1);
      key = [clamp(key[0] + dx, 0, KEYS[y].length - 1), y];
    } else if (mode === 'palette' || mode === 'shelf') {
      const n = clamp(row + dy, 0, (mode === 'palette' ? SHAPES.length + FEATURED.length + 1 : shelf().length) - 1);
      if (!dy || n === row) return;
      row = n;
    } else if (dy) {
      const n = clamp(sel + dy, 0, rowsN() - 1);
      if (n === sel) return;
      sel = n;
    } else {
      // ← → on a piece swaps join and cut
      const p = bench.pieces[sel];
      if (!p) return;
      p.op = p.op === 'join' ? 'cut' : 'join';
      solve();
    }
    sfx.tick();
    d.paint();
  }

  /** a key typed while naming; true when it was taken */
  function type(k: string) {
    if (mode !== 'name') return false;
    if (k === 'Escape') return press('b'), true;
    if (k === 'Backspace') {
      if (!typed) return sfx.cancel(), true;
      typed = typed.slice(0, -1);
      sfx.tick();
    } else if (k === 'Enter') {
      const name = typed.trim();
      if (!name) return sfx.cancel(), true;
      sfx.confirm();
      mode = 'browse';
      void savePart(name).then(d.paint, () => sfx.cancel());
    } else if (/^[a-z0-9\- ]$/i.test(k) && typed.length < NAME) {
      typed += k.toUpperCase();
      sfx.tick();
    } else return false;
    d.paint();
    return true;
  }

  function drag(dx: number, dy: number) {
    aim.yaw += dx * 0.01;
    aim.tilt = clamp(aim.tilt + dy * 0.01, 0.05, 1.45);
  }

  function frame(dt: number, t: number) {
    now = t;
    if (!shown) return;
    const k = 1 - Math.exp(-8 * dt);
    orbit.yaw += (aim.yaw - orbit.yaw) * k;
    orbit.tilt += (aim.tilt - orbit.tilt) * k;
    // landscape keeps the bed left of the list, as edit keeps its phone
    const pt = d.camera.aspect < 1;
    const h = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(d.camera.fov / 2));
    pivot.position.copy(d.camera.position).add(new THREE.Vector3(pt ? 0 : -0.2 * h * d.camera.aspect, pt ? 0.14 * h : 0, -DIST));
    pivot.rotation.set(orbit.tilt, orbit.yaw, 0);
    pivot.scale.setScalar(pt ? 0.8 : 1);
    // the part pops when a solve lands
    const pop = popAt >= 0 ? clamp((t - popAt) / 0.25, 0, 1) : 1;
    body.scale.setScalar(1 + 0.035 * Math.sin(Math.PI * pop));
    // the held piece's ghost shows strong, the picked one faint; a cut in red; a drop squashes it
    const sq = squashAt >= 0 ? clamp((t - squashAt) / 0.22, 0, 1) : 1;
    const wob = Math.sin(Math.PI * sq);
    ghosts.forEach((g, i) => {
      const p = bench.pieces[i];
      const on = held ? held.i === i : mode === 'browse' && sel === i;
      g.visible = on;
      if (!on || !p) return;
      const m = g.material as THREE.MeshStandardMaterial;
      m.color.set(p.op === 'cut' ? C.del : C.pick);
      m.emissive.copy(m.color);
      m.opacity = held ? 0.55 : 0.28;
      // under places the ghost; the squash goes on after, about the piece's foot
      const foot = p.pos[2] - under(i);
      if (!held && wob)
        g.matrix
          .premultiply(new THREE.Matrix4().makeTranslation(0, 0, -foot))
          .premultiply(new THREE.Matrix4().makeScale(1 + 0.08 * wob, 1 + 0.08 * wob, 1 - 0.15 * wob))
          .premultiply(new THREE.Matrix4().makeTranslation(0, 0, foot));
    });
  }

  function rows(): [HTMLElement, boolean][] {
    const li = (e: HTMLElement, cls = '') => {
      const l = document.createElement('li');
      if (cls) l.className = cls;
      l.append(e);
      return l;
    };
    const button = (s: string, on: boolean, click: () => void, cls = '') => {
      const b = d.ink('button', s, [on ? 'on' : '', cls].filter(Boolean).join(' '));
      b.onclick = click;
      return b;
    };
    // a tap picks a row, a tap on the picked row is A
    const pick = (on: boolean, set: () => void) => () => (on ? press('a') : (sfx.tick(), set(), d.paint()));
    const title = (s: string): [HTMLElement, boolean] => [li(d.ink('p', s, 'title')), false];
    const list = (names: string[], at: number, set: (i: number) => void) =>
      names.map((s, i): [HTMLElement, boolean] => [li(button(s, i === at, pick(i === at, () => set(i)))), i === at]);
    if (mode === 'palette') return [title(S.shapes), ...list([...SHAPES.map((s) => S[s]), ...FEATURED.map((f) => f.name), S.importStl], row, (i) => (row = i))];
    if (mode === 'shelf') {
      const s = shelf();
      return [title(S.shelf), ...(s.length ? list(s.map(([, m]) => `${m.name}  v${m.version}`), row, (i) => (row = i)) : [[li(d.ink('p', S.shelfEmpty)), false] as [HTMLElement, boolean]])];
    }
    if (mode === 'name') {
      const keys = KEYS.map((r, y): [HTMLElement, boolean] => {
        const l = document.createElement('li');
        l.className = 'keys';
        l.append(...r.map((c, x) => button(c, x === key[0] && y === key[1], pick(x === key[0] && y === key[1], () => (key = [x, y])), 'key')));
        return [l, y === key[1]];
      });
      return [title(S.name), [li(d.ink('p', `${typed}_`, 'read')), false], ...keys];
    }
    if (mode === 'held') {
      const h = held!, p = bench.pieces[h.i];
      const f = (v: number) => `${+v.toFixed(1)}`;
      const value = {
        move: `${f(p.pos[0])}  ${f(p.pos[1])}  ${S.lift} ${f(h.lift)}`,
        turn: `${p.rot.map((a) => `${a}°`).join(' ')}`,
        size: `${p.size.map(f).join(' × ')} mm`,
        blend: `${f(p.blend)} mm`,
      };
      return [
        title(`${pieceName(p, h.i)}  ${p.op === 'join' ? S.union : S.difference}`),
        ...TOOLS.map((t, i): [HTMLElement, boolean] => {
          const l = document.createElement('li');
          l.append(button(S[t], i === h.tool, () => ((h.tool = i), sfx.tick(), d.paint()), 'name'), d.ink('p', value[t], 'value'));
          return [l, i === h.tool];
        }),
      ];
    }
    const P = bench.pieces.map((p, i): [HTMLElement, boolean] => {
      const on = i === sel;
      const l = document.createElement('li');
      const step = () => (sel = i, move(1, 0));
      l.append(
        button(pieceName(p, i), on, pick(on, () => (sel = i)), 'name'),
        button('‹', on, step, 'step'),
        button(p.op === 'join' ? S.union : S.difference, on, pick(on, () => (sel = i)), 'value'),
        button('›', on, step, 'step'),
      );
      return [l, on];
    });
    const n = bench.pieces.length;
    return [
      ...(n ? P : [[li(d.ink('p', S.emptyBench)), false] as [HTMLElement, boolean]]),
      ...ACTS.map((a, i): [HTMLElement, boolean] => [li(button(actName[a], n + i === sel, pick(n + i === sel, () => (sel = n + i))), i ? 'act' : 'act first'), n + i === sel]),
    ];
  }

  // every key the mode takes has a button: the bar is the touch and mouse way to each
  function bar(): [Key | Dir, string][] {
    if (mode === 'held')
      return [
        ['left', ''], ['up', ''], ['down', ''], ['right', S[TOOLS[held!.tool]]],
        ['a', S.drop], ['b', S.cancel], ['y', S.tool], ['x', `${S.union}/${S.difference}`],
        ['l', ''], ['r', S.spin], ['zl', ''], ['zr', TOOLS[held!.tool] === 'size' ? S.size : S.lift],
      ];
    if (mode === 'palette') return [['a', S.add], ['b', S.back]];
    if (mode === 'shelf') return [['a', S.open], ['b', S.back], ...(shelf().length ? [['x', S.delete] as [Key, string]] : [])];
    if (mode === 'name') return [['a', S.enter], ['b', S.cancel], ['x', S.del], ['y', S.space]];
    const p = bench.pieces[sel];
    return p
      ? [['a', S.grab], ['b', S.back], ['x', S.remove], ['y', S.shapes], ['l', S.dup], ['r', S.mirror]]
      : [['a', S.enter], ['b', S.back], ['y', S.shapes]];
  }

  return {
    enter() {
      shown = pivot.visible = true;
      mode = 'browse';
      held = null;
      sel = clamp(sel, 0, rowsN() - 1);
      syncGhosts();
      solve();
    },
    exit() {
      shown = pivot.visible = false;
    },
    get shown() {
      return shown;
    },
    title: (): [string, string] => [mode === 'name' ? S.savePart : S.play, oops ? S.notSolid : running || queue.length ? S.loading : bench.name],
    press,
    move,
    type,
    drag,
    frame,
    rows,
    bar,
  };
}
