# Signup Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add soft signup email verification with Better Auth `emailVerification` and Resend, while allowing unverified users to continue onboarding with a persistent resend banner.

**Architecture:** Better Auth owns verification token creation and `/api/auth/verify-email`; the API only wires `emailVerification.sendVerificationEmail` to the existing Resend helper. The web app passes a web-origin callback URL during sign-up and manual resend, shows a signed-in banner when `session.user.emailVerified === false`, and exposes a public `/verify-email` callback page outside the `(auth)` route group so existing sessions are not redirected away before seeing the result.

**Tech Stack:** TypeScript, Better Auth 1.6, Resend 6, Next.js App Router, React Testing Library, Vitest, pnpm workspace filters.

---

## External API Notes

- Better Auth email/password docs: https://better-auth.com/docs/authentication/email-password
- Better Auth installed endpoint shape checked in `apps/web/node_modules/better-auth/dist/api/routes/email-verification.d.mts`: `sendVerificationEmail` accepts `{ email, callbackURL? }`; `verifyEmail` is a GET endpoint with `{ token, callbackURL? }`.
- Resend Node.js send API: https://resend.com/docs/send-with-nodejs

---

## File Map

- Modify `apps/api/src/auth-emails.ts`: add verification email subject, text/html builders, and `sendVerificationEmail`.
- Modify `apps/api/src/auth-emails.test.ts`: extend the existing Resend mock tests for verification mail.
- Modify `apps/api/src/auth.ts`: configure Better Auth `emailVerification` with soft policy.
- Modify `apps/web/src/app/(auth)/sign-up/page.tsx`: pass a web-origin `/verify-email` callback URL to Better Auth during sign-up.
- Modify `apps/web/src/app/(auth)/sign-up/page.test.tsx`: assert sign-up passes the callback URL.
- Create `apps/web/src/app/(app)/_components/email-verification-banner.tsx`: signed-in unverified email banner with resend action.
- Modify `apps/web/src/app/(app)/_components/app-shell.tsx`: receive `emailVerified` and render the banner.
- Modify `apps/web/src/app/(app)/_components/app-shell.test.tsx`: cover banner visibility and resend behavior.
- Modify `apps/web/src/app/(app)/layout.tsx`: pass `session.user.emailVerified` into `AppShell`.
- Create `apps/web/src/app/verify-email/page.tsx`: public verification callback/result page.
- Create `apps/web/src/app/verify-email/page.test.tsx`: cover success, error, and direct-token redirect states.
- Modify `apps/web/src/lib/strings.ts`: add `strings.auth.verifyEmail.*`.
- Modify `apps/web/next.config.ts`: add `/verify-email` to `Referrer-Policy: no-referrer`.
- Modify docs:
  - `docs/architecture/07-auth.md`
  - `docs/architecture/08-web-ve-mobil.md`
  - `docs/architecture/02-teknoloji-kararlari.md`
  - `docs/process/02-mvp-faz-plani.md`
  - `docs/process/05-is-kayit-defteri.md`

---

### Task 1: Transactional Verification Email Helper

**Files:**
- Modify: `apps/api/src/auth-emails.ts`
- Test: `apps/api/src/auth-emails.test.ts`

- [x] **Step 1: Write failing text/html builder tests**

Add these imports to the dynamic import destructuring in `apps/api/src/auth-emails.test.ts`:

```ts
  verificationEmailHtml,
  verificationEmailText,
```

Add this test block near the existing reset email builder tests:

