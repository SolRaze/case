/**
 * The field and key light for where the light is. The clock and the device's tilt feed it; nothing else may set them,
 * so the field's bright corner and the key light always agree.
 * The theme's field as written is 9:00: light from the upper left, the field at 115deg.
 */

/**
 * angle: the field's css angle, its light opposite | el: 0 on the horizon, 1 overhead | night: the moon on the same path
 * dusk: how far the sun's hours have turned to the night look, 1 at 6:00 and 18:00 | moon: the moon's strength, 0.5 at 6:00 and 18:00
 * dark: the night look holds, night or dusk past half | along: 0 rising to 1 setting
 */
export type Light = { angle: number; el: number; night: boolean; dusk: number; moon: number; dark: boolean; along: number };

/** 0 at a, 1 at b, eased */
const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * the sun 6 to 18, the moon 18 to 6 on the same path, 90deg rising to 230deg setting, 115deg at 9:00.
 * Dusk 17 to 19: the sun's look fades to the night's by 18, then the moon grows from half to full; dawn 5 to 7 the same backward.
 * The angle jumps from setting to rising at 6 and 18, where the field is darkest, so the jump does not show.
 */
export function fromHour(h: number): Light {
  h = ((h % 24) + 24) % 24;
  const night = h < 6 || h >= 18;
  const p = (((h - (night ? 18 : 6)) % 24) + 24) % 24 / 12;
  const c = Math.cos(p * Math.PI);
  const dusk = night ? 1 : Math.max(ease(17, 18, h), 1 - ease(6, 7, h));
  const moon = night ? 0.5 + 0.5 * (h >= 18 ? ease(18, 19, h) : 1 - ease(5, 6, h)) : 0.5;
  return { angle: 160 - 70 * Math.sign(c) * Math.abs(c) ** 1.3, el: Math.sin(p * Math.PI), night, dusk, moon, dark: night || dusk > 0.5, along: p };
}

const AT9 = Math.SQRT1_2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t; // el at 9:00, where the field is as written

/**
 * field: the theme's grey stops, top left first, at 0 40 70 100%.
 * Lightness scales in HSL, never on linear colour: 45% at the horizon, 100% at 9:00, 110% overhead, the moon 8 to 12%;
 * warm toward the horizon, cool by night.
 */
export function lit({ angle, el, night, dusk, moon }: Light, field: string[]) {
  const nL = (0.08 + 0.04 * el) * moon;
  const dL = el < AT9 ? 0.45 + 0.55 * (el / AT9) : 1 + 0.1 * ((el - AT9) / (1 - AT9));
  // dusk mixes the day's lightness toward the night's; the hue turns from warm to cool through grey, never through green
  const w = night ? 1 : dusk;
  const L = night ? nL : dL + (nL - dL) * w;
  const hue = w < 0.5 ? 30 : 220;
  const sat = w < 0.5 ? Math.max(0, 0.14 * (1 - el / AT9)) * (1 - 2 * w) : 0.22 * (2 * w - 1);
  const stops = field.map((v) => `hsl(${hue} ${sat * 100}% ${Math.min(95, (parseInt(v.slice(1, 3), 16) / 2.55) * L)}%)`);
  const at = ((angle + 180) * Math.PI) / 180;
  return {
    background: `linear-gradient(${angle}deg, ${stops[0]}, ${stops[1]} 40%, ${stops[2]} 70%, ${stops[3]})`,
    /** the key light's screen direction, unit length */
    key: [Math.sin(at), Math.cos(at)] as const,
    /** the key light's colour as HSL, 0 to 1 */
    tint: [hue / 360, w < 0.5 ? sat : 0.5 * (2 * w - 1), w < 0.5 ? 1 - sat * 1.5 - 0.2 * 2 * w : 0.8] as const,
    keyScale: mix(Math.min(1.1, 0.4 + 0.6 * dL), 0.3 * moon, w),
    skyScale: mix(Math.min(1.05, 0.5 + 0.5 * dL), 0.25 * moon, w),
  };
}
