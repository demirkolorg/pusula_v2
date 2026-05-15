'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, MailCheck, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, Button } from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

const COOLDOWN_MS = 60_000;
const COOLDOWN_STORAGE_PREFIX = 'pusula:email-verify-cooldown:';

type EmailVerificationBannerProps = {
  email: string;
};

const cooldownStorageKey = (email: string) => `${COOLDOWN_STORAGE_PREFIX}${email}`;

const readCooldownUntil = (email: string): number => {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(cooldownStorageKey(email));
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function EmailVerificationBanner({ email }: EmailVerificationBannerProps) {
  const copy = strings.auth.verifyEmail;
  const [state, setState] = useState<SendState>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(
    (until: number) => {
      clearTick();
      const update = () => {
        const ms = until - Date.now();
        if (ms <= 0) {
          setRemainingSeconds(0);
          clearTick();
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(cooldownStorageKey(email));
          }
          return;
        }
        setRemainingSeconds(Math.ceil(ms / 1000));
      };
      update();
      tickRef.current = setInterval(update, 1000);
    },
    [clearTick, email],
  );

  useEffect(() => {
    const until = readCooldownUntil(email);
    if (until > Date.now()) startCountdown(until);
    return clearTick;
  }, [email, startCountdown, clearTick]);

  const handleResend = async () => {
    setState('sending');
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/verify-email`,
      });
      if (result.error) {
        setState('error');
        return;
      }
      setState('sent');
      const until = Date.now() + COOLDOWN_MS;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(cooldownStorageKey(email), String(until));
      }
      startCountdown(until);
    } catch {
      setState('error');
    }
  };

  const isCoolingDown = remainingSeconds > 0;
  const isSending = state === 'sending';
  const buttonDisabled = isSending || isCoolingDown;

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
            disabled={buttonDisabled}
            aria-live="polite"
          >
            {isSending ? (
              <>
                <RefreshCw className="size-4 animate-spin" aria-hidden />
                {copy.sending}
              </>
            ) : isCoolingDown ? (
              copy.cooldownLabel(remainingSeconds)
            ) : (
              copy.resend
            )}
          </Button>
        </AlertDescription>
        {state === 'sent' && (
          <p
            role="status"
            className="col-start-2 mt-2 flex items-start gap-2 text-sm text-success"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{copy.sent}</span>
          </p>
        )}
        {state === 'error' && (
          <p
            role="status"
            className="col-start-2 mt-2 flex items-start gap-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{copy.error}</span>
          </p>
        )}
      </Alert>
    </div>
  );
}
