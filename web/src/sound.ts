/**
 * The browser's sounds, synthesised: no samples. Each is built to the measured shape of the
 * console's (frequencies, lengths, envelopes) in original code. Nothing plays until unlock()
 * runs inside a user gesture; 'm' mutes, remembered in localStorage.
 */
const KEY = 'case.mute';
const db = (d: number) => 10 ** (d / 20);

let ctx: AudioContext | null = null;
let master: GainNode;
let dry: GainNode; // effects
let hall: GainNode; // reverb send
let noise: AudioBuffer;
let muted = localStorage.getItem(KEY) === '1';

function impulse(seconds: number) {
  const c = ctx!;
  const n = Math.round(c.sampleRate * seconds);
  const b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * i) / n);
  }
  return b;
}

/** pink noise, Paul Kellet's filter over white */
function pink(seconds: number) {
  const c = ctx!;
  const n = Math.round(c.sampleRate * seconds);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return b;
}

/** a voice into the dry bus and the hall send; returns its gain to shape */
function voice(at: number, wet: number, out: AudioNode = dry) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, at);
  g.connect(out);
  if (wet > 0) {
    const s = ctx!.createGain();
    s.gain.value = wet;
    g.connect(s).connect(hall);
  }
  return g;
}

function tone(f: number, at: number, len: number, to: AudioNode) {
  const o = ctx!.createOscillator();
  o.frequency.value = f;
  o.connect(to);
  o.start(at);
  o.stop(at + len);
}

export function unlock() {
  if (ctx) return void ctx.resume();
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  dry = ctx.createGain();
  dry.connect(master);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(2.3);
  hall = ctx.createGain();
  hall.connect(verb).connect(master);
  noise = pink(4);
  ambience();
  document.addEventListener('visibilitychange', () => (document.hidden ? ctx!.suspend() : ctx!.resume()));
}

export function toggleMute() {
  muted = !muted;
  localStorage.setItem(KEY, muted ? '1' : '0');
  if (ctx) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
}

/** cursor: a short 520 Hz sine with a 3690 Hz click on its front */
export function tick() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const g = voice(t, 0.15);
  g.gain.linearRampToValueAtTime(db(-15), t + 0.003);
  g.gain.exponentialRampToValueAtTime(1e-4, t + 0.08);
  tone(520, t, 0.09, g);
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3690;
  bp.Q.value = 3;
  const c = voice(t, 0.1);
  c.gain.linearRampToValueAtTime(db(-12), t + 0.001);
  c.gain.exponentialRampToValueAtTime(1e-4, t + 0.012);
  n.connect(bp).connect(c);
  n.start(t, Math.random() * 3, 0.02);
}

/**
 * Stacked fourths as beating pairs, swelling, dipping and swelling again. rate 1 is enter;
 * the same chord slowed and lowered is back and the memory card.
 */
function chime(rate: number, level: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const d = 0.782 / rate;
  const g = voice(t, 0.3);
  const a = db(level);
  g.gain.linearRampToValueAtTime(a, t + 0.08 * d);
  g.gain.linearRampToValueAtTime(a * 0.45, t + 0.36 * d);
  g.gain.linearRampToValueAtTime(a * 0.75, t + 0.55 * d);
  g.gain.exponentialRampToValueAtTime(1e-4, t + d);
  for (const f of [411.25, 414.92, 547.49, 552.61, 731.32, 737.37]) tone(f * rate, t, d + 0.05, g);
}
export const confirm = () => chime(1, -21);
export const cancel = () => chime(9270 / 22050, -19);
export const card = () => chime(14716 / 22050, -20);

/** print: a metallic ring, then a falling fourth */
export function print() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const r = voice(t, 0.3);
  r.gain.linearRampToValueAtTime(db(-22), t + 0.002);
  r.gain.exponentialRampToValueAtTime(1e-4, t + 0.12);
  for (const f of [1857, 2455]) tone(f, t, 0.13, r);
  const g = voice(t + 0.06, 0.3);
  g.gain.linearRampToValueAtTime(db(-16), t + 0.08);
  g.gain.exponentialRampToValueAtTime(1e-4, t + 0.513);
  for (const f of [457, 346]) tone(f, t + 0.06, 0.47, g);
}

/** the room: two sub drones, a breathy chord every ~8.5 s, a noise swell every ~9 s, all far back */
function ambience() {
  const c = ctx!;
  const bed = c.createGain();
  bed.gain.value = db(-24);
  bed.connect(master);
  const sub = c.createGain();
  sub.gain.value = 0.35;
  sub.connect(bed);
  for (const f of [37.7, 43.9]) {
    const o = c.createOscillator();
    o.frequency.value = f;
    o.connect(sub);
    o.start();
  }
  const chords = [[105.5, 136.2, 150.9], [180.2, 200.7, 240.2], [90.4, 120.6, 135.6]];
  let n = 0;
  const chord = () => {
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 2.5);
    g.gain.linearRampToValueAtTime(0, t + 7);
    const s = c.createGain();
    s.gain.value = 0.8;
    g.connect(bed);
    g.connect(s).connect(hall);
    for (const f of chords[n++ % chords.length]) {
      const o = c.createOscillator();
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(g);
      o.start(t);
      o.stop(t + 7.1);
    }
  };
  const wave = () => {
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.frequency.value = 700;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 3.5);
    g.gain.linearRampToValueAtTime(0, t + 8);
    src.connect(lp).connect(g).connect(bed);
    src.start(t, Math.random() * 3);
    src.stop(t + 8.1);
  };
  chord();
  setInterval(chord, 8500);
  setTimeout(() => (wave(), setInterval(wave, 9000)), 4000);
}
