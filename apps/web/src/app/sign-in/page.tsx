'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Alert, AlertDescription } from '@pusula/ui';
import { AppSpinner } from '@/components/app-spinner';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { AuroraBackground } from './_components/aurora-background';
import { BoardMockup } from './_components/board-mockup';
import { FeatureHighlights } from './_components/feature-highlights';
import { FloatingActivity } from './_components/floating-activity';
import { LandingFooter } from './_components/landing-footer';
import { LandingNavbar } from './_components/landing-navbar';
import { LogoCloud } from './_components/logo-cloud';
import { NotificationShowcase } from './_components/notification-showcase';
import { RedirectIfAuthenticated } from './_components/redirect-if-authenticated';
import { RotatingHeadline } from './_components/rotating-headline';
import { type AuthCardMode, SignInGlassCard } from './_components/sign-in-glass-card';
import { SocialProof } from './_components/social-proof';
import { StatsStrip } from './_components/stats-strip';

/**
 * `/sign-in` — "aurora hero + cam (glassmorphic) kart" tarzı landing görünümlü
 * giriş ekranı. `(auth)` route group'unun DIŞINDA bağımsız bir route'tur;
 * oturum kontrolü ({@link authClient.useSession}) burada yapılır.
 *
 * Tüm auth akışı (giriş, kayıt, şifremi unuttum, parola sıfırlama) TEK sayfada,
 * TEK cam kartta ({@link SignInGlassCard}) toplanır — ayrı sayfa/ekran yoktur.
 * Aktif mod URL query param ile taşınır: `/sign-in` → giriş, `?mode=sign-up`,
 * `?mode=forgot`, `?mode=reset&token=…`. Mod geçişleri `router` ile query'yi
 * günceller (tarayıcı geri tuşu çalışır); kartın İÇİ yumuşakça dönüşür.
 *
 * Yerleşim: doğal akışlı, dikey kaydırmalı landing sayfası — hero (metin + cam
 * kart) → ürün önizlemesi → özellik vurguları → bildirim vitrini → logo bulutu
 * → istatistik şeridi → footer. Aurora arka plan kaydırma boyunca sabittir.
 */

/** Bilinen `?mode=` değeri → kart modu; tanınmayan/eksik değer giriş moduna düşer. */
function resolveMode(raw: string | null): AuthCardMode {
  if (raw === 'sign-up' || raw === 'forgot' || raw === 'reset') return raw;
  return 'sign-in';
}

/** Auth akışı + landing kabuğu — `useSearchParams` için Suspense gerekir. */
function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = resolveMode(searchParams.get('mode'));
  // Reset modunda e-posta linkinden gelen tek kullanımlık token.
  const resetToken = searchParams.get('token')?.trim() ?? '';
  // `/sign-in?reset=1` — başarılı parola sıfırlama sonrası bilgilendirme flash'ı.
  const justReset = searchParams.get('reset') === '1';

  const copy = strings.auth.landing;

  /**
   * Kart modu değiştir — query param'ı `router.push` ile günceller (history'ye
   * yazar → tarayıcı geri tuşu önceki moda döner). `sign-in` modu temiz
   * `/sign-in` URL'i; diğer modlar `?mode=…`. `token` / `reset` gibi geçici
   * param'lar mod değişiminde düşürülür (yeni mod kendi temiz URL'iyle açılır).
   */
  const handleModeChange = (next: AuthCardMode) => {
    router.push(next === 'sign-in' ? '/sign-in' : `/sign-in?mode=${next}`);
  };

  /**
   * Parola sıfırlama başarıyla tamamlandı — token'ı URL'den düşür, `?reset=1`
   * flash'ını tetikle. `router.replace` kullanılır: token içeren kirli URL
   * (`?mode=reset&token=…`) tarayıcı geçmişine yazılmaz.
   */
  const handleResetSuccess = () => {
    router.replace('/sign-in?reset=1');
  };

  return (
    <div className="relative flex min-h-svh flex-col">
      <AuroraBackground />
      <LandingNavbar />

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero — `lg`+ iki kolon: solda marka/değer metni, sağda cam auth
            kartı. `lg` altında dikey istif (metin → kart). */}
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 px-6 py-14 sm:px-10 lg:flex-row lg:items-center lg:gap-16 lg:py-20">
          {/* Hero metni — eyebrow + dönen başlık + açıklama. */}
          <div className="flex w-full max-w-xl flex-col gap-5 text-center lg:flex-1 lg:text-left">
            <span className="text-primary text-sm font-medium tracking-wide">
              {copy.heroEyebrow}
            </span>
            <RotatingHeadline />
            <p className="text-muted-foreground mx-auto max-w-md text-base/relaxed lg:mx-0 lg:max-w-lg lg:text-lg/relaxed">
              {copy.heroDescription}
            </p>
          </div>

          {/* Çok modlu cam auth kartı + altında sosyal-proof şeridi. */}
          <div className="flex w-full max-w-md flex-col items-center gap-5 lg:shrink-0">
            <SignInGlassCard
              mode={mode}
              resetToken={resetToken}
              onModeChange={handleModeChange}
              onResetSuccess={handleResetSuccess}
              flash={
                justReset ? (
                  <Alert>
                    <AlertDescription>{strings.auth.signIn.resetDone}</AlertDescription>
                  </Alert>
                ) : null
              }
            />
            <SocialProof />
          </div>
        </section>

        {/* Ürün önizlemesi — dekoratif kanban panosu + yüzen aktivite kartları.
            Yalnız geniş ekranda görünür; `overflow-hidden` yatay taşmayı keser. */}
        <section className="hidden overflow-hidden px-6 py-12 sm:px-10 lg:block lg:py-16">
          <div className="relative mx-auto w-fit">
            <BoardMockup />
            <FloatingActivity />
          </div>
        </section>

        {/* Özellik vurguları — üç gerçek-içerik kart. */}
        <section className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10 lg:py-14">
          <FeatureHighlights />
        </section>

        {/* Bildirim sistemi vitrini — kendi `<section>` kabuğunu taşır. */}
        <NotificationShowcase />

        {/* Sosyal kanıt — logo bulutu + istatistik şeridi. */}
        <LogoCloud />
        <StatsStrip />
      </main>

      <LandingFooter />
    </div>
  );
}

export default function SignInPage() {
  const { data: session, isPending } = authClient.useSession();

  // Oturum varsa giriş yapacak bir şey yok — tek yönlendirme noktasına devret
  // (`?redirect=` korunur).
  if (!isPending && session) {
    return (
      <Suspense fallback={null}>
        <RedirectIfAuthenticated />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<AppSpinner label={strings.common.loading} showLabel />}>
      <SignInContent />
    </Suspense>
  );
}
