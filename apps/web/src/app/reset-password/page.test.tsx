import { describe, expect, it, vi } from 'vitest';

// `redirect()` Next.js'te bir hata fırlatarak render'ı keser; testte onu
// yakalanabilir bir spy ile değiştiriyoruz (gerçek throw davranışı render
// pipeline'ına özgüdür, burada yalnızca hedef URL'i doğrularız).
const h = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: h.redirect,
}));

import ResetPasswordRedirectPage from './page';

describe('<ResetPasswordRedirectPage>', () => {
  it('forwards the reset token to /sign-in?mode=reset&token=…', async () => {
    h.redirect.mockReset();
    await ResetPasswordRedirectPage({
      searchParams: Promise.resolve({ token: 'tok_abc' }),
    });
    // KRİTİK: eskiden gönderilmiş e-posta linkleri (`?token=`, ~1 saat geçerli)
    // çok modlu kartın reset moduna token'ıyla birlikte taşınmalı.
    expect(h.redirect).toHaveBeenCalledWith('/sign-in?mode=reset&token=tok_abc');
  });

  it('URL-encodes a token with special characters', async () => {
    h.redirect.mockReset();
    await ResetPasswordRedirectPage({
      searchParams: Promise.resolve({ token: 'a b/c+d' }),
    });
    expect(h.redirect).toHaveBeenCalledWith('/sign-in?mode=reset&token=a%20b%2Fc%2Bd');
  });

  it('handles a repeated token param by taking the first value', async () => {
    h.redirect.mockReset();
    await ResetPasswordRedirectPage({
      searchParams: Promise.resolve({ token: ['tok_first', 'tok_second'] }),
    });
    expect(h.redirect).toHaveBeenCalledWith('/sign-in?mode=reset&token=tok_first');
  });

  it('without a token redirects to a plain ?mode=reset', async () => {
    h.redirect.mockReset();
    await ResetPasswordRedirectPage({
      searchParams: Promise.resolve({}),
    });
    expect(h.redirect).toHaveBeenCalledWith('/sign-in?mode=reset');
  });

  it('treats a whitespace-only token as missing', async () => {
    h.redirect.mockReset();
    await ResetPasswordRedirectPage({
      searchParams: Promise.resolve({ token: '   ' }),
    });
    expect(h.redirect).toHaveBeenCalledWith('/sign-in?mode=reset');
  });
});
