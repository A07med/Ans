import { describe, expect, it, vi } from 'vitest';
import { browserAudioContextFactory, EventSoundEngine } from './sound';

function fakeAudioContext(initialState: AudioContextState = 'suspended') {
  const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const destination = {};
  const context = {
    state: initialState,
    currentTime: 0,
    destination,
    resume: vi.fn(async () => { context.state = 'running'; }),
    addEventListener: vi.fn(),
    createOscillator: vi.fn(() => {
      const oscillator = {
        type: 'sine',
        frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn((node) => node),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => ({ gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn((node) => node), disconnect: vi.fn() })),
    createBiquadFilter: vi.fn(() => ({ type: 'lowpass', frequency: { value: 0 }, connect: vi.fn((node) => node), disconnect: vi.fn() })),
  };
  return { context, oscillators };
}

describe('EventSoundEngine', () => {
  it('creates and resumes AudioContext only from explicit activation', async () => {
    const fake = fakeAudioContext();
    const engine = new EventSoundEngine(() => fake.context as unknown as AudioContext);
    expect(engine.contextState).toBe('absent');
    await engine.unlock();
    expect(fake.context.resume).toHaveBeenCalledOnce();
    expect(engine.contextState).toBe('running');
  });

  it('uses the WebKit constructor fallback when standard AudioContext is absent', () => {
    const fake = fakeAudioContext('running');
    const WebkitAudioContext = vi.fn(() => fake.context) as unknown as typeof AudioContext;
    expect(browserAudioContextFactory({ webkitAudioContext: WebkitAudioContext } as never)).toBe(fake.context);
    expect(WebkitAudioContext).toHaveBeenCalledOnce();
  });

  it('test button produces an oscillator and mute suppresses it', async () => {
    const fake = fakeAudioContext();
    const engine = new EventSoundEngine(() => fake.context as unknown as AudioContext);
    await engine.unlock();
    engine.testSound();
    expect(fake.context.createOscillator).toHaveBeenCalledOnce();
    engine.setMuted(true);
    engine.testSound();
    expect(fake.context.createOscillator).toHaveBeenCalledOnce();
  });

  it('starts participant tension once and stops it safely', async () => {
    const fake = fakeAudioContext();
    const engine = new EventSoundEngine(() => fake.context as unknown as AudioContext);
    await engine.unlock();
    engine.startTension('low');
    engine.startTension('low');
    expect(fake.context.createOscillator).toHaveBeenCalledOnce();
    engine.stopTension();
    expect(fake.oscillators[0].stop).toHaveBeenCalledOnce();
  });

  it('uses stronger distinct impacts for three and one survivors', async () => {
    const fake = fakeAudioContext();
    const engine = new EventSoundEngine(() => fake.context as unknown as AudioContext);
    await engine.unlock();
    engine.play('count-three');
    engine.play('count-one');
    expect(fake.context.createOscillator).toHaveBeenCalledTimes(4);
  });
});

