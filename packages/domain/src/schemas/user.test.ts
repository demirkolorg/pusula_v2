import { describe, expect, it } from 'vitest';
import {
  changePasswordInput,
  deleteAccountInput,
  updateProfileInput,
  userImageUrlSchema,
  userNameSchema,
} from './user';

describe('userNameSchema', () => {
  it('trims and requires a non-empty name within 80 chars', () => {
    expect(userNameSchema.parse('  Aria Chen  ')).toBe('Aria Chen');
    expect(userNameSchema.safeParse('').success).toBe(false);
    expect(userNameSchema.safeParse('   ').success).toBe(false);
    expect(userNameSchema.safeParse('x'.repeat(81)).success).toBe(false);
  });
});

describe('userImageUrlSchema', () => {
  it('accepts http(s) URLs', () => {
    expect(userImageUrlSchema.parse('https://cdn.example/avatar.png')).toBe(
      'https://cdn.example/avatar.png',
    );
    expect(userImageUrlSchema.parse(' http://example.com/a.jpg ')).toBe('http://example.com/a.jpg');
  });

  it('rejects non-URLs', () => {
    expect(userImageUrlSchema.safeParse('not-a-url').success).toBe(false);
    expect(userImageUrlSchema.safeParse('').success).toBe(false);
  });

  it('rejects dangerous URL schemes', () => {
    expect(userImageUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(userImageUrlSchema.safeParse('data:text/html;base64,PHN2Zz4=').success).toBe(false);
    expect(userImageUrlSchema.safeParse('file:///etc/passwd').success).toBe(false);
    expect(userImageUrlSchema.safeParse('vbscript:msgbox(1)').success).toBe(false);
  });
});

describe('updateProfileInput', () => {
  it('accepts a name plus a URL or null image', () => {
    expect(updateProfileInput.parse({ name: 'Aria', image: null })).toEqual({
      name: 'Aria',
      image: null,
    });
    expect(updateProfileInput.parse({ name: 'Aria', image: 'https://x.test/a.png' })).toEqual({
      name: 'Aria',
      image: 'https://x.test/a.png',
    });
  });

  it('rejects a bad image and a missing name', () => {
    expect(updateProfileInput.safeParse({ name: 'Aria', image: 'javascript:1' }).success).toBe(
      false,
    );
    expect(updateProfileInput.safeParse({ name: '', image: null }).success).toBe(false);
  });
});

describe('changePasswordInput', () => {
  it('requires a current password and an 8..128 new password that differs', () => {
    expect(
      changePasswordInput.parse({ currentPassword: 'oldsecret', newPassword: 'newsecret1' }),
    ).toEqual({ currentPassword: 'oldsecret', newPassword: 'newsecret1' });
    expect(
      changePasswordInput.safeParse({ currentPassword: '', newPassword: 'newsecret1' }).success,
    ).toBe(false);
    expect(
      changePasswordInput.safeParse({ currentPassword: 'oldsecret', newPassword: 'short' }).success,
    ).toBe(false);
    expect(
      changePasswordInput.safeParse({ currentPassword: 'samesecret', newPassword: 'samesecret' })
        .success,
    ).toBe(false);
  });
});

describe('deleteAccountInput', () => {
  it('requires a non-empty password', () => {
    expect(deleteAccountInput.parse({ password: 'secret' })).toEqual({ password: 'secret' });
    expect(deleteAccountInput.safeParse({ password: '' }).success).toBe(false);
  });
});
