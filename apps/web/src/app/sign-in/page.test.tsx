import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  session: { data: null as unknown, isPending: false },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => h.searchParams,
  useRouter: () => ({ push: h.routerPush, replace: h.routerReplace, refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: h.signInEmail },
    signUp: { email: h.signUpEmail },
    requestPasswordReset: h.requestPasswordReset,
    resetPassword: h.resetPassword,
    useSession: () => h.session,
  },
}));

// `/sign-in` `(auth)` route group'unun dışında bağımsız bir route — kendi
// session guard'ını taşır; oturum varsa RedirectIfAuthenticated render edilir.
// Test odağı landing + çok modlu cam kart UI'sı olduğundan bu bileşeni hafif
// bir stub'la değiştiriyoruz (gerçek hâli tRPC client'a bağımlı).
vi.mock('./_components/redirect-if-authenticated', () => ({
  RedirectIfAuthenticated: () => <div data-testid="redirect-if-authenticated" />,
}));

import SignInPage from './page';

describe('<SignInPage>', () => {
  beforeEach(() => {
    h.searchParams = new URLSearchParams();
    h.routerPush.mockReset();
    h.routerReplace.mockReset();
    h.signInEmail.mockReset();
    h.signUpEmail.mockReset();
    h.requestPasswordReset.mockReset();
    h.resetPassword.mockReset();
    h.session = { data: null, isPending: false };
  });

  // ── Landing shell ────────────────────────────────────────────────────────

  it('renders the landing hero and the glass auth card in sign-in mode by default', async () => {
    render(<SignInPage />);

    // Hero `<h1>` erişilebilir adı sabit `heroHeadlineFull` ile bulunur —
    // dönen kelime saf görseldir, accessible name'i etkilemez.
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: strings.auth.landing.heroHeadlineFull,
      }),
    ).toBeInTheDocument();
    // Mod parametresiz `/sign-in` → kart doğrudan giriş modunda açılır:
    // giriş başlığı + e-posta/parola form alanları görünür (ara seçim ekranı yok).
    expect(
      screen.getByRole('heading', { level: 2, name: strings.auth.signIn.title }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(strings.auth.emailLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(strings.auth.passwordLabel)).toBeInTheDocument();
  });

  it('keeps the rotating headline accessible name stable across word changes', async () => {
    render(<SignInPage />);

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleName(strings.auth.landing.heroHeadlineFull);
    expect(heading.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders the three feature highlights as level-3 headings', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    for (const feature of strings.auth.landing.features) {
      expect(
        screen.getByRole('heading', { level: 3, name: feature.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(feature.text)).toBeInTheDocument();
    }

    // Başlık hiyerarşisi: 1× h1 (hero) + 4× h2 (cam kart + logo bulutu +
    // bildirim vitrini + istatistik sr-only) + 3× h3 (özellik) = 8.
    expect(screen.getAllByRole('heading')).toHaveLength(8);
  });

  it('renders the social proof strip', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    expect(screen.getByText(strings.auth.landing.socialProof.text)).toBeInTheDocument();
  });

  it('renders the logo cloud with its heading and brand wordmarks', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    expect(
      screen.getByRole('heading', { level: 2, name: strings.auth.landing.logoCloud.heading }),
    ).toBeInTheDocument();

    const firstBrand = screen.getByText(strings.auth.landing.logoCloud.brands[0]);
    expect(firstBrand.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders the notification showcase heading and description', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    const copy = strings.auth.landing.notificationShowcase;
    expect(
      screen.getByRole('heading', { level: 2, name: copy.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.description)).toBeInTheDocument();
  });

  it('keeps the notification panel and push bubble out of the accessibility tree', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    const copy = strings.auth.landing.notificationShowcase;
    const panelText = screen.getByText(copy.panel.items[0].text);
    expect(panelText.closest('[aria-hidden="true"]')).not.toBeNull();

    const pushBody = screen.getByText(copy.push.body);
    expect(pushBody.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders the stats strip metrics with their labels', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    expect(
      screen.getByRole('heading', { level: 2, name: strings.auth.landing.stats.srHeading }),
    ).toBeInTheDocument();

    for (const item of strings.auth.landing.stats.items) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it('renders the landing footer with privacy and sign-up links', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByText(`© ${new Date().getFullYear()} ${strings.common.appName}`),
    ).toBeInTheDocument();
    expect(
      within(footer).getByRole('link', { name: strings.auth.landing.footer.privacy }),
    ).toHaveAttribute('href', '/gizlilik');
    // "Kayıt ol" footer linki ayrı sayfaya değil — çok modlu kartın kayıt moduna.
    expect(
      within(footer).getByRole('link', { name: strings.auth.landing.footer.signUp }),
    ).toHaveAttribute('href', '/sign-in?mode=sign-up');
  });

  it('keeps the decorative board mockup out of the accessibility tree', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    expect(screen.getAllByRole('heading')).toHaveLength(8);

    const mockCardText = screen.getByText(
      strings.auth.landing.boardMockup.columns.inProgress.cards.first,
    );
    expect(mockCardText.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('keeps the floating activity pieces out of the accessibility tree', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    const floatingText = screen.getByText(strings.auth.landing.floatingActivity.cardMoved);
    expect(floatingText.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  // ── Mode rendering (URL query → card mode) ───────────────────────────────

  it('?mode=sign-up renders the sign-up form with a name field', async () => {
    h.searchParams = new URLSearchParams('mode=sign-up');
    render(<SignInPage />);

    expect(
      await screen.findByRole('heading', { level: 2, name: strings.auth.signUp.title }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(strings.auth.nameLabel)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.auth.signUp.submit }),
    ).toBeInTheDocument();
  });

  it('?mode=forgot renders the forgot-password form', async () => {
    h.searchParams = new URLSearchParams('mode=forgot');
    render(<SignInPage />);

    expect(
      await screen.findByRole('heading', { level: 2, name: strings.auth.forgotPassword.title }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(strings.auth.emailLabel)).toBeInTheDocument();
    // Şifre alanı yok — forgot modu yalnızca e-posta ister.
    expect(screen.queryByLabelText(strings.auth.passwordLabel)).not.toBeInTheDocument();
  });

  it('?mode=reset with a token renders the new-password form', async () => {
    h.searchParams = new URLSearchParams('mode=reset&token=tok_abc');
    render(<SignInPage />);

    expect(
      await screen.findByRole('heading', { level: 2, name: strings.auth.resetPassword.title }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(strings.auth.resetPassword.newPasswordLabel)).toBeInTheDocument();
    expect(
      screen.getByLabelText(strings.auth.resetPassword.confirmPasswordLabel),
    ).toBeInTheDocument();
  });

  it('?mode=reset without a token shows the "invalid link" state', async () => {
    h.searchParams = new URLSearchParams('mode=reset');
    render(<SignInPage />);

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: strings.auth.resetPassword.missingTokenTitle,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(strings.auth.resetPassword.missingTokenBody),
    ).toBeInTheDocument();
    // Yeni-parola alanı render edilmez — geçersiz token.
    expect(
      screen.queryByLabelText(strings.auth.resetPassword.newPasswordLabel),
    ).not.toBeInTheDocument();
  });

  it('?mode=reset with a whitespace-only token is treated as missing', async () => {
    h.searchParams = new URLSearchParams('mode=reset&token=%20%20');
    render(<SignInPage />);

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: strings.auth.resetPassword.missingTokenTitle,
      }),
    ).toBeInTheDocument();
  });

  it('falls back to sign-in mode for an unknown ?mode value', async () => {
    h.searchParams = new URLSearchParams('mode=bogus');
    render(<SignInPage />);

    expect(
      await screen.findByRole('heading', { level: 2, name: strings.auth.signIn.title }),
    ).toBeInTheDocument();
  });

  // ── Mode switching (in-card links update the URL) ────────────────────────

  it('the in-card "kayıt ol" link routes to ?mode=sign-up', async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.click(
      await screen.findByRole('button', { name: strings.auth.card.goToSignUp }),
    );
    expect(h.routerPush).toHaveBeenCalledWith('/sign-in?mode=sign-up');
  });

  it('the in-card "şifremi unuttun" link routes to ?mode=forgot', async () => {
    const user = userEvent.setup();
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);

    await user.click(screen.getByRole('button', { name: strings.auth.card.forgotPassword }));
    expect(h.routerPush).toHaveBeenCalledWith('/sign-in?mode=forgot');
  });

  it('the sign-up mode "giriş yap" link routes back to /sign-in', async () => {
    const user = userEvent.setup();
    h.searchParams = new URLSearchParams('mode=sign-up');
    render(<SignInPage />);

    await user.click(
      await screen.findByRole('button', { name: strings.auth.card.goToSignIn }),
    );
    expect(h.routerPush).toHaveBeenCalledWith('/sign-in');
  });

  it('the forgot mode "giriş ekranına dön" link routes back to /sign-in', async () => {
    const user = userEvent.setup();
    h.searchParams = new URLSearchParams('mode=forgot');
    render(<SignInPage />);

    await user.click(
      await screen.findByRole('button', { name: strings.auth.card.backToSignIn }),
    );
    expect(h.routerPush).toHaveBeenCalledWith('/sign-in');
  });

  // ── Auth actions per mode ────────────────────────────────────────────────

  it('submits valid credentials to authClient.signIn.email', async () => {
    h.signInEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(
      await screen.findByLabelText(strings.auth.emailLabel),
      'ada@pusula.dev',
    );
    await user.type(screen.getByLabelText(strings.auth.passwordLabel), 'sifre1234');
    await user.click(screen.getByRole('button', { name: strings.auth.signIn.submit }));

    await waitFor(() => {
      expect(h.signInEmail).toHaveBeenCalledWith({
        email: 'ada@pusula.dev',
        password: 'sifre1234',
      });
    });
  });

  it('surfaces a server error returned by sign-in', async () => {
    h.signInEmail.mockResolvedValue({ error: { message: 'Geçersiz kimlik bilgileri' } });
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(
      await screen.findByLabelText(strings.auth.emailLabel),
      'ada@pusula.dev',
    );
    await user.type(screen.getByLabelText(strings.auth.passwordLabel), 'sifre1234');
    await user.click(screen.getByRole('button', { name: strings.auth.signIn.submit }));

    expect(await screen.findByText('Geçersiz kimlik bilgileri')).toBeInTheDocument();
  });

  it('passes the verify-email callback URL to authClient.signUp.email', async () => {
    h.signUpEmail.mockResolvedValue({ error: null });
    h.searchParams = new URLSearchParams('mode=sign-up');
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(await screen.findByLabelText(strings.auth.nameLabel), 'Ada Lovelace');
    await user.type(screen.getByLabelText(strings.auth.emailLabel), 'ada@pusula.dev');
    await user.type(screen.getByLabelText(strings.auth.passwordLabel), 'sifre1234');
    await user.click(screen.getByRole('button', { name: strings.auth.signUp.submit }));

    await waitFor(() =>
      expect(h.signUpEmail).toHaveBeenCalledWith({
        name: 'Ada Lovelace',
        email: 'ada@pusula.dev',
        password: 'sifre1234',
        callbackURL: `${window.location.origin}/verify-email`,
      }),
    );
  });

  it('forgot mode: submits to requestPasswordReset with the multi-mode reset redirectTo', async () => {
    h.requestPasswordReset.mockResolvedValue({ error: null });
    h.searchParams = new URLSearchParams('mode=forgot');
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(
      await screen.findByLabelText(strings.auth.emailLabel),
      'aria@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: strings.auth.forgotPassword.submit }),
    );

    await waitFor(() =>
      // KRİTİK: redirectTo artık `/sign-in?mode=reset` — Better Auth `&token=…`
      // ekler, kullanıcı çok modlu kartın reset moduna gelir.
      expect(h.requestPasswordReset).toHaveBeenCalledWith({
        email: 'aria@example.com',
        redirectTo: `${window.location.origin}/sign-in?mode=reset`,
      }),
    );
  });

  it('forgot mode: shows the neutral success state after submitting', async () => {
    h.requestPasswordReset.mockResolvedValue({ error: null });
    h.searchParams = new URLSearchParams('mode=forgot');
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(
      await screen.findByLabelText(strings.auth.emailLabel),
      'aria@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: strings.auth.forgotPassword.submit }),
    );

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: strings.auth.forgotPassword.successTitle,
      }),
    ).toBeInTheDocument();
    // Gönderilen e-posta geri gösterilir; hesap-varlığı iddiası yapılmaz.
    expect(screen.getByText('aria@example.com')).toBeInTheDocument();
  });

  it('forgot mode: still shows the success state when the request fails (no oracle)', async () => {
    h.requestPasswordReset.mockRejectedValue(new Error('network'));
    h.searchParams = new URLSearchParams('mode=forgot');
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(
      await screen.findByLabelText(strings.auth.emailLabel),
      'ghost@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: strings.auth.forgotPassword.submit }),
    );

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: strings.auth.forgotPassword.successTitle,
      }),
    ).toBeInTheDocument();
  });

  it('reset mode: submits resetPassword with the token, shows the success state, and clears the token from the URL', async () => {
    h.resetPassword.mockResolvedValue({ error: null });
    h.searchParams = new URLSearchParams('mode=reset&token=tok_abc');
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(
      await screen.findByLabelText(strings.auth.resetPassword.newPasswordLabel),
      'newsecret123',
    );
    await user.type(
      screen.getByLabelText(strings.auth.resetPassword.confirmPasswordLabel),
      'newsecret123',
    );
    await user.click(
      screen.getByRole('button', { name: strings.auth.resetPassword.submit }),
    );

    await waitFor(() =>
      expect(h.resetPassword).toHaveBeenCalledWith({
        newPassword: 'newsecret123',
        token: 'tok_abc',
      }),
    );
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: strings.auth.resetPassword.successTitle,
      }),
    ).toBeInTheDocument();
    // GÜVENLİK: token tarayıcı geçmişinde kalmamalı — `router.replace` ile
    // temiz `?reset=1` URL'ine geçilmeli.
    await waitFor(() =>
      expect(h.routerReplace).toHaveBeenCalledWith('/sign-in?reset=1'),
    );
  });

  it('reset mode: blocks submit on a short / mismatched password', async () => {
    h.searchParams = new URLSearchParams('mode=reset&token=tok_abc');
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(
      await screen.findByLabelText(strings.auth.resetPassword.newPasswordLabel),
      'short',
    );
    await user.type(
      screen.getByLabelText(strings.auth.resetPassword.confirmPasswordLabel),
      'different',
    );
    await user.click(
      screen.getByRole('button', { name: strings.auth.resetPassword.submit }),
    );

    expect(h.resetPassword).not.toHaveBeenCalled();
    expect(screen.getByText('Parola en az 8 karakter olmalı')).toBeInTheDocument();
  });

  it('reset mode: surfaces a Better Auth token error inline', async () => {
    h.resetPassword.mockResolvedValue({ error: { message: 'Bu bağlantının süresi dolmuş.' } });
    h.searchParams = new URLSearchParams('mode=reset&token=tok_expired');
    const user = userEvent.setup();
    render(<SignInPage />);

    await user.type(
      await screen.findByLabelText(strings.auth.resetPassword.newPasswordLabel),
      'newsecret123',
    );
    await user.type(
      screen.getByLabelText(strings.auth.resetPassword.confirmPasswordLabel),
      'newsecret123',
    );
    await user.click(
      screen.getByRole('button', { name: strings.auth.resetPassword.submit }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu bağlantının süresi dolmuş.');
  });

  // ── Flash + session guard ────────────────────────────────────────────────

  it('does not show the reset flash by default', async () => {
    render(<SignInPage />);
    await screen.findByLabelText(strings.auth.emailLabel);
    expect(screen.queryByText(strings.auth.signIn.resetDone)).not.toBeInTheDocument();
  });

  it('shows the reset flash when ?reset=1 is present', async () => {
    h.searchParams = new URLSearchParams('reset=1');
    render(<SignInPage />);
    expect(await screen.findByText(strings.auth.signIn.resetDone)).toBeInTheDocument();
  });

  it('hands off to RedirectIfAuthenticated when a session already exists', () => {
    h.session = { data: { user: { id: 'u1' } }, isPending: false };
    render(<SignInPage />);
    expect(screen.getByTestId('redirect-if-authenticated')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: strings.auth.signIn.title }),
    ).not.toBeInTheDocument();
  });
});
