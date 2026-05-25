/**
 * Faz 8A (DEM-284) — Auth lifecycle e2e suite.
 *
 * Kapsam (8.0 önce-belge):
 *   1. login (@smoke)        — mevcut kullanıcı `/sign-in` → `/workspaces`.
 *   2. logout                — avatar menüsünden çıkış → `/sign-in`.
 *   3. signup                — `/sign-in?mode=sign-up` → yeni kullanıcı → verify-email.
 *   4. forgot password UI    — `/sign-in?mode=forgot` → success mesajı.
 *   5. reset password        — `test.fixme` — Better Auth `verifications` token DB helper
 *                              sonraki turda eklenecek (`e2e/helpers/auth-reset-token.ts`).
 *   6. change password      — `test.fixme` — `/account` settings flow sonraki turda.
 *
 * Seed (`e2e/fixtures/seed.ts`):
 *   - `E2E.user` (login için zaten hazır)
 *   - `E2E.signup.email` (signup hedefi; reset aşaması bu satırı temizler).
 *
 * Selector stratejisi: `name="email"|"password"|"name"` attribute'larıyla
 * i18n-bağımsız; submit + menü item'ları için `getByRole('button', { name: ... })`
 * label text'leriyle (Türkçe). `app/sign-in/_components/auth-form.tsx` ve
 * `apps/web/src/lib/strings.ts auth.signIn/signUp/card`'a göre.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect, signIn } from './fixtures/auth.fixture';
import { E2E } from './fixtures/e2e-data';
import { E2E_DATABASE_URL } from './fixtures/env';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function reseed(): void {
  execSync('pnpm exec tsx e2e/fixtures/seed.ts', {
    cwd: repoRoot,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
  });
}

test.beforeEach(() => {
  reseed();
});

test.describe('auth lifecycle', () => {
  test('login: mevcut kullanıcı /sign-in formu üzerinden /workspaces ekranına ulaşır @smoke', async ({
    page,
  }) => {
    await page.goto('/sign-in');

    // Form alanlarını `name` attribute ile yakala (i18n-bağımsız).
    await page.locator('input[name="email"]').fill(E2E.user.email);
    await page.locator('input[name="password"]').fill(E2E.user.password);
    await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();

    // Başarılı giriş → /workspaces (auth-redirect).
    await page.waitForURL(/\/workspaces(\/|$)/, { timeout: 15_000 });
    // Sayfa shell'i mount edildiğinin garantisi: avatar butonu (user-nav-menu).
    await expect(page.locator('button.size-9.rounded-full').first()).toBeVisible();
  });

  test('logout: avatar menüsünden çıkış oturumu kapatır ve /sign-in ekranına döner', async ({
    page,
  }) => {
    await signIn(page, E2E.user);
    await page.goto('/workspaces');

    // Avatar butonu (DropdownMenuTrigger) — yuvarlak, size-9 class'ı.
    await page.locator('button.size-9.rounded-full').first().click();
    // DropdownMenuItem "Çıkış" — strings.shell.signOut.
    await page.getByRole('menuitem', { name: 'Çıkış', exact: true }).click();

    await page.waitForURL(/\/sign-in/, { timeout: 10_000 });
    // Better Auth session cookie'sinin kaldırıldığını doğrula.
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name.includes('session_token') && c.value)).toBeFalsy();
  });

  test('signup: yeni kullanıcı /sign-in?mode=sign-up üzerinden hesap oluşturur ve doğrulama ekranına yönlendirilir', async ({
    page,
  }) => {
    await page.goto('/sign-in?mode=sign-up');

    await page.locator('input[name="name"]').fill(E2E.signup.name);
    await page.locator('input[name="email"]').fill(E2E.signup.email);
    await page.locator('input[name="password"]').fill(E2E.signup.password);
    await page.getByRole('button', { name: 'Kayıt ol', exact: true }).click();

    // Better Auth default: emailVerified=false → /verify-email yönlendirir.
    // (Auth handler env'e göre /workspaces de yönlendirebilir; ikisini de kabul et.)
    await page.waitForURL(/\/(verify-email|workspaces)/, { timeout: 15_000 });
  });

  test('forgot password: e-posta gönderim formu success bildirimi gösterir', async ({ page }) => {
    await page.goto('/sign-in?mode=forgot');

    await page.locator('input[name="email"]').fill(E2E.user.email);
    // Submit button text strings.auth.forgotPassword.submit'e göre değişebilir;
    // type="submit" formdaki tek submit button — onunla yakala.
    await page.locator('form button[type="submit"]').first().click();

    // Better Auth `forget-password` 200 + UI success state; spesifik metin yerine
    // form alanının disabled olması (success state) veya success container'ın
    // görünmesi yeterli. Card "Yeniden gönder" linki success state'in işareti.
    await expect(page.getByRole('button', { name: /yeniden gönder/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  // ── Sonraki turda eklenecek (8.0 önce-belge mocksmith plan) ──────────────
  test.fixme(
    'reset password: e-posta token ile yeni parola ayarlama',
    async () => {
      // TODO: `e2e/helpers/auth-reset-token.ts` — DB `verifications` tablosundan
      // identifier=email + en yeni satır + expiresAt > NOW() ile token çek.
      // `/sign-in?mode=reset&token=...`'a git, yeni parola + onay, submit, başarı.
    },
  );

  test.fixme(
    'change password: oturum açıkken /account üzerinden eski → yeni parola',
    async () => {
      // TODO: /account settings ekranında "Parola değiştir" formu. Better Auth
      // `change-password` endpoint'i; eski parola valid, yeni parola en az 8 char.
    },
  );
});
