import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  adminActionErrorMessage,
  canClearRegistrations,
  CLEAR_REGISTRATIONS_PHRASE,
  countAnimationDuration,
  countAtProgress,
  participantTransitionCues,
  shouldAnimateCount,
  soundControlState,
  stayAlivePhase,
  stayAliveQuickTargets,
  stayAliveStartDisabledReason,
  RESET_GAMES_CONFIRMATION,
  wamdaResultCopy,
} from './event-polish';
import type { LiveState, ParticipantView } from './live-types';

const state = (overrides: Partial<LiveState> = {}): LiveState => ({
  registrationOpen: true,
  currentExperience: 'lobby',
  activeGame: null,
  activeGameSessionId: null,
  activeSignalId: null,
  gameStatus: 'idle',
  stageMode: 'lobby',
  registered: 42,
  connected: 0,
  stayAliveRemaining: 0,
  stayAliveRound: 0,
  stayAliveWinner: null,
  wamdaReady: 42,
  wamdaResponses: 0,
  wamdaFalseStarts: 0,
  wamdaValid: 0,
  wamdaFlagged: 0,
  wamdaFastestMs: null,
  wamdaWinner: null,
  wamdaSignal: 'idle',
  updatedAt: '2026-09-11T00:00:00Z',
  ...overrides,
});

const participant = (overrides: Partial<ParticipantView> = {}): ParticipantView => ({
  participantId: 'participant-1',
  name: 'مشارك',
  stayAliveStatus: null,
  wamdaAttempt: 'none',
  reactionMs: null,
  wamdaRank: null,
  wamdaTotalRanked: null,
  wamdaIsWinner: null,
  winnerRevealed: false,
  ...overrides,
});

describe('Wamda participant result privacy and copy', () => {
  it('keeps ranking secret before reveal', () => expect(wamdaResultCopy(participant({ wamdaAttempt: 'valid', reactionMs: 421 }))).toMatchObject({ kind: 'pending', title: 'تم تسجيل وقتك', secondary: 'الترتيب ما زال سرًا' }));
  it('shows the winning participant after reveal', () => expect(wamdaResultCopy(participant({ wamdaAttempt: 'valid', reactionMs: 316, winnerRevealed: true, wamdaRank: 1, wamdaTotalRanked: 37, wamdaIsWinner: true }))).toEqual({ kind: 'winner', title: 'أنت أسرع وَمْضَة 🎉', primary: 'المركز الأول', secondary: '0.316 ثانية' }));
  it('shows a nonwinner rank after reveal', () => expect(wamdaResultCopy(participant({ wamdaAttempt: 'valid', reactionMs: 421, winnerRevealed: true, wamdaRank: 4, wamdaTotalRanked: 37, wamdaIsWinner: false }))).toMatchObject({ kind: 'ranked', title: 'ترتيبك #4 من 37', primary: 'وقتك 0.421 ثانية' }));
  it('never gives a false start a numeric rank', () => expect(wamdaResultCopy(participant({ wamdaAttempt: 'false_start', winnerRevealed: true, wamdaRank: null }))).toEqual({ kind: 'false-start', title: 'استعجلت! 😭', primary: 'ضغطت قبل الومضة', secondary: null }));
});

describe('Stay Alive stage presentation', () => {
  it('lands exactly on the authoritative target', () => expect(countAtProgress(20, 10, 1)).toBe(10));
  it('keeps a normal collapse between one and two seconds', () => expect(countAnimationDuration(20, 10)).toBe(1_100));
  it('caps massive collapses and skips visual frames', () => {
    expect(countAnimationDuration(500, 250)).toBe(1_800);
    const frames = new Set(Array.from({ length: 61 }, (_, index) => countAtProgress(500, 250, index / 60)));
    expect(frames.size).toBeLessThan(100);
    expect(frames.has(250)).toBe(true);
  });
  it('honors reduced motion by disabling interpolation', () => expect(shouldAnimateCount(20, 10, true)).toBe(false));
  it('provides every requested operator quick target', () => expect(stayAliveQuickTargets(42).map(({ label }) => label)).toEqual(['إبقاء 75%', 'إبقاء 50%', 'إبقاء 25%', 'آخر 20', 'آخر 10', 'آخر 5', 'آخر 3', 'فائز واحد']));
  it('keeps invalid quick targets visible for state-aware disabling', () => expect(stayAliveQuickTargets(3)).toHaveLength(8));
});

