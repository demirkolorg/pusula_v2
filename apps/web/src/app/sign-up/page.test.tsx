import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: h.redirect,
}));

import SignUpRedirectPage from './page';

describe('<SignUpRedirectPage>', () => {
  it('redirects the legacy /sign-up route to the multi-mode card sign-up mode', () => {
    h.redirect.mockReset();
    SignUpRedirectPage();
    expect(h.redirect).toHaveBeenCalledWith('/sign-in?mode=sign-up');
  });
});
