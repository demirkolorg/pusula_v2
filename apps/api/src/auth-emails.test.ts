/**
 * Unit tests for the transactional auth-email helper (`./auth-emails.ts`).
 *
 * We mock both `./env` (so we control `RESEND_API_KEY` / `EMAIL_FROM` without a
 * real `.env`) and `resend` (so nothing leaves the process). The mocked `env` is
 * a mutable object; tests flip `RESEND_API_KEY` and call
 * `__resetResendClientForTests()` so the lazily-built Resend client picks it up.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv: {
  NODE_ENV: 'development' | 'test' | 'production';
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  EMAIL_DEV_OVERRIDE?: string;
} = {
  NODE_ENV: 'development',
  RESEND_API_KEY: undefined,
  EMAIL_FROM: 'Pusula <no-reply@pusula.test>',
  EMAIL_DEV_OVERRIDE: undefined,
};
vi.mock('./env', () => ({
  get env() {
    return mockEnv;
  },
}));

const sendMock = vi.fn<(args: unknown) => Promise<{ data: unknown; error: unknown }>>();
vi.mock('resend', () => ({
  // The real `Resend` is a class; the helper does `new Resend(key)`, so the mock
  // must be constructable.
  Resend: class {
    emails = { send: sendMock };
  },
}));

const {
  __resetResendClientForTests,
  resetPasswordEmailHtml,
  resetPasswordEmailText,
  resolveRecipient,
  sendResetPasswordEmail,
} = await import('./auth-emails');

const RESET_URL =
  'http://localhost:3000/reset-password?token=tok_abc&callbackURL=%2Freset-password';

afterEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });
  mockEnv.RESEND_API_KEY = undefined;
  mockEnv.NODE_ENV = 'development';
  mockEnv.EMAIL_DEV_OVERRIDE = undefined;
  __resetResendClientForTests();
  vi.restoreAllMocks();
});

describe('resetPasswordEmailText', () => {
  it('includes the reset URL and a Turkish expiry note', () => {
    const text = resetPasswordEmailText(RESET_URL);
    expect(text).toContain(RESET_URL);
    expect(text).toMatch(/1 saat/);
    expect(text).toMatch(/yok say/i);
  });
});

describe('resetPasswordEmailHtml', () => {
  it('renders an anchor to the reset URL and escapes it', () => {
    const html = resetPasswordEmailHtml(RESET_URL);
    // `&` in the query string must be HTML-escaped inside the href.
    expect(html).toContain(
      'href="http://localhost:3000/reset-password?token=tok_abc&amp;callbackURL=%2Freset-password"',
    );
    expect(html).toContain('Parolamı sıfırla');
    expect(html).not.toContain('callbackURL=%2Freset-password"&'); // sanity: no raw unescaped break
  });

  it('escapes angle brackets / quotes in the URL', () => {
    const html = resetPasswordEmailHtml('http://x/"><script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('sendResetPasswordEmail — no RESEND_API_KEY (best-effort)', () => {
  it('in dev: does not throw and logs the link instead of mailing it', async () => {
    mockEnv.NODE_ENV = 'development';
    __resetResendClientForTests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      sendResetPasswordEmail({ to: 'aria@test.com', url: RESET_URL }),
    ).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY'), RESET_URL);
  });

  it('in production: does not throw and never logs the token-bearing URL', async () => {
    mockEnv.NODE_ENV = 'production';
    __resetResendClientForTests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      sendResetPasswordEmail({ to: 'aria@test.com', url: RESET_URL }),
    ).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    // The warning is logged, but it must not contain the reset URL (which carries
    // the one-time token in its query string).
    for (const call of warn.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain(RESET_URL);
        expect(String(arg)).not.toContain('tok_abc');
      }
    }
  });
});

describe('sendResetPasswordEmail — with RESEND_API_KEY', () => {
  it('sends the email via Resend with from/to/subject/html/text', async () => {
    mockEnv.RESEND_API_KEY = 're_test_key';
    __resetResendClientForTests();
    sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await sendResetPasswordEmail({ to: 'aria@test.com', url: RESET_URL });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.to).toBe('aria@test.com');
    expect(arg.subject).toMatch(/Şifre sıfırlama/);
    expect(String(arg.html)).toContain('reset-password');
    expect(String(arg.text)).toContain(RESET_URL);
    expect(typeof arg.from).toBe('string');
  });

  it('does not throw when Resend returns an error payload', async () => {
    mockEnv.RESEND_API_KEY = 're_test_key';
    __resetResendClientForTests();
    sendMock.mockResolvedValue({ data: null, error: { name: 'rate_limit', message: 'slow down' } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      sendResetPasswordEmail({ to: 'aria@test.com', url: RESET_URL }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not throw when the Resend SDK call rejects', async () => {
    mockEnv.RESEND_API_KEY = 're_test_key';
    __resetResendClientForTests();
    sendMock.mockRejectedValue(new Error('network down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      sendResetPasswordEmail({ to: 'aria@test.com', url: RESET_URL }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('EMAIL_DEV_OVERRIDE (dev-only recipient override)', () => {
  it('resolveRecipient: in dev with the override set, returns the override and logs a notice', () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.EMAIL_DEV_OVERRIDE = 'dev@example.com';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(resolveRecipient('aria@test.com')).toBe('dev@example.com');
    expect(warn).toHaveBeenCalledTimes(1);
    // The notice may mention the real recipient — fine in dev.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dev@example.com'));
  });

  it('resolveRecipient: in production the override is ignored', () => {
    mockEnv.NODE_ENV = 'production';
    mockEnv.EMAIL_DEV_OVERRIDE = 'dev@example.com';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(resolveRecipient('aria@test.com')).toBe('aria@test.com');
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolveRecipient: no override set → returns the real recipient unchanged', () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.EMAIL_DEV_OVERRIDE = undefined;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(resolveRecipient('aria@test.com')).toBe('aria@test.com');
    expect(warn).not.toHaveBeenCalled();
  });

  it('sendResetPasswordEmail: in dev with the override set, mails the override instead of the real recipient', async () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.RESEND_API_KEY = 're_test_key';
    mockEnv.EMAIL_DEV_OVERRIDE = 'dev@example.com';
    __resetResendClientForTests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await sendResetPasswordEmail({ to: 'aria@test.com', url: RESET_URL });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.to).toBe('dev@example.com');
    expect(arg.to).not.toBe('aria@test.com');
    expect(warn).toHaveBeenCalled();
  });

  it('sendResetPasswordEmail: in production the override is ignored — mails the real recipient', async () => {
    mockEnv.NODE_ENV = 'production';
    mockEnv.RESEND_API_KEY = 're_test_key';
    mockEnv.EMAIL_DEV_OVERRIDE = 'dev@example.com';
    __resetResendClientForTests();
    sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await sendResetPasswordEmail({ to: 'aria@test.com', url: RESET_URL });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.to).toBe('aria@test.com');
  });

  it('sendResetPasswordEmail: no override → mails the real recipient (existing behavior)', async () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.RESEND_API_KEY = 're_test_key';
    mockEnv.EMAIL_DEV_OVERRIDE = undefined;
    __resetResendClientForTests();
    sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await sendResetPasswordEmail({ to: 'aria@test.com', url: RESET_URL });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.to).toBe('aria@test.com');
  });
});
