import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: h.redirect,
}));

import ForgotPasswordRedirectPage from './page';

describe('<ForgotPasswordRedirectPage>', () => {
  it('redirects the legacy /forgot-password route to the multi-mode card forgot mode', () => {
    h.redirect.mockReset();
    ForgotPasswordRedirectPage();
    expect(h.redirect).toHaveBeenCalledWith('/sign-in?mode=forgot');
  });
});
