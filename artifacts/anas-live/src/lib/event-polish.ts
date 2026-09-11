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
  return [
    { label: 'إبقاء 75%', value: Math.floor(remaining * 0.75) },
    { label: 'إبقاء 50%', value: Math.floor(remaining * 0.5) },
    { label: 'إبقاء 25%', value: Math.floor(remaining * 0.25) },
    { label: 'آخر 20', value: 20 },
    { label: 'آخر 10', value: 10 },
    { label: 'آخر 5', value: 5 },
    { label: 'آخر 3', value: 3 },
    { label: 'فائز واحد', value: 1 },
  ];
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

export type SoundContextState = 'absent' | 'suspended' | 'running';

export function soundControlState(contextState: SoundContextState, muted: boolean): 'enable' | 'resume' | 'playing' | 'muted' {
  if (contextState === 'absent') return 'enable';
  if (contextState === 'suspended') return 'resume';
  return muted ? 'muted' : 'playing';
}

export function adminActionErrorMessage(cause: unknown): string {
  const value = cause as { code?: unknown; message?: unknown } | null;
  const code = typeof value?.code === 'string' ? value.code : '';
  const message = typeof value?.message === 'string' ? value.message : '';
  if (code === '21000' || message.includes('requires a WHERE clause')) {
    return 'تعذّر حذف التسجيلات بسبب حماية قاعدة البيانات. لم تُحذف أي تسجيلات.';
  }
  if (code === '42501' || message.includes('admin_required')) return 'هذه العملية تتطلب حساب مشرف مخوّل.';
  if (message.includes('no_registered_participants')) return 'سجّل مشاركًا واحدًا على الأقل لبدء اللعبة.';
  if (message.includes('exactly_one_survivor_required')) return 'يجب أن يبقى مشارك واحد فقط قبل اختيار الفائز.';
  if (message.includes('winner_not_selected')) return 'اختر الفائز أولًا قبل الكشف.';
  if (message.includes('invalid_survivor_target')) return 'العدد يجب أن يكون أقل من الباقين وأكبر من صفر.';
  return message ? `تعذّر تنفيذ الأمر: ${message}` : 'تعذّر تنفيذ الأمر. حاول مرة أخرى.';
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
  const stayAliveWinner = participant.stayAliveStatus === 'winner' && state.gameStatus === 'revealed' && (
    previousState.gameStatus !== 'revealed' || previousParticipant.stayAliveStatus !== 'winner'
  );
  if (newlyRevealedWinner || stayAliveWinner) cues.push('winner');
  return cues;
}
