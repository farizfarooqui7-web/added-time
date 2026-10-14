// Added Time Arcade-Grade Audio Synthesizer
// Zero external asset dependencies, zero latency, multi-layer Web Audio API sound engine

class SoundFX {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private hasUnlocked: boolean = false;

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

      this.ctx = new AudioCtx();

      // Master Dynamics Compressor: prevents digital clipping/distortion
      // while gluing multiple overlapping layers into a punchy arcade mix
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-8, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

      // Master Output Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
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
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0 : 0.85,
        this.ctx.currentTime
      );
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Helper to add subtle organic pitch variation (detune cents)
  private jitter(baseFreq: number, varianceCents = 25): number {
    const semitones = (Math.random() * 2 - 1) * (varianceCents / 100);
    return baseFreq * Math.pow(2, semitones / 12);
  }

  // =========================================================================
  // 1. TACTILE UI & NAVIGATION
  // =========================================================================

  /**
   * Tactile physical micro-switch click with layered transient and resonant body
   */
  public playClick(freq = 800) {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;
    const actualFreq = this.jitter(freq, 20);

    // Layer A: Sharp transient snap (high-pass micro-pulse)
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(actualFreq * 2.2, now);
    snapOsc.frequency.exponentialRampToValueAtTime(150, now + 0.02);

    snapGain.gain.setValueAtTime(0.15, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    snapOsc.connect(snapGain);
    snapGain.connect(this.compressor);
    snapOsc.start(now);
    snapOsc.stop(now + 0.02);

    // Layer B: Resonant body click
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(actualFreq, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(90, now + 0.045);

    bodyGain.gain.setValueAtTime(0.18, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.compressor);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.045);
  }

  /**
   * Delicate acoustic keystroke tick for live typing in input fields
   */
  public playTypingTick() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;
    const freq = this.jitter(1400, 35);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.018);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.018);
  }

  /**
   * Soft airy blip for menu hover
   */
  public playHover() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1050, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.025);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  // =========================================================================
  // 2. PHYSICAL TACTILE ACTIONS (CARDS, GAVEL, COINS, BUZZ)
  // =========================================================================

  /**
   * Heavy physical card flip and slap onto felt
   */
  public playCardFlip() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    // Layer A: Aerodynamic air whoosh (sweeping bandpass noise)
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.07);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1800, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(400, now + 0.07);
    noiseFilter.Q.setValueAtTime(2.5, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.compressor);
    noiseSource.start(now);

    // Layer B: Snappy card surface slap
    const slapOsc = this.ctx.createOscillator();
    const slapGain = this.ctx.createGain();
    slapOsc.type = 'triangle';
    slapOsc.frequency.setValueAtTime(280, now + 0.01);
    slapOsc.frequency.exponentialRampToValueAtTime(70, now + 0.06);

    slapGain.gain.setValueAtTime(0, now);
    slapGain.gain.setValueAtTime(0.22, now + 0.01);
    slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    slapOsc.connect(slapGain);
    slapGain.connect(this.compressor);
    slapOsc.start(now + 0.01);
    slapOsc.stop(now + 0.06);
  }

  /**
   * Punchy arcade buzzer / volt buzz for errors and invalid attempts
   */
  public playVoltBuzz() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    // Layer A: Low punch warning thud
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, now);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + 0.12);

    subGain.gain.setValueAtTime(0.25, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    subOsc.connect(subGain);
    subGain.connect(this.compressor);
    subOsc.start(now);
    subOsc.stop(now + 0.12);

    // Layer B: Dirty gritty frequency-modulated arcade buzz
    const carrier = this.ctx.createOscillator();
    const modulator = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const carrierGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(160, now);
    carrier.frequency.exponentialRampToValueAtTime(110, now + 0.14);

    modulator.type = 'square';
    modulator.frequency.setValueAtTime(75, now);

    modGain.gain.setValueAtTime(60, now);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.14);

    carrierGain.gain.setValueAtTime(0.18, now);
    carrierGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    carrier.connect(filter);
    filter.connect(carrierGain);
    carrierGain.connect(this.compressor);

    carrier.start(now);
    modulator.start(now);
    carrier.stop(now + 0.14);
    modulator.stop(now + 0.14);
  }

  /**
   * Alias for error/invalid actions
   */
  public playError() {
    this.playVoltBuzz();
  }

  /**
   * High-stakes bid sound / arcade coin drop with bright metallic overtones
   */
  public playBid() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    // Harmonic ring frequencies (B5 + F#6 + B6)
    const freqs = [987.77, 1479.98, 1975.53];
    const gains = [0.18, 0.12, 0.08];

    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.compressor) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.05, now + 0.03);
      osc.frequency.exponentialRampToValueAtTime(freq, now + 0.18);

      gain.gain.setValueAtTime(gains[idx], now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.18);
    });

    // Subtle tactile transient 'clink'
    const snap = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(3200, now);
    snap.frequency.exponentialRampToValueAtTime(800, now + 0.02);

    snapGain.gain.setValueAtTime(0.12, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    snap.connect(snapGain);
    snapGain.connect(this.compressor);
    snap.start(now);
    snap.stop(now + 0.02);
  }

  /**
   * Heavy auction gavel / thunderous hammer drop
   */
  public playHammer() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    // Layer A: Sub-bass tactile punch (50Hz shockwave)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(130, now);
    subOsc.frequency.exponentialRampToValueAtTime(38, now + 0.18);

    subGain.gain.setValueAtTime(0.35, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    subOsc.connect(subGain);
    subGain.connect(this.compressor);
    subOsc.start(now);
    subOsc.stop(now + 0.22);

    // Layer B: Hardwood block strike impact
    const woodOsc = this.ctx.createOscillator();
    const woodGain = this.ctx.createGain();
    woodOsc.type = 'triangle';
    woodOsc.frequency.setValueAtTime(380, now);
    woodOsc.frequency.exponentialRampToValueAtTime(85, now + 0.08);

    woodGain.gain.setValueAtTime(0.28, now);
    woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    woodOsc.connect(woodGain);
    woodGain.connect(this.compressor);
    woodOsc.start(now);
    woodOsc.stop(now + 0.08);

    // Layer C: Lowpass noise rattle transient
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.06);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.compressor);
    noise.start(now);
  }

  // =========================================================================
  // 3. GAMEPLAY PAYOFFS: LOCK-IN, SUCCESS, PROGRESSION, REVEALS
  // =========================================================================

  /**
   * Heavy mechanical lock-in sound for locking an answer or submitting bet
   */
  public playLockIn() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    // Layer A: Snappy latch click
    const latchOsc = this.ctx.createOscillator();
    const latchGain = this.ctx.createGain();
    latchOsc.type = 'triangle';
    latchOsc.frequency.setValueAtTime(1200, now);
    latchOsc.frequency.exponentialRampToValueAtTime(300, now + 0.03);

    latchGain.gain.setValueAtTime(0.2, now);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    latchOsc.connect(latchGain);
    latchGain.connect(this.compressor);
    latchOsc.start(now);
    latchOsc.stop(now + 0.03);

    // Layer B: Heavy locking thud
    const lockOsc = this.ctx.createOscillator();
    const lockGain = this.ctx.createGain();
    lockOsc.type = 'sine';
    lockOsc.frequency.setValueAtTime(240, now + 0.02);
    lockOsc.frequency.exponentialRampToValueAtTime(65, now + 0.14);

    lockGain.gain.setValueAtTime(0, now);
    lockGain.gain.setValueAtTime(0.25, now + 0.02);
    lockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    lockOsc.connect(lockGain);
    lockGain.connect(this.compressor);
    lockOsc.start(now + 0.02);
    lockOsc.stop(now + 0.14);

    // Layer C: Subtle confirmation metal ping
    const pingOsc = this.ctx.createOscillator();
    const pingGain = this.ctx.createGain();
    pingOsc.type = 'sine';
    pingOsc.frequency.setValueAtTime(880, now + 0.04);

    pingGain.gain.setValueAtTime(0, now);
    pingGain.gain.setValueAtTime(0.1, now + 0.04);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    pingOsc.connect(pingGain);
    pingGain.connect(this.compressor);
    pingOsc.start(now + 0.04);
    pingOsc.stop(now + 0.18);
  }

  /**
   * Uplifting multi-tone arcade flourish for correct answers, criteria matches, or milestones
   */
  public playSuccess() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    // Major Triad Arpeggio (C5 -> E5 -> G5 -> C6)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.compressor) return;
      const noteTime = now + idx * 0.045;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(idx === 3 ? 0.22 : 0.14, noteTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.22);

      osc.connect(gain);
      gain.connect(this.compressor);
      osc.start(noteTime);
      osc.stop(noteTime + 0.22);
    });
  }

  /**
   * Fast, crisp click for slot machine rolling / score ticker incrementing
   */
  public playSlotTick() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;
    const freq = this.jitter(950, 40);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.015);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.015);
  }

  /**
   * Dramatic reveal chord when a slot finishes rolling
   */
  public playSlotReveal() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    // Heavy punch bottom + bright confirmation chime
    const bass = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bass.type = 'triangle';
    bass.frequency.setValueAtTime(220, now);
    bass.frequency.exponentialRampToValueAtTime(75, now + 0.12);

    bassGain.gain.setValueAtTime(0.24, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    bass.connect(bassGain);
    bassGain.connect(this.compressor);
    bass.start(now);
    bass.stop(now + 0.12);

    const chime = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(1174.66, now); // D6
    chime.frequency.exponentialRampToValueAtTime(1760, now + 0.05);

    chimeGain.gain.setValueAtTime(0.18, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    chime.connect(chimeGain);
    chimeGain.connect(this.compressor);
    chime.start(now);
    chime.stop(now + 0.2);
  }

  /**
   * Ticking clock for timers: scales up with urgency as time runs out
   */
  public playCountdownTick(urgency = 1) {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    const baseFreq = urgency >= 3 ? 1800 : urgency === 2 ? 1400 : 900;
    const gainLevel = urgency >= 3 ? 0.14 : urgency === 2 ? 0.1 : 0.07;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = urgency >= 2 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + 0.025);

    gain.gain.setValueAtTime(gainLevel, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  /**
   * Juicy bubble pop for emoji reactions, chat messages, and vote casts
   */
  public playReactionPop() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    // Rapid upward pitch sweep gives a signature bubbly pop
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.05);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * Energetic 2-stage power-up for Lobby Ready-Up, Hosting, or Joining
   */
  public playLobbyReady() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    // Stage 1: Rising synth whoosh
    const riseOsc = this.ctx.createOscillator();
    const riseGain = this.ctx.createGain();
    riseOsc.type = 'triangle';
    riseOsc.frequency.setValueAtTime(260, now);
    riseOsc.frequency.exponentialRampToValueAtTime(650, now + 0.09);

    riseGain.gain.setValueAtTime(0.16, now);
    riseGain.gain.linearRampToValueAtTime(0.22, now + 0.08);
    riseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    riseOsc.connect(riseGain);
    riseGain.connect(this.compressor);
    riseOsc.start(now);
    riseOsc.stop(now + 0.1);

    // Stage 2: Crisp confirmation chime
    const chimeOsc = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(1318.51, now + 0.08); // E6

    chimeGain.gain.setValueAtTime(0, now);
    chimeGain.gain.setValueAtTime(0.24, now + 0.08);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(this.compressor);
    chimeOsc.start(now + 0.08);
    chimeOsc.stop(now + 0.28);
  }

  /**
   * High-energy celebratory payoff: goal cheer / match victory fanfare
   */
  public playVictoryFanfare() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    // Triumphant 5-chord fanfare: C4 -> G4 -> C5 -> E5 -> G5
    const chordNotes = [
      { freq: 261.63, delay: 0.0, dur: 0.12 },
      { freq: 392.0, delay: 0.08, dur: 0.12 },
      { freq: 523.25, delay: 0.16, dur: 0.15 },
      { freq: 659.25, delay: 0.24, dur: 0.2 },
      { freq: 783.99, delay: 0.32, dur: 0.45 },
    ];

    chordNotes.forEach(({ freq, delay, dur }) => {
      if (!this.ctx || !this.compressor) return;
      const t = now + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      // Lowpass filter to give warm brass synth character
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, t);
      filter.frequency.exponentialRampToValueAtTime(600, t + dur);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.compressor);

      osc.start(t);
      osc.stop(t + dur);
    });

    // Sub-bass celebration boom on final payoff chord
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(120, now + 0.32);
    sub.frequency.exponentialRampToValueAtTime(45, now + 0.7);

    subGain.gain.setValueAtTime(0, now);
    subGain.gain.setValueAtTime(0.28, now + 0.32);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    sub.connect(subGain);
    subGain.connect(this.compressor);
    sub.start(now + 0.32);
    sub.stop(now + 0.7);
  }

  /**
   * Atmospheric cinematic sweep for phase shifts & match intros
   */
  public playPhaseShift() {
    if (this.isMuted || !this.initCtx() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, now);
    filter.frequency.exponentialRampToValueAtTime(1800, now + 0.2);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.35);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);

    osc.start(now);
    osc.stop(now + 0.35);
  }
}

export const soundFX = new SoundFX();
