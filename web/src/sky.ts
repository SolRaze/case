/**
 * The field and key light for where the light is. The clock and the device's tilt feed it; nothing else may set them,
 * so the field's bright corner and the key light always agree.
 * The theme's field as written is 9:00: light from the upper left, the field at 115deg.
 */

/** angle: the field's css angle, its light opposite | el: 0 on the horizon, 1 overhead | night: the moon on the same path */
export type Light = { angle: number; el: number; night: boolean };

/** the sun 6 to 18, the moon 18 to 6 on the same path, 90deg rising to 230deg setting, 115deg at 9:00 */
export function fromHour(h: number): Light {
  h = ((h % 24) + 24) % 24;
  const night = h < 6 || h >= 18;
  const p = (((h - (night ? 18 : 6)) % 24) + 24) % 24 / 12;
  const c = Math.cos(p * Math.PI);
  return { angle: 160 - 70 * Math.sign(c) * Math.abs(c) ** 1.3, el: Math.sin(p * Math.PI), night };
}

const AT9 = Math.SQRT1_2; // el at 9:00, where the field is as written

/**
 * field: the theme's grey stops, top left first, at 0 40 70 100%.
 * Lightness scales in HSL, never on linear colour: 45% at the horizon, 100% at 9:00, 110% overhead, the moon 8 to 12%;
 * warm toward the horizon, cool by night.
 */
export function lit({ angle, el, night }: Light, field: string[]) {
  const L = night ? 0.08 + 0.04 * el : el < AT9 ? 0.45 + 0.55 * (el / AT9) : 1 + 0.1 * ((el - AT9) / (1 - AT9));
  const hue = night ? 220 : 30;
  const sat = night ? 0.22 : Math.max(0, 0.14 * (1 - el / AT9));
  const stops = field.map((v) => `hsl(${hue} ${sat * 100}% ${Math.min(95, (parseInt(v.slice(1, 3), 16) / 2.55) * L)}%)`);
  const at = ((angle + 180) * Math.PI) / 180;
  return {
    background: `linear-gradient(${angle}deg, ${stops[0]}, ${stops[1]} 40%, ${stops[2]} 70%, ${stops[3]})`,
    /** the key light's screen direction, unit length */
    key: [Math.sin(at), Math.cos(at)] as const,
    /** the key light's colour as HSL, 0 to 1 */
    tint: [hue / 360, night ? 0.5 : sat, night ? 0.8 : 1 - sat * 1.5] as const,
    keyScale: night ? 0.3 : Math.min(1.1, 0.4 + 0.6 * L),
    skyScale: night ? 0.25 : Math.min(1.05, 0.5 + 0.5 * L),
  };
}