```ts
const VERIFY_URL = 'http://localhost:3001/api/auth/verify-email?token=tok_verify&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fverify-email';

describe('verificationEmailText', () => {
  it('includes the verification URL and Turkish expiry copy', () => {
    const text = verificationEmailText(VERIFY_URL);
    expect(text).toContain(VERIFY_URL);
    expect(text).toMatch(/1 saat/);
    expect(text).toMatch(/sen yapmadiysan|sen yapmadıysan/i);
  });
});

describe('verificationEmailHtml', () => {
  it('renders an anchor to the verification URL and escapes it', () => {
    const html = verificationEmailHtml(VERIFY_URL);
    expect(html).toContain(
      'href="http://localhost:3001/api/auth/verify-email?token=tok_verify&amp;callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fverify-email"',
    );
    expect(html).toContain('E-postami dogrula');
    expect(html).not.toContain('token=tok_verify&callbackURL=');
  });
});
```

- [x] **Step 2: Run the API email tests to verify RED**

Run:

```bash
pnpm --filter @pusula/api-server test -- src/auth-emails.test.ts
```

Expected: FAIL because `verificationEmailText` and `verificationEmailHtml` are not exported yet.

- [x] **Step 3: Add verification email builders**

Add this below the reset password builders in `apps/api/src/auth-emails.ts`:

```ts
const VERIFY_SUBJECT = 'Pusula - E-posta dogrulama';

/** Plain-text body for the signup email-verification email. */
export function verificationEmailText(url: string): string {
  return [
    'Merhaba,',
    '',
    'Pusula hesabinin e-posta adresini dogrulamak icin asagidaki baglantiyi ac:',
    url,
    '',
    'Bu baglanti kisa sure (yaklasik 1 saat) gecerlidir.',
    'Bu hesabi sen olusturmadiysan bu e-postayi yok sayabilirsin.',
    '',
    'Pusula',
  ].join('\n');
}

/** Minimal HTML body for the signup email-verification email. */
export function verificationEmailHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return [
    '<!doctype html>',
    '<html lang="tr">',
    '<body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1f2937;">',
    '<p>Merhaba,</p>',
    '<p>Pusula hesabinin e-posta adresini dogrulamak icin asagidaki baglantiya tikla:</p>',
    `<p><a href="${safeUrl}">E-postami dogrula</a></p>`,
    '<p>Buton calismazsa su baglantiyi tarayicina kopyala:</p>',
    `<p>${safeUrl}</p>`,
    '<p>Bu baglanti kisa sure (yaklasik 1 saat) gecerlidir.</p>',
    '<p>Bu hesabi sen olusturmadiysan bu e-postayi yok sayabilirsin.</p>',
    '<p>Pusula</p>',
    '</body>',
    '</html>',
  ].join('\n');
}
```

- [x] **Step 4: Run the API email tests to verify builder GREEN**

Run:

```bash
pnpm --filter @pusula/api-server test -- src/auth-emails.test.ts
```

Expected: builder tests now pass; send tests are not added yet.

- [x] **Step 5: Write failing send tests**

Add `sendVerificationEmail` to the dynamic import destructuring, then add:

```ts
describe('sendVerificationEmail - no RESEND_API_KEY (best-effort)', () => {
  it('in dev: does not throw and logs the token-bearing link for local testing only', async () => {
    mockEnv.NODE_ENV = 'development';
    __resetResendClientForTests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      sendVerificationEmail({ to: 'aria@test.com', url: VERIFY_URL }),
    ).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY'), VERIFY_URL);
  });

  it('in production: does not throw and never logs the token-bearing URL', async () => {
    mockEnv.NODE_ENV = 'production';
    __resetResendClientForTests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      sendVerificationEmail({ to: 'aria@test.com', url: VERIFY_URL }),
    ).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
    for (const call of warn.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain(VERIFY_URL);
        expect(String(arg)).not.toContain('tok_verify');
      }
    }
  });
});

describe('sendVerificationEmail - with RESEND_API_KEY', () => {
  it('sends the email via Resend with from/to/subject/html/text', async () => {
    mockEnv.RESEND_API_KEY = 're_test_key';
    __resetResendClientForTests();
    sendMock.mockResolvedValue({ data: { id: 'email_2' }, error: null });

    await sendVerificationEmail({ to: 'aria@test.com', url: VERIFY_URL });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.to).toBe('aria@test.com');
    expect(arg.subject).toMatch(/E-posta dogrulama/);
    expect(String(arg.html)).toContain('verify-email');
    expect(String(arg.text)).toContain(VERIFY_URL);
  });
});
```

