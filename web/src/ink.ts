/**
 * The page's text at the 3D view's resolution. The DOM under `ui` keeps layout and hit areas
 * but is invisible; every frame each `.ink` element's words and each `img.px` are drawn here
 * at their laid-out boxes, faded by their own and their ancestors' opacity up to `ui`.
 * `.ink` elements hold text only; `.on` adds the glow.
 */
export function inkLayer(canvas: HTMLCanvasElement, ui: HTMLElement, glow: string) {
  const g = canvas.getContext('2d')!;
  const range = document.createRange();
  let pr = 1;

  function alpha(el: Element) {
    let a = 1;
    for (let e: Element | null = el; e && e !== ui; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') return 0;
      a *= +s.opacity;
    }
    return a;
  }

  function resize(ratio: number) {
    pr = ratio;
    canvas.width = Math.round(innerWidth * pr);
    canvas.height = Math.round(innerHeight * pr);
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(pr, 0, 0, pr, 0, 0);
    for (const el of ui.querySelectorAll<HTMLElement>('.ink, img.px')) {
      const a = alpha(el);
      if (a < 0.01) continue;
      g.globalAlpha = a;
      if (el instanceof HTMLImageElement) {
        if (!el.complete || !el.naturalWidth) continue;
        const r = el.getBoundingClientRect();
        g.drawImage(el, r.left, r.top, r.width, r.height);
        continue;
      }
      const s = getComputedStyle(el);
      g.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      g.letterSpacing = s.letterSpacing === 'normal' ? '0px' : s.letterSpacing;
      const m = g.measureText('Hg');
      const asc = m.fontBoundingBoxAscent;
      const box = asc + m.fontBoundingBoxDescent;
      const words: [string, number, number][] = [];
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        for (const w of node.textContent!.matchAll(/\S+/g)) {
          range.setStart(node, w.index);
          range.setEnd(node, w.index + w[0].length);
          const r = range.getClientRects()[0];
          if (r) words.push([w[0], r.left, r.top + (r.height - box) / 2 + asc]);
        }
      }
      // the console's black border: about one and a half pixels at the drawn resolution
      g.lineWidth = 3 / pr;
      g.lineJoin = 'round';
      g.strokeStyle = '#000';
      g.shadowBlur = 0;
      for (const [w, x, y] of words) g.strokeText(w, x, y);
      g.fillStyle = s.color;
      if (el.classList.contains('on')) {
        g.shadowColor = glow;
        g.shadowBlur = 6;
      }
      for (const [w, x, y] of words) g.fillText(w, x, y);
    }
  }

  return { resize, draw };
}
