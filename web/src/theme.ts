import memcard from '../themes/memcard.json';
import mono from '../themes/mono.json';

/** the creases every model gets drawn with; a body turns the model that one colour, none keeps its own finish; grey turns every model colour to its own lightness */
export type Sheet = { body?: string; edge: string; grey?: boolean };
/** sky: the field and key light follow the hour and the device's tilt, sky.ts */
type Theme = Omit<typeof memcard, 'sky'> & { sheet?: Sheet; sky?: boolean };

/** ?theme=mono picks the theme; memcard otherwise */
const themes: Record<string, Theme> = { memcard, mono };
export default themes[new URLSearchParams(location.search).get('theme') ?? ''] ?? memcard;