- [x] **Step 6: Run the API email tests to verify RED**

Run:

```bash
pnpm --filter @pusula/api-server test -- src/auth-emails.test.ts
```

Expected: FAIL because `sendVerificationEmail` is not exported yet.

- [x] **Step 7: Implement `sendVerificationEmail`**

Add this below `sendResetPasswordEmail` in `apps/api/src/auth-emails.ts`:

```ts
/**
 * Send the signup email-verification email. Best-effort: with no Resend key it
 * logs the link only in non-production; on a Resend error it logs and returns.
 * Never throws, so Better Auth signup and resend endpoints are not broken by a
 * transient email provider failure.
 */
export async function sendVerificationEmail(params: {
  to: string;
  url: string;
}): Promise<void> {
  const { to, url } = params;
  const resend = getResend();

  if (!resend) {
    if (env.NODE_ENV === 'production') {
      console.warn('[auth] RESEND_API_KEY tanimli degil - e-posta dogrulama e-postasi gonderilemedi.');
    } else {
      console.warn(
        '[auth] RESEND_API_KEY tanimli degil - e-posta dogrulama e-postasi gonderilmiyor. Dogrulama baglantisi (yalnizca dev):',
        url,
      );
    }
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: resolveRecipient(to),
      subject: VERIFY_SUBJECT,
      html: verificationEmailHtml(url),
      text: verificationEmailText(url),
    });
    if (error) {
      console.error('[auth] e-posta dogrulama e-postasi gonderilemedi:', error);
    }
  } catch (error) {
    console.error('[auth] e-posta dogrulama e-postasi gonderilirken beklenmeyen hata:', error);
  }
}
```

- [x] **Step 8: Run the API email tests to verify GREEN**

Run:

```bash
pnpm --filter @pusula/api-server test -- src/auth-emails.test.ts
```

Expected: PASS.

---

### Task 2: Better Auth Verification Wiring And Sign-Up Callback

**Files:**
- Modify: `apps/api/src/auth.ts`
- Modify: `apps/web/src/app/(auth)/sign-up/page.tsx`
- Test: `apps/web/src/app/(auth)/sign-up/page.test.tsx`

- [x] **Step 1: Wire Better Auth email verification in the API**

Change the import in `apps/api/src/auth.ts`:

```ts
import { sendResetPasswordEmail, sendVerificationEmail } from './auth-emails';
```

Add the soft verification config beside `emailAndPassword`:

```ts
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 60 * 60,
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) => {
      void sendVerificationEmail({ to: user.email, url });
    },
  },
  emailAndPassword: {
    enabled: true,
    // Soft policy for DEM-72: unverified users can sign in and continue
    // onboarding, but the web shell shows a persistent verification banner.
    requireEmailVerification: false,
```

Keep the existing `sendResetPassword` and `revokeSessionsOnPasswordReset` entries unchanged.

- [x] **Step 2: Run API typecheck**

Run:

```bash
pnpm --filter @pusula/api-server typecheck
```

Expected: PASS. If Better Auth option names drift, this catches it immediately.

- [x] **Step 3: Write the failing sign-up callback test**

Replace `apps/web/src/app/(auth)/sign-up/page.test.tsx` with a behavioral submit test:

