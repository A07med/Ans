import type { SoundContextState, SoundCue } from './event-polish';

export type EventCue = SoundCue | 'celebration' | 'count-start' | 'count-tick' | 'count-land' | 'count-three' | 'count-one' | 'test';
type Listener = () => void;
type AudioContextFactory = () => AudioContext | null;

const SOUND_PREFERENCE_KEY = 'anas-sound-enabled-v1';

type AudioWindow = typeof globalThis & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

export function browserAudioContextFactory(scope: AudioWindow = globalThis as AudioWindow): AudioContext | null {
  const AudioContextConstructor = scope.AudioContext ?? scope.webkitAudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

export class EventSoundEngine {
  private context: AudioContext | null = null;
  private muted = false;
  private listeners = new Set<Listener>();
  private tensionNodes: AudioNode[] = [];

  constructor(private readonly createContext: AudioContextFactory = browserAudioContextFactory) {}

  get contextState(): SoundContextState {
    if (!this.context) return 'absent';
    return this.context.state === 'running' ? 'running' : 'suspended';
  }
  get unlocked() { return this.contextState === 'running'; }
  get isMuted() { return this.muted; }
  get preferred() {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem(SOUND_PREFERENCE_KEY) === 'true'; }
    catch { return false; }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() { this.listeners.forEach((listener) => listener()); }

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = this.createContext();
      if (!this.context) throw new Error('audio_not_supported');
      this.context.addEventListener?.('statechange', () => this.notify());
    }
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') {
      this.notify();
      throw new Error('audio_context_suspended');
    }
    try { localStorage.setItem(SOUND_PREFERENCE_KEY, 'true'); } catch { /* Audio can still work without persisted preference. */ }
    this.muted = false;
    this.notify();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stopTension();
    this.notify();
  }

  testSound() { this.play('test'); }

  private tone(frequency: number, duration: number, gainValue: number, endFrequency = frequency, type: OscillatorType = 'sine', delay = 0) {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + Math.min(0.025, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  play(cue: EventCue) {
    if (!this.unlocked || this.muted) return;
    if (cue === 'test') {
      this.tone(660, 0.12, 0.045, 880, 'sine');
    } else if (cue === 'wamda-start') {
      this.tone(740, 0.09, 0.12, 1_260, 'square');
      this.tone(1_180, 0.12, 0.08, 1_700, 'sine', 0.035);
    } else if (cue === 'false-start') {
      this.tone(220, 0.22, 0.1, 85, 'sawtooth');
    } else if (cue === 'valid-tap') {
      this.tone(510, 0.11, 0.045, 690, 'sine');
    } else if (cue === 'positive') {
      this.tone(420, 0.16, 0.04, 620, 'sine');
    } else if (cue === 'eliminated') {
      this.tone(310, 0.32, 0.07, 105, 'triangle');
    } else if (cue === 'winner') {
      this.tone(330, 0.5, 0.075, 660, 'sine');
      this.tone(494, 0.55, 0.055, 988, 'sine', 0.09);
      this.tone(659, 0.65, 0.045, 1_318, 'sine', 0.18);
    } else if (cue === 'celebration') {
      this.tone(110, 0.42, 0.12, 55, 'sine');
      this.tone(660, 0.35, 0.07, 990, 'triangle', 0.08);
      this.tone(880, 0.42, 0.06, 1_320, 'sine', 0.16);
    } else if (cue === 'count-start') {
      this.tone(95, 0.7, 0.045, 180, 'sawtooth');
    } else if (cue === 'count-tick') {
      this.tone(185, 0.055, 0.025, 135, 'triangle');
    } else if (cue === 'count-land') {
      this.tone(105, 0.42, 0.095, 55, 'sine');
    } else if (cue === 'count-three') {
      this.tone(92, 0.65, 0.11, 46, 'sawtooth');
      this.tone(230, 0.35, 0.06, 115, 'triangle', 0.08);
    } else if (cue === 'count-one') {
      this.tone(72, 0.8, 0.14, 36, 'sawtooth');
      this.tone(520, 0.55, 0.09, 1_040, 'sine', 0.12);
    }
  }

  startTension(level: 'low' | 'stage' = 'stage') {
    if (!this.unlocked || this.muted || this.tensionNodes.length) return;
    const context = this.context!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = level === 'low' ? 52 : 58;
    filter.type = 'lowpass';
    filter.frequency.value = level === 'low' ? 165 : 210;
    gain.gain.value = level === 'low' ? 0.009 : 0.018;
    oscillator.connect(filter).connect(gain).connect(context.destination);
    oscillator.start();
    this.tensionNodes = [oscillator, filter, gain];
  }

  stopTension() {
    for (const node of this.tensionNodes) {
      if ('stop' in node && typeof node.stop === 'function') {
        try { node.stop(); } catch { /* already stopped */ }
      }
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    this.tensionNodes = [];
  }
}

export const soundEngine = new EventSoundEngine();
