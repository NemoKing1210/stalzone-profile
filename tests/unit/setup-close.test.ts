import { describe, expect, it } from 'vitest';
import { shouldCloseSetup } from '../../app/utils/setup';

describe('shouldCloseSetup', () => {
  it('keeps the wizard open right after the character is created here', () => {
    expect(shouldCloseSetup({ needsSetup: false, createdHere: true })).toBe(false);
  });

  it('closes the wizard for an owner who arrives with a character', () => {
    expect(shouldCloseSetup({ needsSetup: false, createdHere: false })).toBe(true);
    expect(shouldCloseSetup({ needsSetup: true, createdHere: false })).toBe(false);
  });
});
