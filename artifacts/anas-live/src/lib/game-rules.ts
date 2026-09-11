import type { WamdaSignal, WamdaResult } from './live-types';

export function validSurvivorTarget(current: number, target: number): boolean {
  return Number.isInteger(target) && target >= 1 && target < current;
}

export function classifyReaction(signal: WamdaSignal, reactionMs: number, alreadyAttempted: boolean) {
  if (alreadyAttempted) return { accepted: false, falseStart: false, valid: false, flags: ['duplicate_attempt'] };
  if (signal !== 'green') return { accepted: true, falseStart: true, valid: false, flags: [] as string[] };
  if (!Number.isFinite(reactionMs) || reactionMs <= 0 || reactionMs > 10_000) return { accepted: false, falseStart: false, valid: false, flags: ['invalid_reaction'] };
  return { accepted: true, falseStart: false, valid: true, flags: reactionMs < 120 ? ['reaction_under_120ms'] : [] };
}

export function compareWamdaResults(left: WamdaResult, right: WamdaResult): number {
  return left.reactionMs - right.reactionMs
    || (left.submissionReceivedAt ?? '').localeCompare(right.submissionReceivedAt ?? '')
    || left.attemptId.localeCompare(right.attemptId);
}
