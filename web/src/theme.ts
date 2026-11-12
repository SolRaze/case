import loud from '../themes/loud.json';

/** the creases every model gets drawn with; a body turns the model that one colour, none keeps its own finish; grey turns every model colour to its own lightness */
export type Sheet = { body?: string; edge: string; grey?: boolean };
/** sky: the field and key light follow the hour and the device's tilt, sky.ts */
type Theme = Omit<typeof loud, 'sky'> & { sheet?: Sheet; sky?: boolean };

/** THE LOUD PROJECT's one look */
export default loud as Theme;
