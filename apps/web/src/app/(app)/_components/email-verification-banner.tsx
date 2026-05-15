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