```ts
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signUp: { email: h.signUpEmail } },
}));

import SignUpPage from './page';

describe('<SignUpPage>', () => {
  beforeEach(() => {
    h.signUpEmail.mockReset();
  });

  it('renders the sign-up form in the public auth page structure', async () => {
    render(<SignUpPage />);

    expect(
      await screen.findByRole('heading', { level: 1, name: strings.auth.signUp.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.auth.signUp.submit })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings.auth.signUp.goToSignIn })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  it('passes the web verify-email callback URL to Better Auth on submit', async () => {
    const user = userEvent.setup();
    h.signUpEmail.mockResolvedValue({ error: null });
    render(<SignUpPage />);

    await user.type(screen.getByLabelText(strings.auth.nameLabel), 'Aria Chen');
    await user.type(screen.getByLabelText(strings.auth.emailLabel), 'aria@example.com');
    await user.type(screen.getByLabelText(strings.auth.passwordLabel), 'supersecret');
    await user.click(screen.getByRole('button', { name: strings.auth.signUp.submit }));

    await waitFor(() =>
      expect(h.signUpEmail).toHaveBeenCalledWith({
        name: 'Aria Chen',
        email: 'aria@example.com',
        password: 'supersecret',
        callbackURL: `${window.location.origin}/verify-email`,
      }),
    );
  });
});
```

- [x] **Step 4: Run the sign-up test to verify RED**

Run:

```bash
pnpm --filter @pusula/web test -- "src/app/(auth)/sign-up/page.test.tsx"
```

Expected: FAIL because the page does not pass `callbackURL` yet.

- [x] **Step 5: Pass the callback URL during sign-up**

Change the submit call in `apps/web/src/app/(auth)/sign-up/page.tsx`:

```ts
const result = await authClient.signUp.email({
  name: name ?? '',
  email,
  password,
  callbackURL: `${window.location.origin}/verify-email`,
});
```

- [x] **Step 6: Run the sign-up test to verify GREEN**

Run:

```bash
pnpm --filter @pusula/web test -- "src/app/(auth)/sign-up/page.test.tsx"
```

Expected: PASS.

---

### Task 3: Unverified Email Banner With Resend

**Files:**
- Create: `apps/web/src/app/(app)/_components/email-verification-banner.tsx`
- Modify: `apps/web/src/app/(app)/_components/app-shell.tsx`
- Modify: `apps/web/src/app/(app)/_components/app-shell.test.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/lib/strings.ts`

- [x] **Step 1: Add banner copy**

Add this under `strings.auth` in `apps/web/src/lib/strings.ts`:

```ts
    verifyEmail: {
      bannerTitle: 'E-postani dogrula',
      bannerBody: 'Hesabini guvende tutmak icin e-posta adresini dogrula.',
      resend: 'Dogrulama e-postasini yeniden gonder',
      sending: 'Gonderiliyor...',
      sent: 'Dogrulama e-postasi yeniden gonderildi. Gelen kutunu kontrol et.',
      error: 'Dogrulama e-postasi gonderilemedi. Lutfen tekrar deneyin.',
      successTitle: 'E-posta dogrulandi',
      successBody: 'E-posta adresin dogrulandi. Pusula kullanmaya devam edebilirsin.',
      pendingTitle: 'E-posta dogrulaniyor',
      pendingBody: 'Dogrulama baglantisi kontrol ediliyor...',
      invalidTitle: 'Dogrulama baglantisi gecersiz',
      invalidBody: 'Bu dogrulama baglantisi gecersiz ya da suresi dolmus. Uygulamaya girip yeni bir baglanti isteyebilirsin.',
      goToApp: 'Uygulamaya git',
      goToSignIn: 'Giris ekranina don',
    },
```

- [x] **Step 2: Create the banner component**

