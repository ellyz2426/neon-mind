import { createSystem } from '@iwsdk/core';

/**
 * Procedural ambient music system — subtle drone + gentle arpeggios
 * that react to game events. Creates a calm, focused atmosphere.
 */
export class AmbientMusicSystem extends createSystem({}) {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain1: GainNode | null = null;
  private droneGain2: GainNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private arpTimer = 0;
  private arpInterval = 2.5; // seconds between arp notes
  private arpNoteIndex = 0;
  private playing = false;
  private targetVolume = 0.08;
  private currentVolume = 0;
  private fadeSpeed = 0.3;
  muted = false;

  // Pentatonic scale notes (C minor pentatonic in low octave)
  private arpNotes = [65.41, 77.78, 87.31, 98.0, 116.54, 130.81, 155.56, 174.61];
  // Drone fundamentals
  private droneFundamental = 55; // A1
  private droneFifth = 82.41; // E2

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  start() {
    if (this.playing || this.muted) return;
    const ctx = this.getCtx();
    if (!this.masterGain) return;

    // Drone oscillator 1 - fundamental with slow filter sweep
    this.droneGain1 = ctx.createGain();
    this.droneGain1.gain.value = 0.3;
    this.droneGain1.connect(this.masterGain);

    this.droneOsc1 = ctx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.value = this.droneFundamental;
    this.droneOsc1.connect(this.droneGain1);
    this.droneOsc1.start();

    // Drone oscillator 2 - fifth, slightly detuned for warmth
    this.droneGain2 = ctx.createGain();
    this.droneGain2.gain.value = 0.15;
    this.droneGain2.connect(this.masterGain);

    this.droneOsc2 = ctx.createOscillator();
    this.droneOsc2.type = 'sine';
    this.droneOsc2.frequency.value = this.droneFifth;
    this.droneOsc2.detune.value = 3; // slight detune for shimmer
    this.droneOsc2.connect(this.droneGain2);
    this.droneOsc2.start();

    // LFO for subtle volume wobble
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.03;
    this.lfoGain.connect(this.droneGain1.gain);

    this.lfoOsc = ctx.createOscillator();
    this.lfoOsc.type = 'sine';
    this.lfoOsc.frequency.value = 0.15; // very slow wobble
    this.lfoOsc.connect(this.lfoGain);
    this.lfoOsc.start();

    this.playing = true;
    this.targetVolume = 0.08;
  }

  stop() {
    this.targetVolume = 0;
    // Actual cleanup happens when volume reaches 0
  }

  private cleanup() {
    try {
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
      this.lfoOsc?.stop();
    } catch {}
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneGain1 = null;
    this.droneGain2 = null;
    this.lfoOsc = null;
    this.lfoGain = null;
    this.playing = false;
  }

  // Play a gentle arp note
  private playArpNote() {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const note = this.arpNotes[this.arpNoteIndex % this.arpNotes.length];
    this.arpNoteIndex++;

    // Main arp tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.value = note * 2; // one octave up for clarity
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 2;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 2);

    // Soft harmonic echo
    const echo = ctx.createOscillator();
    const echoGain = ctx.createGain();
    echo.type = 'sine';
    echo.frequency.value = note * 4; // two octaves up, very soft
    echoGain.gain.setValueAtTime(0, t + 0.3);
    echoGain.gain.linearRampToValueAtTime(0.02, t + 0.5);
    echoGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    echo.connect(echoGain);
    echoGain.connect(this.masterGain);
    echo.start(t + 0.3);
    echo.stop(t + 2.8);
  }

  // Brighten the drone briefly (called on positive game events)
  brighten() {
    if (!this.droneGain2 || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneGain2.gain.setValueAtTime(0.3, t);
    this.droneGain2.gain.linearRampToValueAtTime(0.15, t + 1.5);
  }

  // Darken the drone (called on negative events)
  darken() {
    if (!this.droneGain2 || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneGain2.gain.setValueAtTime(0.05, t);
    this.droneGain2.gain.linearRampToValueAtTime(0.15, t + 2);
  }

  update(delta: number) {
    if (!this.masterGain) return;

    // Smooth volume fade
    if (Math.abs(this.currentVolume - this.targetVolume) > 0.001) {
      this.currentVolume += (this.targetVolume - this.currentVolume) * delta * this.fadeSpeed;
      this.masterGain.gain.setValueAtTime(
        Math.max(0, this.currentVolume),
        this.ctx!.currentTime
      );
    }

    // Cleanup when fully faded out
    if (this.playing && this.targetVolume === 0 && this.currentVolume < 0.001) {
      this.cleanup();
    }

    // Play arpeggiated notes at intervals
    if (this.playing && !this.muted) {
      this.arpTimer += delta;
      if (this.arpTimer >= this.arpInterval) {
        this.arpTimer = 0;
        // Vary the interval slightly for organic feel
        this.arpInterval = 2.0 + Math.random() * 2.0;
        this.playArpNote();
      }
    }
  }
}
