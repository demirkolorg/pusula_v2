'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Alert, AlertDescription, Button } from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { AuthForm, type AuthFormValues } from './auth-form';
import { ForgotPasswordForm } from './forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';

/**
 * Çok modlu cam kartın dört modu — TEK kartın içinde, sayfa değişmeden geçiş:
 * - `sign-in` — e-posta + parola ile giriş.
 * - `sign-up` — yeni hesap (ad + e-posta + parola).
 * - `forgot`  — parola sıfırlama bağlantısı iste.
 * - `reset`   — `?token=` ile yeni parola belirle.
 */
export type AuthCardMode = 'sign-in' | 'sign-up' | 'forgot' | 'reset';

type SignInGlassCardProps = {
  /** URL query'den çözülen aktif mod — kart bu moda göre içeriğini değiştirir. */
  mode: AuthCardMode;
  /** Reset modunda `?token=` query parametresi (boş olabilir). */
  resetToken?: string;
  /** Mod değiştir — sayfa, query param'ı `router` ile günceller. */
  onModeChange: (next: AuthCardMode) => void;
  /**
   * Parola sıfırlama BAŞARILI olduğunda çağrılır — token'ı URL'den düşürmek
   * ve `?reset=1` flash'ını tetiklemek için sayfa `router.replace` yapar.
   */
  onResetSuccess?: () => void;
  /** Kartın üstünde gösterilecek flash (örn. `?reset=1` "parolan güncellendi"). */
  flash?: ReactNode;
};

/**
 * `/sign-in` ekranının glassmorphic kartı — TEK cam panel içinde dört auth
 * modunu (giriş, kayıt, şifremi unuttum, parola sıfırlama) barındırır. Kart
 * (`bg-card/70 + backdrop-blur-xl`) ve dış kabuk SABİT kalır; yalnızca içerik
 * (başlık + açıklama + form bloğu) moda göre değişir ve geçiş `motion`
 * `AnimatePresence` ile yumuşakça akar — görsel olarak tek bir form bloğu
 * hissi verir, ayrı ekran/sayfa hissi YOKTUR.
 *
 * Mod URL query param ile taşınır; geçişler `onModeChange` ile sayfaya
 * bildirilir (sayfa `router` ile URL'i günceller → tarayıcı geri tuşu çalışır).
 * Form bileşenleri (`AuthForm`, `ForgotPasswordForm`, `ResetPasswordForm`)
 * presentational ve paylaşımlıdır; auth-client mantığı burada bağlanır.
 *
 * Açılışta `motion` ile spring giriş animasyonu oynar; `prefers-reduced-motion`
 * açıksa kart anında, animasyonsuz görünür ve modlar arası geçiş de fade'siz.
 */
