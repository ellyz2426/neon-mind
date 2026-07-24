import { createSystem } from '@iwsdk/core';

export class AudioSystem extends createSystem({}) {
  muted = false;
  private ctx: AudioContext | null = null;
  private pitchIdx: Record<string, number> = {};
  private pitchVariants = [1.0, 1.06, 0.94, 1.12];

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private nextPitch(key: string): number {
    if (!(key in this.pitchIdx)) this.pitchIdx[key] = 0;
    const p = this.pitchVariants[this.pitchIdx[key] % this.pitchVariants.length];
    this.pitchIdx[key]++;
    return p;
  }

  playSfx(sfx: string) {
    if (this.muted) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const pitch = this.nextPitch(sfx);

    switch (sfx) {
      case 'click':
        this.tone(ctx, t, 800 * pitch, 0.06, 0.15, 'sine');
        break;
      case 'place':
        this.tone(ctx, t, 440 * pitch, 0.08, 0.2, 'triangle');
        this.tone(ctx, t + 0.04, 660 * pitch, 0.06, 0.15, 'sine');
        break;
      case 'select':
        this.tone(ctx, t, 520 * pitch, 0.05, 0.12, 'sine');
        break;
      case 'exact':
        this.tone(ctx, t, 660 * pitch, 0.1, 0.25, 'sine');
        this.tone(ctx, t + 0.08, 880 * pitch, 0.08, 0.2, 'sine');
        break;
      case 'partial':
        this.tone(ctx, t, 440 * pitch, 0.08, 0.2, 'triangle');
        this.tone(ctx, t + 0.06, 550 * pitch, 0.06, 0.15, 'triangle');
        break;
      case 'miss':
        this.tone(ctx, t, 220 * pitch, 0.1, 0.3, 'sawtooth');
        break;
      case 'win':
        this.melody(ctx, t, [523, 659, 784, 1047], 0.12, 'sine');
        break;
      case 'lose':
        this.melody(ctx, t, [440, 370, 330, 262], 0.15, 'triangle');
        break;
      case 'achievement':
        this.melody(ctx, t, [660, 880, 1100], 0.1, 'sine');
        break;
      case 'hint':
        // Sparkly hint sound
        this.tone(ctx, t, 1200 * pitch, 0.06, 0.15, 'sine');
        this.tone(ctx, t + 0.05, 1400 * pitch, 0.05, 0.12, 'sine');
        this.tone(ctx, t + 0.1, 1600 * pitch, 0.04, 0.1, 'sine');
        break;
      case 'reveal':
        // Feedback peg reveal pop
        this.tone(ctx, t, 600 * pitch, 0.04, 0.1, 'sine');
        break;
      case 'submit':
        // Row submission whoosh
        this.tone(ctx, t, 300 * pitch, 0.15, 0.2, 'sine');
        this.tone(ctx, t + 0.05, 500 * pitch, 0.1, 0.15, 'sine');
        this.tone(ctx, t + 0.1, 700 * pitch, 0.08, 0.1, 'sine');
        break;
      case 'clear':
        // Row clear sweep down
        this.tone(ctx, t, 500 * pitch, 0.06, 0.12, 'triangle');
        this.tone(ctx, t + 0.04, 350 * pitch, 0.06, 0.1, 'triangle');
        break;
      case 'undo':
        // Quick reverse pop
        this.tone(ctx, t, 400 * pitch, 0.04, 0.1, 'sine');
        this.tone(ctx, t + 0.03, 300 * pitch, 0.04, 0.08, 'sine');
        break;
    }
  }

  private tone(ctx: AudioContext, time: number, freq: number, dur: number, vol: number, type: OscillatorType) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  }

  private melody(ctx: AudioContext, startTime: number, freqs: number[], noteDur: number, type: OscillatorType) {
    freqs.forEach((f, i) => {
      this.tone(ctx, startTime + i * noteDur, f, noteDur * 0.9, 0.2, type);
    });
  }

  update() {}
}