Create `apps/web/src/app/(app)/_components/email-verification-banner.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { MailCheck, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, Button } from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

type EmailVerificationBannerProps = {
  email: string;
};

export function EmailVerificationBanner({ email }: EmailVerificationBannerProps) {
  const copy = strings.auth.verifyEmail;
  const [state, setState] = useState<SendState>('idle');

  const handleResend = async () => {
    setState('sending');
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/verify-email`,
      });
      setState(result.error ? 'error' : 'sent');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="border-b bg-card px-4 py-3">
      <Alert className="mx-auto max-w-5xl">
        <MailCheck className="size-4" aria-hidden />
        <AlertTitle>{copy.bannerTitle}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {copy.bannerBody} <span className="font-medium break-all">{email}</span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleResend}
            disabled={state === 'sending'}
          >
            {state === 'sending' ? (
              <>
                <RefreshCw className="size-4 animate-spin" aria-hidden />
                {copy.sending}
              </>
            ) : (
              copy.resend
            )}
          </Button>
        </AlertDescription>
        {state === 'sent' && <p className="mt-2 text-sm text-muted-foreground">{copy.sent}</p>}
        {state === 'error' && <p className="mt-2 text-sm text-destructive">{copy.error}</p>}
      </Alert>
    </div>
  );
}
```

- [x] **Step 3: Render the banner from AppShell**

In `apps/web/src/app/(app)/_components/app-shell.tsx`, add the import:

```ts
import { EmailVerificationBanner } from './email-verification-banner';
```

Extend props:

```ts
type AppShellProps = {
  userName: string;
  userEmail: string;
  emailVerified: boolean;
  children: ReactNode;
};
```

Update the function signature:

```ts
export function AppShell({ userName, userEmail, emailVerified, children }: AppShellProps) {
```

Render the banner immediately after `</header>`:

```tsx
      {!emailVerified && <EmailVerificationBanner email={userEmail} />}
```

- [x] **Step 4: Pass the session flag from AppLayout**

In `apps/web/src/app/(app)/layout.tsx`, change the `AppShell` call:

```tsx
  return (
    <AppShell
      userName={session.user.name || session.user.email}
      userEmail={session.user.email}
      emailVerified={session.user.emailVerified}
    >
      {children}
    </AppShell>
  );
```

- [x] **Step 5: Write banner tests in AppShell**

Update the `@/lib/auth-client` mock in `app-shell.test.tsx`:

```ts
vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: vi.fn(), sendVerificationEmail: h.sendVerificationEmail },
}));
```

Add `sendVerificationEmail: vi.fn()` to the hoisted helper and reset it in `beforeEach`.

Update all existing `<AppShell>` test renders to pass `emailVerified`:

```tsx
<AppShell userName="Aria Chen" userEmail="aria@example.com" emailVerified>
```

Add:

```ts
it('does not show the email verification banner for verified users', () => {
  render(
    <AppShell userName="Aria Chen" userEmail="aria@example.com" emailVerified>
      <div>content</div>
    </AppShell>,
  );

  expect(screen.queryByText(strings.auth.verifyEmail.bannerTitle)).not.toBeInTheDocument();
});

it('shows the email verification banner for unverified users and resends the email', async () => {
  const user = userEvent.setup();
  h.sendVerificationEmail.mockResolvedValue({ error: null });

  render(
    <AppShell userName="Aria Chen" userEmail="aria@example.com" emailVerified={false}>
      <div>content</div>
    </AppShell>,
  );

  expect(screen.getByText(strings.auth.verifyEmail.bannerTitle)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: strings.auth.verifyEmail.resend }));

  await waitFor(() =>
    expect(h.sendVerificationEmail).toHaveBeenCalledWith({
      email: 'aria@example.com',
      callbackURL: `${window.location.origin}/verify-email`,
    }),
  );
  expect(await screen.findByText(strings.auth.verifyEmail.sent)).toBeInTheDocument();
});
```

Add imports if missing:

```ts
import userEvent from '@testing-library/user-event';
import { waitFor } from '@testing-library/react';
```

- [x] **Step 6: Run AppShell tests to verify GREEN**

Run:

```bash
pnpm --filter @pusula/web test -- "src/app/(app)/_components/app-shell.test.tsx"
```

Expected: PASS.

---

### Task 4: Public Verify Email Callback Page

**Files:**
- Create: `apps/web/src/app/verify-email/page.tsx`
- Test: `apps/web/src/app/verify-email/page.test.tsx`
- Modify: `apps/web/next.config.ts`

- [x] **Step 1: Create failing verify page tests**

Create `apps/web/src/app/verify-email/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';

