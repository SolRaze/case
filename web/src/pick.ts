import * as THREE from 'three';

/** a thing under the pointer: what to call it and where it sits on screen */
export type Picked = { name: string; rect: { left: number; top: number; right: number; bottom: number } };

const box = new THREE.Box3();
const v = new THREE.Vector3();
/** the screen rectangle round an object's bounds */
export function screenRect(o: THREE.Object3D, camera: THREE.Camera): Picked['rect'] {
  box.setFromObject(o);
  const r = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    const x = ((v.x + 1) / 2) * innerWidth;
    const y = ((1 - v.y) / 2) * innerHeight;
    r.left = Math.min(r.left, x);
    r.right = Math.max(r.right, x);
    r.top = Math.min(r.top, y);
    r.bottom = Math.max(r.bottom, y);
  }
  return r;
}

/** the drawn text: #ui is invisible, so its laid-out ink stands in for what #ink paints */
function inkAt(x: number, y: number): Picked | null {
  let best: Picked | null = null;
  let area = Infinity;
  for (const el of document.querySelectorAll<HTMLElement>('#ui .ink, #ui img.px')) {
    const r = el.getBoundingClientRect();
    const a = r.width * r.height;
    if (!a || x < r.left || x > r.right || y < r.top || y > r.bottom || a >= area) continue;
    if (getComputedStyle(el.closest('section, header, footer, #name') ?? el).opacity === '0') continue;
    const host = el.closest<HTMLElement>('[id]');
    const tag = el.id ? `#${el.id}` : `${host ? `#${host.id} ` : ''}${el.tagName.toLowerCase()}`;
    const text = el.textContent?.trim();
    best = { name: text ? `${tag} "${text}"` : tag, rect: r };
    area = a;
  }
  return best;
}

/**
 * dev only: ` toggles a picker. Hover outlines the text or 3D item under the pointer, click copies
 * "view · name" to the clipboard to paste into a request. Clicks never reach the app while it is on.
 */
export function picker(view: () => string, scene3d: (x: number, y: number) => Picked | null) {
  let on = false;
  const frame = document.createElement('div');
  const tag = document.createElement('div');
  frame.style.cssText = 'position:fixed;z-index:99;pointer-events:none;outline:2px solid #ff3cac;display:none';
  tag.style.cssText =
    'position:fixed;z-index:99;pointer-events:none;font:12px/1.4 ui-monospace,monospace;color:#fff;background:#ff3cac;padding:1px 5px;white-space:nowrap;display:none';
  document.body.append(frame, tag);

  const at = (x: number, y: number) => inkAt(x, y) ?? scene3d(x, y);
  const show = (p: Picked | null, note = '') => {
    frame.style.display = tag.style.display = p ? 'block' : 'none';
    if (!p) return;
    const r = p.rect;
    Object.assign(frame.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` });
    tag.textContent = `${view()} · ${p.name}${note}`;
    tag.style.left = `${Math.min(Math.max(r.left, 0), innerWidth - tag.offsetWidth)}px`;
    tag.style.top = `${r.top > 22 ? r.top - 20 : r.bottom + 2}px`;
  };

  addEventListener('keydown', (e) => {
    if (e.key !== '`') return;
    on = !on;
    document.body.style.cursor = on ? 'crosshair' : '';
    if (!on) show(null);
  });
  addEventListener('pointermove', (e) => on && show(at(e.clientX, e.clientY)), true);
  const swallow = (e: Event) => {
    if (!on) return;
    e.stopPropagation();
    e.preventDefault();
  };
  addEventListener('pointerdown', swallow, true);
  addEventListener('click', swallow, true);
  addEventListener(
    'pointerup',
    (e) => {
      if (!on) return;
      swallow(e);
      const p = at(e.clientX, e.clientY);
      if (!p) return;
      navigator.clipboard?.writeText(`${view()} · ${p.name}`).catch(() => {});
      console.log(`[pick] ${view()} · ${p.name}`);
      show(p, '  ✓ copied');
    },
    true,
  );
}
