/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.6; // 0 to 1
  private flatlineOscillator: OscillatorNode | null = null;

  // Dynamic Ambient Soundtrack Web Audio nodes
  private ambientOscillators: OscillatorNode[] = [];
  private ambientGains: GainNode[] = [];
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientLfo: OscillatorNode | null = null;
  private ambientLfoGain: GainNode | null = null;
  private tensionOscillator: OscillatorNode | null = null;
  private tensionGain: GainNode | null = null;

  constructor() {
    // Audio is loaded lazily on user gesture to comply with browser autoplay policies
  }

  /**
   * Initializes or resumes the AudioContext after a user gesture.
   */
  public async initialize(): Promise<void> {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Sets the global game volume.
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Returns the current volume level.
   */
  public getVolume(): number {
    return this.volume;
  }

  /**
   * Synthesizes the double-pulse heartbeat (Lub-Dub).
   * @param duration Ratio of the beat interval (adjusts spacing based on BPM)
   */
  public playHeartbeat(bpm: number): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;
    
    // Spacing between Lub and Dub is physiologically shorter than the rest cycle (approx 150-220ms depending on BPM)
    const beatInterval = 60 / bpm;
    const lubDubDelay = Math.min(0.18, beatInterval * 0.25);

    // ================== 1. THE "LUB" SOUND (Low Pitch) ==================
    this.synthesizeThump(now, 55, 0.15, 0.7);

    // ================== 2. THE "DUB" SOUND (Slightly higher pitch) ==================
    this.synthesizeThump(now + lubDubDelay, 68, 0.12, 0.9);
  }

  /**
   * Helper that produces a low-frequency damped sine wave thump.
   */
  private synthesizeThump(startTime: number, startFreq: number, duration: number, peakGain: number): void {
    if (!this.ctx || !this.masterGain) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      
      // Heartbeats have almost no high frequencies, so apply a strong low-pass filter
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(100, startTime);
      filter.Q.setValueAtTime(1, startTime);

      // Pitch sweep downward to mimic pressure chamber vibration
      osc.frequency.setValueAtTime(startFreq, startTime);
      osc.frequency.exponentialRampToValueAtTime(15, startTime + duration);

      // Gain envelope
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      // Connections
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    } catch (e) {
      console.warn("Thump synthesis failed", e);
    }
  }

  /**
   * Synthesizes a normal tap hit sound (clean zap).
   */
  public playHitSound(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      
      // Pitch sweeps down quickly
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {
      console.warn("Hit sound failed", e);
    }
  }

  /**
   * Synthesizes a beautiful celestial perfect score chime.
   */
  public playPerfectSound(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;

    try {
      // Create harmony using 2 oscillators
      const frequencies = [880, 1100, 1320]; // Major triad overtones (A5, C#6, E6)
      
      frequencies.forEach((freq, index) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        
        // Add subtle pitch vib/slide upwards for extra magic
        osc.frequency.linearRampToValueAtTime(freq + 10, now + 0.15);

        // Gain envelope - slightly staggered per voice
        const delay = index * 0.02;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25 - (index * 0.05), now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(now + delay);
        osc.stop(now + 0.4);
      });
    } catch (e) {
      console.warn("Perfect sound failed", e);
    }
  }

  /**
   * Synthesizes a warning sound when the heart takes damage.
   */
  public playDamageSound(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      
      // Extremely low brassy dissonance
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.linearRampToValueAtTime(65, now + 0.25);

      // Lowpass filter to make it rumbling and alarming
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {
      console.warn("Damage sound failed", e);
    }
  }

  /**
   * Plays a quick alarm beep, warning of low heart health.
   */
  public playAlarmBeep(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1960, now); // Medical warning high tone

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      console.warn("Alarm beep failed", e);
    }
  }

  /**
   * Starts playing a flatline tone (continuous diagnostic tone) at game over.
   */
  public startFlatline(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') return;

    this.stopFlatline();

    const now = this.ctx.currentTime;

    try {
      this.flatlineOscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      this.flatlineOscillator.type = 'sine';
      this.flatlineOscillator.frequency.setValueAtTime(780, now); // Flatline frequency

      // Fade in flatline tone
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.2);

      this.flatlineOscillator.connect(gain);
      gain.connect(this.masterGain);

      this.flatlineOscillator.start(now);
      
      // Store reference to gain node or connection if we want to stop it
      // Since we stop by doing .stop() on the oscillator, we track that.
      (this.flatlineOscillator as any).gainNode = gain;
    } catch (e) {
      console.warn("Flatline fail", e);
    }
  }

  /**
   * Stops the flatline tone.
   */
  public stopFlatline(): void {
    if (this.flatlineOscillator) {
      try {
        const osc = this.flatlineOscillator;
        const gain = (osc as any).gainNode;
        if (this.ctx && gain) {
          const now = this.ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.stop(now + 0.15);
        } else {
          osc.stop();
        }
      } catch (e) {
        // Already stopped or not connected
      }
      this.flatlineOscillator = null;
    }
  }

  /**
   * Starts the procedural ambient background music.
   */
  public startAmbientSoundtrack(initialBpm: number = 72): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') return;

    // Safety check - stop any leftover nodes first
    this.stopAmbientSoundtrack();

    const now = this.ctx.currentTime;

    try {
      // 1. Create a dynamic Lowpass Filter to shape the texture
      this.ambientFilter = this.ctx.createBiquadFilter();
      this.ambientFilter.type = 'lowpass';
      
      // Calculate initial cutoff based on starting BPM
      const initialCutoff = 180 + Math.max(0, (initialBpm - 72) / 72) * 420;
      this.ambientFilter.frequency.setValueAtTime(initialCutoff, now);
      this.ambientFilter.Q.setValueAtTime(1.5, now);
      this.ambientFilter.connect(this.masterGain);

      // 2. Create the pulsing LFO (creates the breathing aesthetic)
      this.ambientLfo = this.ctx.createOscillator();
      this.ambientLfo.type = 'sine';
      const initialLfoFreq = (initialBpm / 60) * 1.0; // 1 swell/breath per beat
      this.ambientLfo.frequency.setValueAtTime(initialLfoFreq, now);

      this.ambientLfoGain = this.ctx.createGain();
      // LFO amplitude represents breath depth - deeper as BPM rises
      const initialLfoDepth = 0.04 + Math.max(0, (initialBpm - 72) / 72) * 0.08;
      this.ambientLfoGain.gain.setValueAtTime(initialLfoDepth, now);

      // Connect LFO graph
      this.ambientLfo.connect(this.ambientLfoGain);

      // 3. Create core pad gain and connect LFO to modulate its level
      const padGain = this.ctx.createGain();
      padGain.gain.setValueAtTime(0.12, now); // Baseline volume
      this.ambientLfoGain.connect(padGain.gain); // Modulates volume dynamically!
      padGain.connect(this.ambientFilter);
      this.ambientGains.push(padGain);

      // 4. Spawn active harmonics (Warm minor chord progression)
      // C2 (65.41), C3 (130.81), Eb3 (155.56), G3 (196.00)
      const pitches = [65.41, 130.81, 155.56, 196.00];
      pitches.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        // Alternating triangle and sine waveforms for smooth texture
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        
        // Slightly detune to create a lush cinematic widening chorus
        const detuneValue = idx === 0 ? 0 : idx % 2 === 0 ? 0.4 : -0.4;
        osc.frequency.setValueAtTime(freq + detuneValue, now);
        
        osc.connect(padGain);
        osc.start(now);
        this.ambientOscillators.push(osc);
      });

      // 5. Create High Tension Generator (Detuned alarm resonance)
      // Set to high Bb4/Eb5, completely quiet initially at low BPM
      this.tensionOscillator = this.ctx.createOscillator();
      this.tensionOscillator.type = 'triangle';
      this.tensionOscillator.frequency.setValueAtTime(466.16, now); // Bb4 - extremely tense

      this.tensionGain = this.ctx.createGain();
      const initialTensionVol = Math.max(0, (initialBpm - 72) / 72) * 0.20;
      this.tensionGain.gain.setValueAtTime(initialTensionVol, now);

      this.tensionOscillator.connect(this.tensionGain);
      this.tensionGain.connect(this.ambientFilter);
      this.tensionOscillator.start(now);

      // Start LFO
      this.ambientLfo.start(now);

    } catch (e) {
      console.warn("Ambient soundtrack start failed", e);
    }
  }

  /**
   * Updates ambient soundtrack parameters dynamically in real time as BPM accelerates
   */
  public updateAmbientBPM(bpm: number): void {
    if (!this.ctx || !this.ambientFilter || !this.ambientLfo || !this.ambientLfoGain || !this.tensionGain) return;

    const now = this.ctx.currentTime;

    try {
      // 1. Double/single pulse sync LFO speed with the player's accelerated rhythm
      const lfoFreq = (bpm / 60) * 1.0;
      this.ambientLfo.frequency.setTargetAtTime(lfoFreq, now, 0.5);

      // 2. Expand LFO breath depth to feel more chaotic and panic-stricken at higher BPMs
      const lfoDepth = 0.04 + Math.max(0, (bpm - 72) / 72) * 0.08;
      this.ambientLfoGain.gain.setTargetAtTime(lfoDepth, now, 0.4);

      // 3. Expand Lowpass cut-off frequency to expose sharp harsh harmonics
      const cutoff = 180 + Math.max(0, (bpm - 72) / 72) * 520;
      this.ambientFilter.frequency.setTargetAtTime(cutoff, now, 0.8);

      // 4. Fade in the High Tension alarm note as BPM grows (inducing high focus)
      const tensionVol = Math.max(0, (bpm - 72) / 72) * 0.20;
      this.tensionGain.gain.setTargetAtTime(tensionVol, now, 0.6);
    } catch (e) {
      console.warn("Real-time ambient track update failed", e);
    }
  }

  /**
   * Shuts down all procedural ambient soundtrack nodes safely
   */
  public stopAmbientSoundtrack(): void {
    // 1. Terminate LFO safely
    if (this.ambientLfo) {
      try {
        this.ambientLfo.stop();
      } catch (e) {}
      this.ambientLfo = null;
    }
    this.ambientLfoGain = null;

    // 2. Terminate all active chord oscillators
    this.ambientOscillators.forEach(osc => {
      try {
        osc.stop();
      } catch (e) {}
    });
    this.ambientOscillators = [];
    this.ambientGains = [];

    // 3. Terminate tension oscillator
    if (this.tensionOscillator) {
      try {
        this.tensionOscillator.stop();
      } catch (e) {}
      this.tensionOscillator = null;
    }
    this.tensionGain = null;
    this.ambientFilter = null;
  }
}