const h = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  assign: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => h.searchParams,
}));

vi.mock('@/env', () => ({
  env: { NEXT_PUBLIC_API_URL: 'http://localhost:3001' },
}));

import VerifyEmailPage, { buildVerifyEmailUrl } from './page';

describe('<VerifyEmailPage>', () => {
  beforeEach(() => {
    h.searchParams = new URLSearchParams();
    h.assign.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'http://localhost:3000', assign: h.assign },
    });
  });

  it('shows success when Better Auth redirects back without an error', async () => {
    render(<VerifyEmailPage />);
    expect(await screen.findByText(strings.auth.verifyEmail.successTitle)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings.auth.verifyEmail.goToApp })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('shows an invalid link state when Better Auth redirects back with error', async () => {
    h.searchParams = new URLSearchParams('error=invalid_token');
    render(<VerifyEmailPage />);
    expect(await screen.findByText(strings.auth.verifyEmail.invalidTitle)).toBeInTheDocument();
  });

  it('redirects direct web token links to the API verify endpoint', async () => {
    h.searchParams = new URLSearchParams('token=tok_verify');
    render(<VerifyEmailPage />);

    expect(await screen.findByText(strings.auth.verifyEmail.pendingTitle)).toBeInTheDocument();
    await waitFor(() =>
      expect(h.assign).toHaveBeenCalledWith(
        'http://localhost:3001/api/auth/verify-email?token=tok_verify&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fverify-email',
      ),
    );
  });
});

describe('buildVerifyEmailUrl', () => {
  it('encodes token and callback URL', () => {
    expect(
      buildVerifyEmailUrl({
        apiUrl: 'http://localhost:3001',
        token: 'a b+c',
        callbackURL: 'http://localhost:3000/verify-email',
      }),
    ).toBe(
      'http://localhost:3001/api/auth/verify-email?token=a%20b%2Bc&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fverify-email',
    );
  });
});
```

- [x] **Step 2: Run verify page tests to verify RED**

Run:

```bash
pnpm --filter @pusula/web test -- src/app/verify-email/page.test.tsx
```

Expected: FAIL because the route does not exist yet.

- [x] **Step 3: Implement the verify page**

Create `apps/web/src/app/verify-email/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { env } from '@/env';
import { strings } from '@/lib/strings';
import { AuthShell } from '../(auth)/_components/auth-shell';

type BuildVerifyEmailUrlParams = {
  apiUrl: string;
  token: string;
  callbackURL: string;
};

export function buildVerifyEmailUrl({
  apiUrl,
  token,
  callbackURL,
}: BuildVerifyEmailUrlParams): string {
  const base = apiUrl.replace(/\/$/, '');
  return `${base}/api/auth/verify-email?token=${encodeURIComponent(
    token,
  )}&callbackURL=${encodeURIComponent(callbackURL)}`;
}

function VerifyEmailContent() {
  const copy = strings.auth.verifyEmail;
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const error = searchParams.get('error');

  useEffect(() => {
    if (!token) return;
    window.location.assign(
      buildVerifyEmailUrl({
        apiUrl: env.NEXT_PUBLIC_API_URL,
        token,
        callbackURL: `${window.location.origin}/verify-email`,
      }),
    );
  }, [token]);

  if (token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.pendingTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{copy.pendingBody}</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.invalidTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{copy.invalidBody}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="justify-center">
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {copy.goToSignIn}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.successTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{copy.successBody}</p>
      </CardContent>
      <CardFooter className="justify-center">
        <Link
          href="/"
          className="text-foreground rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {copy.goToApp}
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <Suspense fallback={<AppSpinner label={strings.common.loading} showLabel />}>
        <VerifyEmailContent />
      </Suspense>
    </AuthShell>
  );
}
```

- [x] **Step 4: Run verify page tests to verify GREEN**

Run:

```bash
pnpm --filter @pusula/web test -- src/app/verify-email/page.test.tsx
```

Expected: PASS.

- [x] **Step 5: Add Referrer-Policy for verify email**

Update `apps/web/next.config.ts` comment to mention verification and change the source:

```ts
        source: '/:path(reset-password|forgot-password|verify-email)',
