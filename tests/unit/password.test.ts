import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@dossier/core';

describe('password hashing', () => {
  it('accepts the original password and rejects another', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(verifyPassword('correct horse battery staple', { passwordHash: hash })).toBe(true);
    expect(verifyPassword('wrong password', { passwordHash: hash })).toBe(false);
  });

  it('uses a fresh salt for every hash', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('supports the plain development password without throwing on length mismatch', () => {
    expect(verifyPassword('dev', { password: 'dev' })).toBe(true);
    expect(verifyPassword('devil', { password: 'dev' })).toBe(false);
    expect(verifyPassword('', { password: 'dev' })).toBe(false);
  });

  it('fails closed when no password is configured', () => {
    expect(verifyPassword('anything', {})).toBe(false);
    expect(verifyPassword('anything', { passwordHash: 'not-a-hash' })).toBe(false);
  });
});
