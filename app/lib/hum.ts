/**
 * Hum — the entire sound of the city, on three buses.
 *   ambience — the substation hum plus a weather layer (rain is band-passed
 *              noise, snow is a near-subsonic wash, fog a slow shimmer);
 *              follows the hum toggle, crossfades in ~1.5 s
 *   ui       — tiny procedural ticks: panel click, purchase, level-up
 *   world    — the settle chime, and greeting blips whose pitch belongs to
 *              each neighbour (seeded) — everyone has their own voice
 * Everything is synthesized; there are no audio assets to load.
 */

const RAMP = 0.08;

export class Hum {
  private ctx: AudioContext | null = null;
  private humGain: GainNode | null = null;
  private master: GainNode | null = null;
  private weatherGains: Record<string, GainNode> = {};
  private weatherNow = "none";
  private humOn = false;
  private chimeOn = true;

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    humGain.connect(master);

    for (const freq of [55, 55.3]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      osc.connect(g).connect(humGain);
      osc.start();
    }

    // filtered brown-noise floor
    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    const ng = ctx.createGain();
    ng.gain.value = 0.004;
    noise.connect(lp).connect(ng).connect(humGain);
    noise.start();

    // weather layers — built once, faded by setWeather
    {
      const mkNoise = () => {
        const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.loop = true;
        src.start();
        return src;
      };
      // rain: thin band-passed hiss with a slow flutter
      {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 2400;
        bp.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.value = 0;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.23;
        const lfoG = ctx.createGain();
        lfoG.gain.value = 0.006;
        lfo.connect(lfoG).connect(g.gain);
        lfo.start();
        mkNoise().connect(bp).connect(g).connect(humGain);
        this.weatherGains.rain = g;
      }
      // snow: a very low, very slow wash
      {
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 120;
        const g = ctx.createGain();
        g.gain.value = 0;
        mkNoise().connect(lp).connect(g).connect(humGain);
        this.weatherGains.snow = g;
      }
      // fog: two slow detuned high sines, barely there
      {
        const g = ctx.createGain();
        g.gain.value = 0;
        for (const f of [1318, 1320.4]) {
          const o = ctx.createOscillator();
          o.type = "sine";
          o.frequency.value = f;
          const og = ctx.createGain();
          og.gain.value = 0.35;
          o.connect(og).connect(g);
          o.start();
        }
        this.weatherGains.fog = g;
      }
    }

    this.ctx = ctx;
    this.master = master;
    this.humGain = humGain;
    return ctx;
  }

  /** crossfade the ambience weather layer (~1.5 s) */
  setWeather(weather: string) {
    this.weatherNow = weather;
    if (!this.ctx && !this.humOn) return;
    const ctx = this.ensure();
    const LEVELS: Record<string, number> = { rain: 0.016, snow: 0.02, fog: 0.0045 };
    for (const [key, g] of Object.entries(this.weatherGains)) {
      g.gain.setTargetAtTime(key === weather ? (LEVELS[key] ?? 0) : 0, ctx.currentTime, 0.5);
    }
  }

  /** Call from any user gesture so the context can start. */
  unlock() {
    if (this.humOn || this.ctx) void this.ensure().resume();
  }

  setHum(on: boolean) {
    this.humOn = on;
    if (!on && !this.ctx) return;
    const ctx = this.ensure();
    void ctx.resume();
    this.humGain?.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, RAMP * 4);
    if (on) this.setWeather(this.weatherNow);
  }

  setChime(on: boolean) {
    this.chimeOn = on;
  }

  /** New structure settles: rising fifth + a soft low thud. */
  settle() {
    if (!this.chimeOn) return;
    const ctx = this.ensure();
    void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    const note = (freq: number, at: number, dur: number, peak: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(this.master!);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    };
    note(440, t0, 0.24, 0.045);
    note(660, t0 + 0.09, 0.3, 0.038);
    note(110, t0, 0.14, 0.05);
  }

  /** ui bus: one soft 60 ms tick for panels opening and closing */
  click() {
    if (!this.chimeOn) return;
    const ctx = this.ensure();
    void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 1560;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.02, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }

  /** ui bus: a purchase lands — falling third, quiet and final */
  purchase() {
    if (!this.chimeOn) return;
    const ctx = this.ensure();
    void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    const note = (freq: number, at: number, dur: number, peak: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(this.master!);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    };
    note(523, t0, 0.16, 0.04);
    note(415, t0 + 0.11, 0.28, 0.045);
  }

  /** ui bus: the skyline rises — ascending fifth over a low root */
  levelUp() {
    if (!this.chimeOn) return;
    const ctx = this.ensure();
    void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    const note = (freq: number, at: number, dur: number, peak: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(this.master!);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    };
    note(87.3, t0, 0.9, 0.05);
    note(349, t0 + 0.05, 0.5, 0.04);
    note(523, t0 + 0.22, 0.7, 0.038);
    note(698, t0 + 0.42, 0.9, 0.03);
  }

  /** world bus: a greeting — every neighbour speaks at their own pitch */
  greet(seed: number) {
    if (!this.chimeOn) return;
    const ctx = this.ensure();
    void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    const base = 392 + (seed % 8) * 49.5; // G4 .. G5-ish, seeded per resident
    const note = (freq: number, at: number, dur: number, peak: number) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(this.master!);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    };
    note(base, t0, 0.09, 0.028);
    note(base * 1.25, t0 + 0.07, 0.14, 0.022);
  }

  /** The survey sweep breathes the hum very slightly. */
  sweep(phase: number) {
    if (!this.ctx || !this.humOn || !this.humGain) return;
    const lift = 1 + Math.sin(phase * Math.PI) * 0.08;
    this.humGain.gain.setTargetAtTime(lift, this.ctx.currentTime, 0.4);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