```

- [x] **Step 6: Run web typecheck**

Run:

```bash
pnpm --filter @pusula/web typecheck
```

Expected: PASS.

---

### Task 5: Architecture And Process Docs

**Files:**
- Modify: `docs/architecture/07-auth.md`
- Modify: `docs/architecture/08-web-ve-mobil.md`
- Modify: `docs/architecture/02-teknoloji-kararlari.md`
- Modify: `docs/process/02-mvp-faz-plani.md`
- Modify: `docs/process/05-is-kayit-defteri.md`

- [x] **Step 1: Update auth architecture**

In `docs/architecture/07-auth.md`, replace the future DEM-72 note with:

```md
### Signup e-posta doğrulama (DEM-72)

- **Politika:** yumuşak doğrulama. `emailAndPassword.requireEmailVerification = false`; kullanıcı signup sonrası otomatik oturum alır ve onboarding kesilmez. Doğrulanmamış oturumlar `(app)` kabuğunda kalıcı "E-postanı doğrula" banner'ı görür.
- **API:** Better Auth `emailVerification` aktiftir: `sendOnSignUp: true`, `expiresIn: 3600`, `autoSignInAfterVerification: true`, `sendVerificationEmail({ user, url })` -> `apps/api/src/auth-emails.ts` `sendVerificationEmail` -> Resend. Auth e-postaları request-path'te kalır ve notification outbox/worker'a girmez.
- **Web:** Signup `authClient.signUp.email({ ..., callbackURL: \`${window.location.origin}/verify-email\` })` gönderir. Banner tekrar gönderim için `authClient.sendVerificationEmail({ email, callbackURL })` çağırır. `/verify-email` route'u `(auth)` dışında public callback ekranıdır; Better Auth API redirect'i başarılıysa başarı, `?error=` varsa geçersiz/süresi dolmuş bağlantı durumu gösterir. Direct `/verify-email?token=` linkleri API verify endpoint'ine yönlendirilir.
- **Güvenlik:** Verification link token'ı query'dedir; production log'larına düşmez. `/verify-email`, `/reset-password`, `/forgot-password` route'ları `Referrer-Policy: no-referrer` ile servis edilir.
```

- [x] **Step 2: Update web architecture**

In `docs/architecture/08-web-ve-mobil.md` auth route section, add:

```md
- **Signup e-posta doğrulama (Faz 8 — [DEM-72](https://linear.app/demirkol/issue/DEM-72)):** yumuşak politika; signup sonrası kullanıcı içeri alınır, fakat `(app)` shell `session.user.emailVerified === false` ise doğrulama banner'ı gösterir. Banner resend butonu `authClient.sendVerificationEmail({ email, callbackURL: \`${window.location.origin}/verify-email\` })` çağırır. `/verify-email` `(auth)` route group dışında public callback ekranıdır; başarılı redirect'te başarı, `?error=` ile geçersiz/süresi dolmuş bağlantı durumu gösterir.
```

- [x] **Step 3: Add a technology decision**

Append this row to the karar kaydı in `docs/architecture/02-teknoloji-kararlari.md`:

```md
- **2026-05-15** — DEM-72 signup e-posta doğrulama kararı: **yumuşak doğrulama** seçildi (`requireEmailVerification=false`). Gerekçe: Pusula onboarding'inde ilk workspace/pano oluşturma akışı kesilmesin; doğrulanmamış kullanıcılar ürünü kullanabilir ama app-shell banner'ı ile doğrulama sürekli görünür kalır. Better Auth `emailVerification` token ve verify endpoint'ini sağlar; gönderim mevcut DEM-68 Resend helper'ının genişletilmiş `sendVerificationEmail` fonksiyonuyla request-path'te yapılır ve Faz 6 notification outbox'tan ayrı kalır. `/verify-email` token/callback route'u `Referrer-Policy: no-referrer` kapsamına alınır.
```

- [x] **Step 4: Update phase plan**

In `docs/process/02-mvp-faz-plani.md`, update the Faz 8 DEM-72 mention to note that it is now planned and implemented by this plan:

```md
[DEM-72](https://linear.app/demirkol/issue/DEM-72) (signup e-posta doğrulama; plan: `docs/superpowers/plans/2026-05-15-signup-email-verification.md`)
```

- [x] **Step 5: Add a work log row**

Append a row to `docs/process/05-is-kayit-defteri.md` near the other 2026-05-15 entries:

```md
| FE-2026-05-15-003 | DEM-72 | Signup e-posta doğrulama (Better Auth emailVerification + Resend) | 8 — Sertleştirme | In Progress | Codex | `docs/superpowers/plans/2026-05-15-signup-email-verification.md`, `docs/architecture/07-auth.md`, `docs/architecture/08-web-ve-mobil.md`, `docs/architecture/02-teknoloji-kararlari.md`, `docs/process/02-mvp-faz-plani.md`, `docs/process/05-is-kayit-defteri.md` | `apps/api`, `apps/web` | 2026-05-15 | Plan: yumuşak email verification; Better Auth `emailVerification.sendVerificationEmail` -> Resend; app-shell doğrulama banner'ı + resend; public `/verify-email` callback ekranı. |
```

- [x] **Step 6: Review docs only**

Run:

```bash
git diff -- docs/architecture/07-auth.md docs/architecture/08-web-ve-mobil.md docs/architecture/02-teknoloji-kararlari.md docs/process/02-mvp-faz-plani.md docs/process/05-is-kayit-defteri.md
```

Expected: only DEM-72 documentation updates.

---

### Task 6: Final Verification

**Files:**
- Verify all changed files.

- [x] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter @pusula/api-server test -- src/auth-emails.test.ts
pnpm --filter @pusula/api-server typecheck
pnpm --filter @pusula/web test -- "src/app/(auth)/sign-up/page.test.tsx"
pnpm --filter @pusula/web test -- "src/app/(app)/_components/app-shell.test.tsx"
pnpm --filter @pusula/web test -- src/app/verify-email/page.test.tsx
pnpm --filter @pusula/web typecheck
```

Expected: all commands exit 0.

- [x] **Step 2: Run lint on touched workspaces**

Run:

```bash
pnpm --filter @pusula/api-server lint
pnpm --filter @pusula/web lint
```

Expected: all commands exit 0. If the web lint still reports a pre-existing warning unrelated to DEM-72, record it in the final handoff and do not refactor it inside this task.

- [x] **Step 3: Run diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [x] **Step 4: Review the final diff**

Run:

```bash
git diff -- apps/api/src/auth.ts apps/api/src/auth-emails.ts apps/api/src/auth-emails.test.ts "apps/web/src/app/(auth)/sign-up/page.tsx" "apps/web/src/app/(auth)/sign-up/page.test.tsx" "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/_components/app-shell.tsx" "apps/web/src/app/(app)/_components/app-shell.test.tsx" "apps/web/src/app/(app)/_components/email-verification-banner.tsx" apps/web/src/app/verify-email/page.tsx apps/web/src/app/verify-email/page.test.tsx apps/web/src/lib/strings.ts apps/web/next.config.ts docs/architecture/07-auth.md docs/architecture/08-web-ve-mobil.md docs/architecture/02-teknoloji-kararlari.md docs/process/02-mvp-faz-plani.md docs/process/05-is-kayit-defteri.md docs/superpowers/plans/2026-05-15-signup-email-verification.md
```

Expected: diff is scoped to DEM-72 verification, docs, and tests.

