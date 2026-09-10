import { describe, expect, it } from 'vitest';
import { normalizeOmanPhone, validateDisplayName } from './phone';

describe('normalizeOmanPhone', () => {
  it.each([
    ['91234567', '+96891234567'],
    ['+968 9123 4567', '+96891234567'],
    ['96891234567', '+96891234567'],
    ['7912-3456', '+96879123456'],
  ])('normalizes %s', (input, expected) => expect(normalizeOmanPhone(input)).toBe(expected));

  it.each(['', '12345678', '+971501234567', '9123456', '912345678'])('rejects %s', (input) => {
    expect(normalizeOmanPhone(input)).toBeNull();
  });
});

describe('validateDisplayName', () => {
  it('trims and collapses whitespace', () => expect(validateDisplayName('  أحمد   علي ')).toBe('أحمد علي'));
  it('rejects short and excessively long names', () => {
    expect(validateDisplayName('أ')).toBeNull();
    expect(validateDisplayName('x'.repeat(81))).toBeNull();
  });
});
