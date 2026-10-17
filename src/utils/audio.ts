// Added Time arcade sound engine.
// Every sound is synthesised live with the Web Audio API: no audio files, no dependencies, no load time.
//
//   voices ─► bus ─► soft-clip saturation ─► compressor ─► master ─► speakers
//          └► reverb send ─► procedural room (convolver) ─► darkening filter ─┘
//
// Each sound is built from small layers: a sub-bass transient for weight, a filtered-noise snap for
// attack, FM bells / detuned saws for tone and harmonics, and a touch of room for space.

const MASTER_LEVEL = 0.8;
const MAX_VOICES = 96; // hard ceiling on simultaneous layers, so spammed sounds can never pile up

type FilterSpec = {
  type: BiquadFilterType;
  freq: number;
  /** Sweep the cutoff to this frequency over `glide` seconds. */
  to?: number;
  glide?: number;
  q?: number;
};

interface VoiceOpts {
  /** Start offset from now, in seconds. */
  at?: number;
  attack?: number;
  hold?: number;
  decay: number;
  /** Peak level (linear). */
  gain: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number;
  /** Reverb send level. */
  send?: number;
  filter?: FilterSpec;
}

interface ToneOpts extends VoiceOpts {
  type?: OscillatorType;
  freq: number;
  /** Pitch sweep target, reached after `glide` seconds. */
  to?: number;
  glide?: number;
  detune?: number;
}

interface NoiseOpts extends VoiceOpts {
  filter: FilterSpec;
}

interface FmOpts extends VoiceOpts {
  freq: number;
  /** Modulator frequency as a multiple of the carrier. */
  ratio: number;
  /** Modulation depth as a multiple of the carrier frequency (brightness of the strike). */
  index: number;
  /** How fast the brightness fades, in seconds. */
  indexDecay?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** tanh soft-clip: rounds off peaks and adds warm harmonics when layers stack up. */
function softClipCurve(drive: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/** Short stereo room: decaying noise after a small pre-delay. */
function makeRoomImpulse(ctx: AudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const preDelay = Math.floor(rate * 0.008);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = preDelay; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function makeNoise(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

class SoundFX {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;
  private bus: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private hasUnlocked: boolean = false;
  private voices = 0;
  private lastPlayed: Record<string, number> = {};

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const storedMute = localStorage.getItem('topbins_sfx_muted');
        if (storedMute !== null) {
          this.isMuted = storedMute === 'true';
        }
      } catch {
        // Ignore localStorage restrictions
      }

      // Auto-unlock AudioContext on first user gesture anywhere on screen
      const unlock = () => {
        if (this.hasUnlocked) return;
        this.initCtx();
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        this.hasUnlocked = true;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      };

      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
    }
  }

  private initCtx(): boolean {
    if (typeof window === 'undefined') return false;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;

      const ctx = new AudioCtx();
      const t = ctx.currentTime;
      this.ctx = ctx;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : MASTER_LEVEL, t);

      // Glue compressor: keeps stacked layers punchy without clipping
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-12, t);
      compressor.knee.setValueAtTime(10, t);
      compressor.ratio.setValueAtTime(4, t);
      compressor.attack.setValueAtTime(0.002, t);
      compressor.release.setValueAtTime(0.14, t);

      const saturation = ctx.createWaveShaper();
      saturation.curve = softClipCurve(1.8);
      saturation.oversample = '2x';

