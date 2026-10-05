import rules from '../../rules.json';
import styles from '../../styles.json';
import sizes from '../../ref/iphone/sizes.json';
import sizesText from '../../ref/iphone/sizes.json?raw';

export type Style = { about: string; output: string; knobs: Record<string, unknown> };
export type Phone = { id: string; w: number; l: number; corner: number };

export const STYLES = styles as unknown as Record<string, Style>;
const invalid = rules.invalid as Record<string, Record<string, string>>;

// an entry with `spec` points at a full transcription beside sizes.json, loaded on demand
const specs = import.meta.glob('../../ref/iphone/*.json', { import: 'default' });
const body = async (p: any) => {
  if (!p.spec) return { w: p.body.w, l: p.body.l, c: p.corner && (Array.isArray(p.corner) ? p.corner : p.corner.x) };
  const b = ((await specs[`../../ref/iphone/${p.spec}`]()) as any).body;
  return { w: b.width, l: b.length, c: b.corner.polyline.map((q: number[]) => q[0]) };
};

const phones = sizes.phones as Record<string, any>;
// roster in file order: a parsed object puts integer keys ("12") first, so the order comes from the text,
// every phone key sits at two spaces of indent
// ponytail: roster pinned to 17e, the one phone with a full drawing transcription; drop ROSTER to list every phone
const ROSTER = ['17e'];
const order = [...sizesText.matchAll(/^  "([^"]+)": \{/gm)]
  .map((m) => m[1])
  .filter((id) => id in phones && ROSTER.includes(id));
export const PHONES: Phone[] = await Promise.all(
  order.map(async (id) => {
    const p = phones[id];
    const { w, l, c } = await body(p);
    // corner: profile ordinates from the corner; the largest is how far the curve runs along each edge
    return { id, w, l, corner: c ? Math.max(...c) : 0 };
  }),
);

/** reason the phone x style combination can't build, or null */
export const why = (phone: string, style: string): string | null => invalid[phone]?.[style] ?? null;
/** every style is invalid: the phone itself can't build */
export const phoneWhy = (phone: string): string | null => {
  const r = Object.keys(STYLES).map((s) => why(phone, s));
  return r.every(Boolean) ? r[0] : null;
};
