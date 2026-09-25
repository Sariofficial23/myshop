import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(hash.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(hash).not.toContain('s3cret-pass');
    await expect(verifyPassword('s3cret-pass', hash)).resolves.toBe(true);
    await expect(verifyPassword('S3cret-pass', hash)).resolves.toBe(false);
  });

  it('uses a random salt and survives broken hashes', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
    await expect(verifyPassword('x', null)).resolves.toBe(false);
    await expect(verifyPassword('x', 'garbage')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$1$1$1$AA==$AA==')).resolves.toBe(false);
  });
});
