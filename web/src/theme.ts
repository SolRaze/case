import memcard from '../themes/memcard.json';
import mono from '../themes/mono.json';

/** the creases every model gets drawn with; a body turns the model that one colour, none keeps its own finish; grey turns every model colour to its own lightness */
export type Sheet = { body?: string; edge: string; grey?: boolean };
/** sky: the field and key light follow the hour and the device's tilt, sky.ts */
type Theme = Omit<typeof memcard, 'sky'> & { sheet?: Sheet; sky?: boolean };

/** the looks the front page's Theme menu offers: memcard lit by the hour, memcard's still gradient, mono */
export const looks = ['sky', 'gradient', 'mono'] as const;
const themes: Record<string, Theme> = { sky: memcard, gradient: { ...memcard, sky: false }, mono, memcard };
/** ?theme= wins over the look picked in the menu, case.theme in localStorage; sky otherwise */
const pick = new URLSearchParams(location.search).get('theme') ?? localStorage.getItem('case.theme') ?? '';
export const look = pick === 'memcard' || !themes[pick] ? 'sky' : pick;
export default themes[look];
