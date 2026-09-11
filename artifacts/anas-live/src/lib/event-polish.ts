import type { LiveState, ParticipantView } from './live-types';

export const CLEAR_REGISTRATIONS_PHRASE = 'DELETE REGISTRATIONS';
export const RESET_GAMES_CONFIRMATION = 'إعادة ضبط جميع حالات الألعاب مع إبقاء التسجيلات؟';

export type StayAlivePhase = 'not-started' | 'active' | 'final-three' | 'final-one' | 'selected' | 'revealed';

export function stayAlivePhase(state: LiveState, winnerSelected: boolean): StayAlivePhase {
  if (state.activeGame !== 'stay_alive') return 'not-started';
  if (state.gameStatus === 'revealed') return 'revealed';
  if (winnerSelected) return 'selected';
  if (state.stayAliveRemaining === 1) return 'final-one';
  if (state.stayAliveRemaining <= 3 && state.stayAliveRemaining > 1) return 'final-three';
  return 'active';
}

export function stayAliveStartDisabledReason(registered: number): string | null {
  return registered === 0 ? 'سجّل مشاركًا واحدًا على الأقل لبدء اللعبة' : null;
}

export function stayAliveQuickTargets(remaining: number): Array<{ label: string; value: number }> {
  const candidates = [
    { label: '75%', value: Math.floor(remaining * 0.75) },
    { label: '50%', value: Math.floor(remaining * 0.5) },
    { label: '25%', value: Math.floor(remaining * 0.25) },
    { label: 'آخر 10', value: 10 },
    { label: 'آخر 5', value: 5 },
    { label: 'آخر 3', value: 3 },
  ];
  return candidates.filter(({ value }) => value >= 1 && value < remaining);
}

export function countAnimationDuration(from: number, to: number): number {
  if (to >= from) return 0;
  return Math.min(1_800, Math.max(1_000, (from - to) * 110));
}

export function shouldAnimateCount(from: number, to: number, reducedMotion: boolean): boolean {
  return !reducedMotion && to < from;
}

export function countAtProgress(from: number, to: number, progress: number): number {
  if (to >= from || progress >= 1) return to;
  if (progress <= 0) return from;
  const eased = 1 - Math.pow(1 - progress, 3);
  return Math.max(to, from - Math.floor((from - to) * eased));
}

export function wamdaResultCopy(participant: ParticipantView) {
  if (participant.wamdaAttempt === 'false_start') {
    return { kind: 'false-start' as const, title: 'استعجلت! 😭', primary: 'ضغطت قبل الومضة', secondary: null };
  }
  if (participant.wamdaAttempt !== 'valid' && participant.wamdaAttempt !== 'flagged') return null;
  const time = `${((participant.reactionMs ?? 0) / 1_000).toFixed(3)} ثانية`;
  if (!participant.winnerRevealed) {
    return { kind: 'pending' as const, title: 'تم تسجيل وقتك', primary: time, secondary: 'الترتيب ما زال سرًا' };
  }
  if (participant.wamdaIsWinner) {
    return { kind: 'winner' as const, title: 'أنت أسرع وَمْضَة 🎉', primary: 'المركز الأول', secondary: time };
  }
  return {
    kind: 'ranked' as const,
    title: `ترتيبك #${participant.wamdaRank ?? '—'} من ${participant.wamdaTotalRanked ?? '—'}`,
    primary: `وقتك ${time}`,
    secondary: null,
  };
}

export type SoundCue = 'wamda-start' | 'false-start' | 'valid-tap' | 'positive' | 'eliminated' | 'winner';

export function soundControlState(unlocked: boolean, muted: boolean): 'enable' | 'playing' | 'muted' {
  if (!unlocked) return 'enable';
  return muted ? 'muted' : 'playing';
}

export function canClearRegistrations(typedPhrase: string): boolean {
  return typedPhrase === CLEAR_REGISTRATIONS_PHRASE;
}

export function participantTransitionCues(
  previousState: LiveState | null,
  state: LiveState,
  previousParticipant: ParticipantView | null,
  participant: ParticipantView,
): SoundCue[] {
  if (!previousState || !previousParticipant) return [];
  const cues: SoundCue[] = [];
  if (previousState.wamdaSignal === 'red' && state.wamdaSignal === 'green') cues.push('wamda-start');
  if (previousParticipant.wamdaAttempt === 'none' && participant.wamdaAttempt === 'false_start') cues.push('false-start');
  if (previousParticipant.wamdaAttempt === 'none' && (participant.wamdaAttempt === 'valid' || participant.wamdaAttempt === 'flagged')) cues.push('valid-tap');
  if (previousParticipant.stayAliveStatus !== participant.stayAliveStatus) {
    if (participant.stayAliveStatus === 'eliminated') cues.push('eliminated');
    if (participant.stayAliveStatus === 'alive' || participant.stayAliveStatus === 'finalist') cues.push('positive');
  }
  const newlyRevealedWinner = !previousParticipant.winnerRevealed && participant.winnerRevealed && participant.wamdaIsWinner;
  const stayAliveWinner = previousState.gameStatus !== 'revealed' && state.gameStatus === 'revealed' && participant.stayAliveStatus === 'winner';
  if (newlyRevealedWinner || stayAliveWinner) cues.push('winner');
  return cues;
}