describe('event transition audio', () => {
  it('fires green exactly once across a duplicate refresh', () => {
    const red = state({ currentExperience: 'wamda', activeGame: 'wamda', wamdaSignal: 'red' });
    const green = state({ currentExperience: 'wamda', activeGame: 'wamda', wamdaSignal: 'green' });
    const view = participant();
    expect(participantTransitionCues(red, green, view, view)).toContain('wamda-start');
    expect(participantTransitionCues(green, green, view, view)).not.toContain('wamda-start');
  });
  it('does not replay a result cue on polling refresh', () => {
    const before = participant();
    const after = participant({ wamdaAttempt: 'valid', reactionMs: 250 });
    expect(participantTransitionCues(state(), state(), before, after)).toContain('valid-tap');
    expect(participantTransitionCues(state(), state(), after, after)).toEqual([]);
  });
  it('plays a Stay Alive winner cue even when participant state arrives after event reveal', () => {
    const revealed = state({ activeGame: 'stay_alive', currentExperience: 'stay_alive', gameStatus: 'revealed' });
    const before = participant({ stayAliveStatus: 'finalist' });
    const winner = participant({ stayAliveStatus: 'winner' });
    expect(participantTransitionCues(revealed, revealed, before, winner)).toContain('winner');
    expect(participantTransitionCues(revealed, revealed, winner, winner)).toEqual([]);
  });
  it('separates enable, playing, and muted controls', () => {
    expect(soundControlState('absent', false)).toBe('enable');
    expect(soundControlState('suspended', false)).toBe('resume');
    expect(soundControlState('running', false)).toBe('playing');
    expect(soundControlState('running', true)).toBe('muted');
  });
});

describe('guided admin safety', () => {
  it('covers not started, active, final three, final one, selected, and revealed', () => {
    expect(stayAlivePhase(state(), false)).toBe('not-started');
    expect(stayAlivePhase(state({ activeGame: 'stay_alive', stayAliveRemaining: 20, gameStatus: 'live' }), false)).toBe('active');
    expect(stayAlivePhase(state({ activeGame: 'stay_alive', stayAliveRemaining: 3, gameStatus: 'selection' }), false)).toBe('final-three');
    expect(stayAlivePhase(state({ activeGame: 'stay_alive', stayAliveRemaining: 1, gameStatus: 'selection' }), false)).toBe('final-one');
    expect(stayAlivePhase(state({ activeGame: 'stay_alive', stayAliveRemaining: 1, gameStatus: 'selection' }), true)).toBe('selected');
    expect(stayAlivePhase(state({ activeGame: 'stay_alive', stayAliveRemaining: 1, gameStatus: 'revealed' }), true)).toBe('revealed');
  });
  it('requires the exact destructive confirmation phrase', () => {
    expect(canClearRegistrations('DELETE REGISTRATION')).toBe(false);
    expect(canClearRegistrations('DELETE REGISTRATIONS')).toBe(true);
  });
  it('disables a zero-participant start with the required reason', () => {
    expect(stayAliveStartDisabledReason(0)).toBe('سجّل مشاركًا واحدًا على الأقل لبدء اللعبة');
    expect(stayAliveStartDisabledReason(1)).toBeNull();
  });
  it('keeps both destructive confirmations explicit', () => {
    expect(CLEAR_REGISTRATIONS_PHRASE).toBe('DELETE REGISTRATIONS');
    expect(RESET_GAMES_CONFIRMATION).toContain('إبقاء التسجيلات');
  });
  it('turns PostgREST safe-update failures into a useful Arabic message', () => {
    expect(adminActionErrorMessage({ code: '21000', message: 'UPDATE requires a WHERE clause' })).toContain('حماية قاعدة البيانات');
  });
  it('has no duplicate lower winner wordmark in either stage reveal', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(appSource).not.toContain('winner-delay mt-4 w-[clamp(9rem,16vw,18rem)]');
    expect(appSource).not.toContain('mt-7 w-[clamp(12rem,24vw,28rem)]');
  });
});