      this.bus = ctx.createGain();
      this.bus.connect(saturation);
      saturation.connect(compressor);
      compressor.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);

      // Room reverb, darkened so tails sit behind the dry hits
      const convolver = ctx.createConvolver();
      convolver.buffer = makeRoomImpulse(ctx, 1.6, 3.2);
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.setValueAtTime(4200, t);
      const wet = ctx.createGain();
      wet.gain.setValueAtTime(0.5, t);
      this.reverbIn = ctx.createGain();
      this.reverbIn.connect(convolver);
      convolver.connect(damp);
      damp.connect(wet);
      wet.connect(compressor);

      this.noiseBuffer = makeNoise(ctx, 1);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return true;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem('topbins_sfx_muted', String(this.isMuted));
    } catch {
      // Ignore
    }

    if (this.ctx && this.masterGain) {
      // Short glide instead of a hard jump, so muting mid-sound never clicks
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : MASTER_LEVEL, this.ctx.currentTime, 0.015);
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // =========================================================================
  // Synthesis building blocks
  // =========================================================================

  /** Context ready to play (and not muted). */
  private ready(): boolean {
    return !this.isMuted && this.initCtx() && Boolean(this.ctx && this.bus);
  }

  /** True when this sound fired less than `ms` ago (stops rapid-fire sounds turning into mush). */
  private throttled(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlayed[key] ?? -Infinity) < ms) return true;
    this.lastPlayed[key] = now;
    return false;
  }

  // Helper to add subtle organic pitch variation (detune cents)
  private jitter(baseFreq: number, varianceCents = 25): number {
    const semitones = (Math.random() * 2 - 1) * (varianceCents / 100);
    return baseFreq * Math.pow(2, semitones / 12);
  }

  private envelope(ctx: AudioContext, t: number, o: VoiceOpts) {
    const amp = ctx.createGain();
    const attack = o.attack ?? 0.002;
    const hold = o.hold ?? 0;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(o.gain, t + attack);
    if (hold > 0) amp.gain.setValueAtTime(o.gain, t + attack + hold);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + o.decay);
    return { amp, end: t + attack + hold + o.decay + 0.03 };
  }

  private makeFilter(ctx: AudioContext, t: number, f: FilterSpec) {
    const filter = ctx.createBiquadFilter();
    filter.type = f.type;
    filter.frequency.setValueAtTime(f.freq, t);
    filter.Q.setValueAtTime(f.q ?? 0.7, t);
    if (f.to) filter.frequency.exponentialRampToValueAtTime(f.to, t + (f.glide ?? 0.1));
    return filter;
  }

  /** Sends a finished layer to the mix (with optional pan and reverb send). */
  private route(ctx: AudioContext, node: AudioNode, o: VoiceOpts, nodes: AudioNode[]) {
    let out = node;
    if (o.pan && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(o.pan, -1, 1);
      out.connect(panner);
      out = panner;
      nodes.push(panner);
    }
    out.connect(this.bus!);
    if (o.send && this.reverbIn) {
      const send = ctx.createGain();
      send.gain.value = o.send;
      out.connect(send);
      send.connect(this.reverbIn);
      nodes.push(send);
    }
  }

  /** Starts a source and tears its nodes down once it ends. */
  private schedule(src: AudioScheduledSourceNode, t: number, end: number, nodes: AudioNode[], offset?: number) {
    this.voices++;
    src.onended = () => {
      this.voices--;
      nodes.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          // already disconnected
        }
      });
    };
    if (offset !== undefined && src instanceof AudioBufferSourceNode) src.start(t, offset);
    else src.start(t);
    src.stop(end);
  }

  /** Oscillator layer with optional pitch sweep and filter. */
  private tone(o: ToneOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.bus || this.voices > MAX_VOICES) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? 0.08));
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    const { amp, end } = this.envelope(ctx, t, o);
    const nodes: AudioNode[] = [osc, amp];
    if (o.filter) {
      const filter = this.makeFilter(ctx, t, o.filter);
      osc.connect(filter);
      filter.connect(amp);
      nodes.push(filter);
    } else {
      osc.connect(amp);
    }
    this.route(ctx, amp, o, nodes);
    this.schedule(osc, t, end, nodes);
  }

  /** Filtered noise layer: snaps, cracks, whooshes, cymbals. */
  private noise(o: NoiseOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.bus || !this.noiseBuffer || this.voices > MAX_VOICES) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.makeFilter(ctx, t, o.filter);
    const { amp, end } = this.envelope(ctx, t, o);
    src.connect(filter);
    filter.connect(amp);
    const nodes: AudioNode[] = [src, filter, amp];
    this.route(ctx, amp, o, nodes);
    this.schedule(src, t, end, nodes, Math.random() * 0.5);
  }

  /** Two-operator FM: a bright metallic strike that mellows as the modulation fades. */
  private fm(o: FmOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.bus || this.voices > MAX_VOICES) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const carrier = ctx.createOscillator();
    carrier.frequency.setValueAtTime(o.freq, t);
    const modulator = ctx.createOscillator();
    modulator.frequency.setValueAtTime(o.freq * o.ratio, t);
    const depth = ctx.createGain();
    const peak = o.freq * o.index;
    depth.gain.setValueAtTime(peak, t);
    depth.gain.exponentialRampToValueAtTime(Math.max(1, peak * 0.03), t + (o.indexDecay ?? o.decay));
    modulator.connect(depth);
    depth.connect(carrier.frequency);
    const { amp, end } = this.envelope(ctx, t, o);
    carrier.connect(amp);
    const nodes: AudioNode[] = [carrier, modulator, depth, amp];
    this.route(ctx, amp, o, nodes);
    modulator.start(t);
    modulator.stop(end);
    this.schedule(carrier, t, end, nodes);
  }

  /** Sub-bass transient: a sine that drops in pitch, felt more than heard. */
  private kick(at: number, from: number, to: number, decay: number, gain: number) {
    this.tone({ type: 'sine', freq: from, to, glide: decay * 0.45, gain, decay, at, attack: 0.001 });
  }

  /** Chime: FM strike plus a quiet inharmonic partial for shimmer. */
  private bell(freq: number, at: number, gain: number, decay: number, send = 0.2) {
    this.fm({ freq, ratio: 2, index: 1.6, indexDecay: Math.min(0.12, decay), gain, decay, at, send });
    this.tone({ type: 'sine', freq: freq * 2.76, gain: gain * 0.18, decay: decay * 0.35, at, send });
  }

  /** Brass stab: three detuned saws whose filter opens on the attack. */
  private brass(freq: number, at: number, hold: number, gain: number, send = 0.25) {
    for (const detune of [-9, 0, 9]) {
      this.tone({
        type: 'sawtooth',
        freq,
        detune,
        gain: gain / 2,
        attack: 0.025,
        hold,
        decay: 0.35,
        at,
        send,
        pan: detune / 30,
        filter: { type: 'lowpass', freq: freq * 1.5, to: Math.min(freq * 7, 9000), glide: 0.07, q: 1.2 },
      });
    }
  }

  // =========================================================================
  // 1. TACTILE UI & NAVIGATION
  // =========================================================================

  /**
   * Tactile micro-switch: noise snap for the attack, a pitched body, a glassy overtone and a low thump.
   * `freq` sets the pitch (higher reads as more positive / confirming).
   */
  public playClick(freq = 800) {
    if (!this.ready() || this.throttled('click', 25)) return;
    const f = this.jitter(freq, 30);
    const pan = (Math.random() - 0.5) * 0.16;
    const thump = clamp(f / 4, 90, 240);
    this.noise({ filter: { type: 'bandpass', freq: Math.min(9000, f * 5), q: 1.4 }, gain: 0.34, decay: 0.014, pan });
    this.tone({ type: 'triangle', freq: f, to: f * 0.55, glide: 0.04, gain: 0.26, decay: 0.055, pan });
    this.tone({ type: 'sine', freq: f * 2.01, gain: 0.04, decay: 0.03, pan });
    this.tone({ type: 'sine', freq: thump, to: thump * 0.7, glide: 0.05, gain: 0.2, decay: 0.06 });
  }

  /** Mechanical-keyboard tick: bright and short, varied every keystroke so typing never sounds looped. */
  public playTypingTick() {
    if (!this.ready() || this.throttled('type', 22)) return;
    const f = this.jitter(2600, 120);
    const pan = (Math.random() - 0.5) * 0.4;
    this.noise({ filter: { type: 'highpass', freq: f, q: 0.8 }, gain: 0.16, decay: 0.012, pan });
    this.tone({ type: 'sine', freq: f * 0.62, gain: 0.06, decay: 0.018, pan });
  }

  /** Soft airy lift on hover. */
  public playHover() {
    if (!this.ready() || this.throttled('hover', 50)) return;
    const f = this.jitter(1350, 40);
    this.tone({ type: 'sine', freq: f, to: f * 1.18, glide: 0.035, gain: 0.07, attack: 0.004, decay: 0.05 });
    this.noise({ filter: { type: 'bandpass', freq: 7000, q: 2 }, gain: 0.035, attack: 0.003, decay: 0.03 });
  }

  /** Card flip: an air whoosh that lands on a crisp snap. */
  public playCardFlip() {
    if (!this.ready()) return;
    this.noise({
      filter: { type: 'bandpass', freq: 500, to: 4200, glide: 0.11, q: 1.6 },
      gain: 0.16,
      attack: 0.06,
      decay: 0.07,
      pan: -0.25,
    });
    this.noise({ filter: { type: 'bandpass', freq: 2400, q: 1.5 }, gain: 0.2, decay: 0.016, at: 0.09, pan: 0.15 });
    this.tone({ type: 'triangle', freq: 260, to: 150, glide: 0.05, gain: 0.14, decay: 0.07, at: 0.09 });
    this.kick(0.09, 160, 70, 0.07, 0.16);
  }

  // =========================================================================
  // 2. ERRORS & DENIALS
  // =========================================================================

  /**
   * Denied buzzer for errors and invalid attempts: two gritty stutters of a clashing chord over sub.
   */
  public playVoltBuzz() {
    if (!this.ready()) return;
    const pulses: Array<[number, number]> = [
      [0, 155],
      [0.11, 130],
    ];
    for (const [at, f] of pulses) {
      const filter: FilterSpec = { type: 'lowpass', freq: 1600, q: 2 };
      this.tone({ type: 'square', freq: f, detune: -8, gain: 0.1, attack: 0.004, hold: 0.05, decay: 0.04, at, filter });
      this.tone({ type: 'sawtooth', freq: f * 1.06, detune: 8, gain: 0.06, attack: 0.004, hold: 0.05, decay: 0.04, at, filter });
      this.tone({ type: 'sine', freq: f / 2, gain: 0.2, attack: 0.004, hold: 0.05, decay: 0.05, at });
    }
    this.noise({ filter: { type: 'highpass', freq: 3000 }, gain: 0.05, decay: 0.08 });
  }

  /** Falling "bwomp": a sagging filtered saw over a dropping sub. */
  public playError() {
    if (!this.ready()) return;
    this.tone({
      type: 'sawtooth',
      freq: 240,
      to: 150,
      glide: 0.22,
      gain: 0.13,
      hold: 0.06,
      decay: 0.16,
      filter: { type: 'lowpass', freq: 1200, to: 400, glide: 0.22, q: 3 },
    });
    this.tone({ type: 'sine', freq: 120, to: 70, glide: 0.2, gain: 0.2, decay: 0.2 });
    this.noise({ filter: { type: 'bandpass', freq: 1800, q: 2 }, gain: 0.08, decay: 0.02 });
  }

  // =========================================================================
  // 3. AUCTION & IMPACT MOMENTS
  // =========================================================================

  /** Chip-in bid: sub punch, a chip click, and a bright FM coin with a fifth on top. */
  public playBid() {
    if (!this.ready()) return;
    const f = this.jitter(988, 15);
    this.kick(0, 150, 48, 0.12, 0.38);
    this.noise({ filter: { type: 'highpass', freq: 5000 }, gain: 0.12, decay: 0.012 });
    this.fm({ freq: f, ratio: 2, index: 2.2, indexDecay: 0.08, gain: 0.13, decay: 0.32, send: 0.12 });
    this.tone({ type: 'triangle', freq: f * 1.5, gain: 0.05, decay: 0.2, at: 0.012, send: 0.1 });
    this.tone({ type: 'sine', freq: f * 2, gain: 0.03, decay: 0.12 });
  }

  /** SOLD gavel: heavy sub, a wooden crack and body, then a bright confirmation chord in the room. */
  public playHammer() {
    if (!this.ready()) return;
    this.kick(0, 190, 40, 0.38, 0.7);
    this.tone({ type: 'sine', freq: 55, gain: 0.25, hold: 0.04, decay: 0.3 });
    this.noise({ filter: { type: 'bandpass', freq: 1900, q: 2.5 }, gain: 0.5, decay: 0.035 });
    this.noise({ filter: { type: 'bandpass', freq: 850, q: 6 }, gain: 0.28, decay: 0.12 });
    this.noise({ filter: { type: 'lowpass', freq: 400 }, gain: 0.2, decay: 0.09 });

    [1046.5, 1318.5, 1568].forEach((f, i) => this.bell(f, 0.06 + i * 0.018, 0.075, 0.9, 0.35));
    const body: FilterSpec = { type: 'lowpass', freq: 1800, to: 700, glide: 0.4 };
    this.tone({ type: 'sawtooth', freq: 261.6, gain: 0.06, attack: 0.01, decay: 0.6, at: 0.06, send: 0.25, filter: body });
    this.tone({ type: 'sawtooth', freq: 392, detune: 6, gain: 0.05, attack: 0.01, decay: 0.6, at: 0.06, send: 0.25, filter: body });
  }

  /** Answer locked: a two-stage latch ("ka-chunk"), sub hit, and a power chord whose filter rips open. */
  public playLockIn() {
    if (!this.ready()) return;
    this.noise({ filter: { type: 'highpass', freq: 2200 }, gain: 0.25, decay: 0.015 });
    this.noise({ filter: { type: 'bandpass', freq: 1100, q: 2 }, gain: 0.22, decay: 0.04, at: 0.045 });
    this.kick(0.045, 130, 50, 0.2, 0.45);

    const rise: FilterSpec = { type: 'lowpass', freq: 500, to: 4200, glide: 0.1, q: 4 };
    this.tone({ type: 'sawtooth', freq: 220, gain: 0.08, attack: 0.01, decay: 0.3, at: 0.045, send: 0.15, filter: rise, pan: -0.15 });
    this.tone({ type: 'sawtooth', freq: 330, detune: 6, gain: 0.06, attack: 0.01, decay: 0.3, at: 0.045, send: 0.15, filter: rise, pan: 0.15 });
    this.tone({ type: 'square', freq: 440, gain: 0.03, attack: 0.01, decay: 0.25, at: 0.045, filter: rise });
    this.bell(1760, 0.06, 0.05, 0.3, 0.2);
  }

  /** Correct / positive: a quick rising major arpeggio of bells with a sparkle tail. */
  public playSuccess() {
    if (!this.ready()) return;
    this.kick(0, 120, 55, 0.1, 0.22);
    [659.3, 830.6, 987.8, 1318.5].forEach((f, i) => {
      const at = i * 0.055;
      this.bell(f, at, 0.11, 0.38, 0.25);
      this.tone({ type: 'triangle', freq: f / 2, gain: 0.05, decay: 0.2, at });
    });
    this.noise({ filter: { type: 'highpass', freq: 8000 }, gain: 0.05, attack: 0.02, decay: 0.25, at: 0.17, send: 0.3 });
  }

  // =========================================================================
  // 4. REVEALS, TIMERS & SOCIAL
  // =========================================================================

  /** Slot-reel tick: a tiny detented click, varied so fast spins sound mechanical, not looped. */
  public playSlotTick() {
    if (!this.ready() || this.throttled('slot', 18)) return;
    const f = this.jitter(1700, 60);
    this.tone({ type: 'square', freq: f, gain: 0.1, decay: 0.012, filter: { type: 'lowpass', freq: 4500 } });
    this.noise({ filter: { type: 'bandpass', freq: 3200, q: 3 }, gain: 0.18, decay: 0.01 });
  }

  /** Reveal stab: sub impact, an air burst, a bright filtered major chord and a high shimmer. */
  public playSlotReveal() {
    if (!this.ready()) return;
    this.kick(0, 170, 45, 0.3, 0.5);
    this.noise({ filter: { type: 'bandpass', freq: 400, to: 6000, glide: 0.08, q: 1 }, gain: 0.15, decay: 0.12 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone({
        type: 'sawtooth',
        freq: f,
        detune: (i - 1.5) * 5,
        gain: 0.045,
        attack: 0.005,
        decay: 0.55,
        send: 0.3,
        pan: (i - 1.5) * 0.15,
        filter: { type: 'lowpass', freq: 6000, to: 1200, glide: 0.35 },
      });
    });
    this.bell(2093, 0.04, 0.04, 0.8, 0.4);
  }

  /**
   * Countdown tick. urgency 1 = woodblock, 2 = brighter with a sub knock, 3 = final-seconds alarm hit.
   */
  public playCountdownTick(urgency = 1) {
    if (!this.ready()) return;
    const u = clamp(Math.round(urgency), 1, 3);
    if (u === 1) {
      this.tone({ type: 'sine', freq: 880, to: 820, glide: 0.04, gain: 0.14, decay: 0.06 });
      this.noise({ filter: { type: 'bandpass', freq: 2200, q: 4 }, gain: 0.1, decay: 0.015 });
    } else if (u === 2) {
      this.tone({ type: 'triangle', freq: 1175, to: 1100, glide: 0.05, gain: 0.15, decay: 0.08 });
      this.noise({ filter: { type: 'bandpass', freq: 3000, q: 3 }, gain: 0.12, decay: 0.015 });
      this.kick(0, 140, 60, 0.08, 0.2);
    } else {
      this.tone({ type: 'square', freq: 1568, gain: 0.1, decay: 0.09, filter: { type: 'lowpass', freq: 5000 } });
      this.tone({ type: 'sine', freq: 3136, gain: 0.05, decay: 0.05 });
      this.kick(0, 170, 50, 0.14, 0.38);
      this.noise({ filter: { type: 'highpass', freq: 4000 }, gain: 0.1, decay: 0.02 });
    }
  }

  /** Bubble pop for emoji reactions, chat messages and vote casts. */
  public playReactionPop() {
    if (!this.ready() || this.throttled('pop', 40)) return;
    const f = this.jitter(520, 80);
    const pan = (Math.random() - 0.5) * 0.6;
    this.tone({ type: 'sine', freq: f, to: f * 2.6, glide: 0.045, gain: 0.34, decay: 0.09, pan });
    this.noise({ filter: { type: 'bandpass', freq: f * 4, q: 3 }, gain: 0.12, decay: 0.012, pan });
  }

  /** Lobby ready: a rising two-note chime over a warm pad. */
  public playLobbyReady() {
    if (!this.ready()) return;
    this.kick(0, 110, 55, 0.12, 0.2);
    this.bell(784, 0, 0.1, 0.5, 0.25);
    this.bell(1175, 0.09, 0.1, 0.7, 0.3);
    this.tone({ type: 'sine', freq: 392, gain: 0.06, attack: 0.03, hold: 0.1, decay: 0.4, send: 0.2 });
  }

  /** Victory: crash and sub impact, a brass pickup into a held C-major chord, sub bass and sparkle bells. */
  public playVictoryFanfare() {
    if (!this.ready()) return;
    this.kick(0, 160, 38, 0.5, 0.6);
    this.noise({ filter: { type: 'highpass', freq: 4500 }, gain: 0.14, decay: 1.3, send: 0.3 });
    this.noise({ filter: { type: 'bandpass', freq: 7000, q: 0.8 }, gain: 0.06, decay: 0.9 });

    const pickup: Array<[number, number]> = [
      [523.25, 0],
      [659.25, 0.09],
      [783.99, 0.18],
    ];
    pickup.forEach(([f, at]) => this.brass(f, at, 0.05, 0.1, 0.25));

    const C = 0.3;
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.brass(f, C, 0.55, 0.07, 0.35));
    this.tone({ type: 'sine', freq: 65.4, gain: 0.3, attack: 0.01, hold: 0.4, decay: 0.5, at: C });
    this.tone({
      type: 'sawtooth',
      freq: 130.8,
      gain: 0.08,
      attack: 0.01,
      hold: 0.4,
      decay: 0.5,
      at: C,
      filter: { type: 'lowpass', freq: 900 },
    });
    this.kick(C, 140, 40, 0.35, 0.5);
    this.noise({ filter: { type: 'highpass', freq: 5000 }, gain: 0.1, decay: 1.4, at: C, send: 0.35 });
    [2093, 2637, 3136].forEach((f, i) => this.bell(f, C + 0.12 + i * 0.07, 0.035, 0.6, 0.5));
  }

  /** Phase / screen transition: a stereo whoosh that sweeps up, then drops into a sub thud. */
  public playPhaseShift() {
    if (!this.ready()) return;
    this.noise({
      filter: { type: 'bandpass', freq: 300, to: 5000, glide: 0.32, q: 1.2 },
      gain: 0.16,
      attack: 0.22,
      decay: 0.18,
      pan: -0.3,
      send: 0.2,
    });
    this.noise({
      filter: { type: 'bandpass', freq: 450, to: 6500, glide: 0.32, q: 1.2 },
      gain: 0.1,
      attack: 0.22,
      decay: 0.18,
      pan: 0.3,
    });
    this.tone({
      type: 'sawtooth',
      freq: 220,
      to: 880,
      glide: 0.25,
      gain: 0.03,
      attack: 0.2,
      decay: 0.1,
      filter: { type: 'lowpass', freq: 2000 },
    });
    this.tone({ type: 'sine', freq: 90, to: 45, glide: 0.3, gain: 0.3, decay: 0.25, at: 0.2 });
  }
}

export const soundFX = new SoundFX();
