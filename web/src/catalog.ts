import type { PhoneSpec } from './phone';

/** models whose case is finished against a full drawing; the rest show greyed and do not open */
export const READY = new Set(['17e']);

/** launch month per model; se-2-3 takes the SE 3's */
const RELEASED: Record<string, string> = {
  'se-2-3': '2022-03',
  '12': '2020-10', '12-pro': '2020-10', '12-mini': '2020-11', '12-pro-max': '2020-11',
  '13-mini': '2021-09', '13': '2021-09', '13-pro': '2021-09', '13-pro-max': '2021-09',
  '14': '2022-09', '14-pro': '2022-09', '14-pro-max': '2022-09', '14-plus': '2022-10',
  '15': '2023-09', '15-plus': '2023-09', '15-pro': '2023-09', '15-pro-max': '2023-09',
  '16': '2024-09', '16-plus': '2024-09', '16-pro': '2024-09', '16-pro-max': '2024-09',
  '16e': '2025-02',
  '17': '2025-09', 'air': '2025-09', '17-pro': '2025-09', '17-pro-max': '2025-09',
  '17e': '2026-03',
  '18-pro': '2026-09', '18-pro-max': '2026-09',
};

/** the browser's order: newest to oldest by release, a family biggest first */
export function order(phones: PhoneSpec[]) {
  return phones
    .map((p, i) => ({ p, i }))
    .sort((a, b) =>
      (RELEASED[b.p.id] ?? '').localeCompare(RELEASED[a.p.id] ?? '') ||
      b.i - a.i,
    )
    .map((x) => x.p);
}

export const year = (id: string) => RELEASED[id]?.slice(0, 4) ?? '';
export const styleName = (id: string) => id[0].toUpperCase() + id.slice(1);
