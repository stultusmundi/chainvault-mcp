import { describe, it, expect } from 'vitest';
import { validatePassword } from './PasswordPrompt.js';

describe('validatePassword', () => {
  it('rejects empty password', () => {
    expect(validatePassword('')).toBe('Password cannot be empty');
  });

  it('accepts non-empty password', () => {
    expect(validatePassword('test')).toBe(null);
  });
});