export function SignInGlassCard({
  mode,
  resetToken = '',
  onModeChange,
  onResetSuccess,
  flash,
}: SignInGlassCardProps) {
  const reduceMotion = useReducedMotion();
  const copy = strings.auth;

  // Tek bir paylaşılan "pending"/"error" durumu — aynı anda yalnızca bir mod
  // görünür olduğundan moda özel ayrı state'e gerek yok.
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // forgot modunda istek gönderildikten sonra gösterilen nötr başarı durumu.
  const [forgotSentTo, setForgotSentTo] = useState<string | null>(null);
  // reset modunda parola güncellendikten sonra gösterilen başarı durumu.
  const [resetDone, setResetDone] = useState(false);

  /** Mod değiştir — devam eden istek varsa engelle, geçici durumları sıfırla. */
  const switchMode = (next: AuthCardMode) => {
    if (pending) return;
    setError(null);
    setForgotSentTo(null);
    setResetDone(false);
    onModeChange(next);
  };

  const handleSignIn = async ({ email, password }: AuthFormValues) => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? strings.common.unknownError);
      }
      // Başarıda oturum güncellenir; sayfa guard'ı RedirectIfAuthenticated'ı
      // render eder (`?redirect=` korunur).
    } catch {
      setError(strings.common.unknownError);
    } finally {
      setPending(false);
    }
  };

  const handleSignUp = async ({ name, email, password }: AuthFormValues) => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signUp.email({
        name: name ?? '',
        email,
        password,
        callbackURL: `${window.location.origin}/verify-email`,
      });
      if (result.error) {
        setError(result.error.message ?? strings.common.unknownError);
      }
    } catch {
      setError(strings.common.unknownError);
    } finally {
      setPending(false);
    }
  };

  const handleForgot = async (email: string) => {
    setPending(true);
    try {
      // Sonuç bilerek yutulur: hesap var/yok fark etmeksizin AYNI nötr başarı
      // durumu gösterilir (kullanıcı listesi sızdırılmaz).
      //
      // `redirectTo` çok-modlu `/sign-in` ekranını işaret eder: Better Auth
      // buna `&token=…` ekler → kullanıcı `/sign-in?mode=reset&token=…`'e
      // gelince kart reset modunda açılır. Mutlak URL gerekir çünkü Better
      // Auth `redirectTo`'yu kendi `baseURL`'ine (API sunucusu) göre çözer;
      // `window.location.origin` web app origin'idir ve `trustedOrigins`'te
      // listelidir.
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/sign-in?mode=reset`,
      });
    } catch {
      // Aynı — yut ve nötr başarı durumuna düş.
    } finally {
      setPending(false);
      setForgotSentTo(email);
    }
  };

  const handleReset = async (newPassword: string) => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({ newPassword, token: resetToken });
      if (result.error) {
        setError(result.error.message ?? strings.common.unknownError);
        setPending(false);
        return;
      }
      setResetDone(true);
      setPending(false);
      // Token'ı tarayıcı geçmişinden ve URL'den düşür; `?reset=1` flash'ını
      // tetiklemek için sayfanın `router.replace` yapmasını bildir.
      onResetSuccess?.();
    } catch {
      setError(strings.common.unknownError);
      setPending(false);
    }
  };

  // Kart başlığı + açıklaması moda (ve forgot/reset alt durumlarına) göre
  // değişir. forgot başarı + reset başarı + reset eksik-token kendi metnini
  // taşır; aksi halde mod'un varsayılan başlık metni kullanılır.
  const headingCopy = (() => {
    if (mode === 'forgot') {
      return forgotSentTo
        ? { title: copy.forgotPassword.successTitle, description: null }
        : { title: copy.forgotPassword.title, description: copy.forgotPassword.description };
    }
    if (mode === 'reset') {
      if (resetDone) {
        return {
          title: copy.resetPassword.successTitle,
          description: copy.resetPassword.redirecting,
        };
      }
      if (!resetToken) {
        // Eksik-token gövdesi aşağıda destructive Alert'te gösterilir —
        // başlık açıklamasında tekrarlamayız (tek görünür kopya).
        return { title: copy.resetPassword.missingTokenTitle, description: null };
      }
      return { title: copy.resetPassword.title, description: copy.resetPassword.description };
    }
    if (mode === 'sign-up') {
      return { title: copy.signUp.title, description: copy.signUp.description };
    }
    return { title: copy.signIn.title, description: copy.signIn.description };
  })();

  // Geçiş animasyonu — kartın İÇİ dönüşür, kart kabuğu sabit. Her mod
  // değişiminde kısa bir fade + dikey kayma (sayfa-geçişi değil).
  const contentMotion = {
    initial: reduceMotion ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 },
    transition: { duration: reduceMotion ? 0 : 0.2 },
  } as const;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18 }
      }
      className="bg-card/70 border-border/60 w-full max-w-md rounded-2xl border p-6 shadow-[var(--shadow-popover)] backdrop-blur-xl sm:p-8"
    >
      <div className="flex flex-col gap-5">
        {flash}

        <AnimatePresence mode="wait" initial={false}>
          {/* `key`, animasyonu her anlamlı içerik değişiminde tetikler — mod
              ya da forgot/reset alt durumu değişince kart içi yumuşakça döner. */}
          <motion.div
            key={`${mode}:${forgotSentTo ? 'sent' : ''}:${resetDone ? 'done' : ''}`}
            {...contentMotion}
            className="flex flex-col gap-5"
          >
            {/* forgot / reset modlarında üstte "giriş ekranına dön" — kart
                içinde mod değiştirir, ayrı sayfaya gitmez. */}
            {(mode === 'forgot' || mode === 'reset') && (
              <button
                type="button"
                onClick={() => switchMode('sign-in')}
                disabled={pending}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 -ml-1 inline-flex w-fit cursor-pointer items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowLeft className="size-4" aria-hidden />
                {strings.auth.card.backToSignIn}
              </button>
            )}

            <div className="flex flex-col gap-2">
              <h2 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
                {headingCopy.title}
              </h2>
              {headingCopy.description && (
                <p className="text-muted-foreground text-sm">{headingCopy.description}</p>
              )}
            </div>

            {mode === 'sign-in' && (
              <div className="flex flex-col gap-4">
                <AuthForm
                  variant="sign-in"
                  onSubmit={handleSignIn}
                  pending={pending}
                  error={error}
                  passwordAction={
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      disabled={pending}
                      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 cursor-pointer rounded-md text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {strings.auth.card.forgotPassword}
                    </button>
                  }
                />
                <p className="text-muted-foreground text-center text-sm">
                  {strings.auth.card.noAccount}{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('sign-up')}
                    disabled={pending}
                    className="text-foreground focus-visible:ring-ring/60 cursor-pointer rounded-md font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {strings.auth.card.goToSignUp}
                  </button>
                </p>
              </div>
            )}

            {mode === 'sign-up' && (
              <div className="flex flex-col gap-4">
                <AuthForm
                  variant="sign-up"
                  onSubmit={handleSignUp}
                  pending={pending}
                  error={error}
                />
                <p className="text-muted-foreground text-center text-sm">
                  {strings.auth.card.hasAccount}{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('sign-in')}
                    disabled={pending}
                    className="text-foreground focus-visible:ring-ring/60 cursor-pointer rounded-md font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {strings.auth.card.goToSignIn}
                  </button>
                </p>
              </div>
            )}

            {mode === 'forgot' && !forgotSentTo && (
              <ForgotPasswordForm onSubmit={handleForgot} pending={pending} />
            )}

            {mode === 'forgot' && forgotSentTo && (
              <div className="flex flex-col gap-4">
                <Alert>
                  <AlertDescription>
                    {copy.forgotPassword.successBodyPrefix}
                    <span className="font-medium break-all">{forgotSentTo}</span>
                    {copy.forgotPassword.successBodySuffix}
                  </AlertDescription>
                </Alert>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => switchMode('forgot')}
                >
                  {strings.auth.card.resendLink}
                </Button>
              </div>
            )}

            {mode === 'reset' && resetDone && (
              <Button
                type="button"
                className="w-full"
                onClick={() => switchMode('sign-in')}
              >
                {strings.auth.card.goToSignIn}
              </Button>
            )}

            {mode === 'reset' && !resetDone && !resetToken && (
              <div className="flex flex-col gap-4">
                <Alert variant="destructive">
                  <AlertDescription>{copy.resetPassword.missingTokenBody}</AlertDescription>
                </Alert>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => switchMode('forgot')}
                >
                  {strings.auth.card.requestNewLink}
                </Button>
              </div>
            )}

            {mode === 'reset' && !resetDone && resetToken && (
              <div className="flex flex-col gap-4">
                <ResetPasswordForm
                  token={resetToken}
                  onSubmit={handleReset}
                  pending={pending}
                  error={error}
                />
                {error && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    disabled={pending}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mx-auto cursor-pointer rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {strings.auth.card.requestNewLink}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
