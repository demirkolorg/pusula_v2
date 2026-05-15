import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  forgotPasswordInput,
  passwordSchema,
  resetPasswordInput,
  signInInput,
  signUpInput,
} from './auth';

describe('emailSchema', () => {
  it('trims and lowercases a valid email', () => {
    expect(emailSchema.parse('  Aria@Example.COM  ')).toBe('aria@example.com');
  });

  it('rejects malformed emails', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse('').success).toBe(false);
    expect(emailSchema.safeParse('a@b').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('requires 8..128 chars', () => {
    expect(passwordSchema.parse('secret12').length).toBe(8);
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});

describe('signInInput', () => {
  it('accepts a normalized email + password', () => {
    expect(signInInput.parse({ email: ' User@Test.com ', password: 'secret12' })).toEqual({
      email: 'user@test.com',
      password: 'secret12',
    });
    expect(signInInput.safeParse({ email: 'bad', password: 'secret12' }).success).toBe(false);
    expect(signInInput.safeParse({ email: 'user@test.com', password: 'short' }).success).toBe(
      false,
    );
  });
});

describe('signUpInput', () => {
  it('accepts name + email + password and trims the name', () => {
    expect(
      signUpInput.parse({ name: '  Aria  ', email: 'Aria@Test.com', password: 'secret12' }),
    ).toEqual({ name: 'Aria', email: 'aria@test.com', password: 'secret12' });
    expect(
      signUpInput.safeParse({ name: '', email: 'a@b.com', password: 'secret12' }).success,
    ).toBe(false);
  });
});

describe('forgotPasswordInput', () => {
  it('normalizes and validates the email', () => {
    expect(forgotPasswordInput.parse({ email: '  Aria@Example.COM ' })).toEqual({
      email: 'aria@example.com',
    });
  });

  it('rejects a missing or malformed email', () => {
    expect(forgotPasswordInput.safeParse({ email: '' }).success).toBe(false);
    expect(forgotPasswordInput.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(forgotPasswordInput.safeParse({}).success).toBe(false);
  });
});

describe('resetPasswordInput', () => {
  it('requires a non-empty token and an 8..128 new password', () => {
    expect(resetPasswordInput.parse({ token: 'tok_abc', newPassword: 'newsecret1' })).toEqual({
      token: 'tok_abc',
      newPassword: 'newsecret1',
    });
  });

  it('rejects an empty token', () => {
    expect(resetPasswordInput.safeParse({ token: '', newPassword: 'newsecret1' }).success).toBe(
      false,
    );
  });

  it('rejects a too-short new password', () => {
    expect(resetPasswordInput.safeParse({ token: 'tok_abc', newPassword: 'short' }).success).toBe(
      false,
    );
  });
});
