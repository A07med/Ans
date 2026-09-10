import { describe, expect, it } from 'vitest';
import { classifyReaction, compareWamdaResults, validSurvivorTarget } from './game-rules';

describe('Stay Alive round invariants', () => {
  it('accepts an exact lower survivor target', () => expect(validSurvivorTarget(487, 250)).toBe(true));
  it.each([[10,10],[10,11],[10,0],[1,1],[10,2.5]])('rejects invalid %s → %s transitions', (current,target) => expect(validSurvivorTarget(current,target)).toBe(false));
});

describe('Wamda attempt integrity', () => {
  it('persists a red tap as a false start', () => expect(classifyReaction('red',0,false)).toMatchObject({accepted:true,falseStart:true,valid:false}));
  it('rejects a second attempt', () => expect(classifyReaction('green',220,true)).toMatchObject({accepted:false,flags:['duplicate_attempt']}));
  it('accepts a positive green reaction', () => expect(classifyReaction('green',247,false)).toMatchObject({accepted:true,valid:true,flags:[]}));
  it.each([-1,0,10001,Number.NaN])('rejects malformed reaction %s', (reaction) => expect(classifyReaction('green',reaction,false).accepted).toBe(false));
  it('flags but does not silently discard an exceptional result', () => expect(classifyReaction('green',92,false)).toMatchObject({accepted:true,valid:true,flags:['reaction_under_120ms']}));
  it('uses attempt ID as a deterministic final tie-break', () => {
    const first = {attemptId:'a',participantName:'أ',reactionMs:200,flags:[],selected:false};
    const second = {...first,attemptId:'b'};
    expect([second,first].sort(compareWamdaResults).map((item) => item.attemptId)).toEqual(['a','b']);
  });
});
