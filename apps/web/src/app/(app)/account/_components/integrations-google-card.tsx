'use client';

import { useState } from 'react';
import { CalendarIcon, CheckIcon, ExternalLinkIcon, LinkIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { formatDate } from '@/lib/format';
import { strings } from '@/lib/strings';

/**
 * Faz 16A (DEM-310) — Google Takvim entegrasyonu bağlama kartı. Better Auth
 * `genericOAuth` plugin'iyle hesap bağlama akışı: `authClient.oauth2.link({...})`
 * Better Auth'un `/api/auth/oauth2/link` endpoint'ine gider → Google'a redirect
 * → callback `/api/auth/oauth2/callback/google-calendar` → Better Auth
 * `accounts` tablosuna `providerId='google-calendar'` row yazar → kullanıcı
 * `callbackURL`'e döner. `authClient.listAccounts` ile mevcut bağlantılar
 * okunur; `authClient.unlinkAccount` ile bağlantı kesilir (DEM-55/68
 * pattern'ı: auth işleri tRPC `user.*`/`integrations.*` üzerinden değil
 * Better Auth client'a doğrudan gider).
 *
 * Bkz. `docs/architecture/19-takvim-entegrasyonu.md` §4 OAuth flow + §6 Web UI.
 */

const GOOGLE_PROVIDER_ID = 'google-calendar';

/**
 * Better Auth `account` satırının döndürdüğü yapı (`/list-accounts`). Tip
 * stub'u: plugin'ler arası şişen dönüş tipini burada daraltıp UI'ye yalnız
 * gerekenleri verir.
 */
type ListedAccount = {
  providerId: string;
  createdAt?: Date | string | null;
  scopes?: string[] | null;
};

export function IntegrationsGoogleCard() {
  const copy = strings.account.integrations;
  const googleCopy = copy.google;
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['better-auth', 'list-accounts'],
    queryFn: async () => {
      const result = await authClient.listAccounts();
      if (result.error) {
        throw new Error(result.error.message ?? copy.loadError);
      }
      return (result.data ?? []) as ListedAccount[];
    },
    staleTime: 30_000,
  });

  const googleAccount = accountsQuery.data?.find((a) => a.providerId === GOOGLE_PROVIDER_ID);
  const connected = Boolean(googleAccount);

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const callbackURL = `${window.location.origin}/account?tab=integrations`;
      const result = await authClient.oauth2.link({
        providerId: GOOGLE_PROVIDER_ID,
        callbackURL,
      });
      if (result.error) {
        // 400/404 = plugin etkin değil (env eksik) veya provider tanımsız.
        // Diğer hatalar (Google reddetme vs.) yine bu blokta düşer.
        setConnectError(result.error.message ?? googleCopy.connectError);
        setConnecting(false);
        return;
      }
      // Başarılı: Better Auth redirect URL döndürür. `redirect: true` ile
      // tarayıcı yönlendirilir; bazı sürümlerde manuel `window.location.href`
      // ataması gerekir.
      const url = (result.data as { url?: string } | null)?.url;
      if (url) {
        window.location.href = url;
        return;
      }
      // Yönlendirme URL'i dönmediyse (beklenmedik) hata göster.
      setConnectError(googleCopy.connectError);
      setConnecting(false);
    } catch {
      setConnectError(googleCopy.connectError);
      setConnecting(false);
    }
  };

  const handleDisconnectConfirm = async () => {
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const result = await authClient.unlinkAccount({ providerId: GOOGLE_PROVIDER_ID });
      if (result.error) {
        setDisconnectError(result.error.message ?? googleCopy.disconnectError);
        setDisconnecting(false);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['better-auth', 'list-accounts'] });
      setDisconnectOpen(false);
      setDisconnecting(false);
      setDisconnectError(null);
    } catch {
      setDisconnectError(googleCopy.disconnectError);
      setDisconnecting(false);
    }
  };

  const connectedAtDate = googleAccount?.createdAt
    ? new Date(googleAccount.createdAt)
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-muted mt-0.5 rounded-md p-2">
              <CalendarIcon className="size-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <CardTitle>{googleCopy.title}</CardTitle>
              <CardDescription>{googleCopy.description}</CardDescription>
            </div>
          </div>
          {connected && (
            <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
              <CheckIcon className="size-3" aria-hidden />
              <span className="ml-1">{googleCopy.connected}</span>
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {accountsQuery.isError && (
          <Alert variant="destructive">
            <AlertDescription>{copy.loadError}</AlertDescription>
          </Alert>
        )}

        {connected ? (
          <div className="space-y-3">
            {connectedAtDate && (
              <p className="text-muted-foreground text-sm">
                {googleCopy.connectedAt.replace('{date}', formatDate(connectedAtDate))}
              </p>
            )}
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <LinkIcon className="size-3" aria-hidden />
              {googleCopy.privacy}
            </p>
            <div>
              <Dialog
                open={disconnectOpen}
                onOpenChange={(next) => {
                  setDisconnectOpen(next);
                  if (!next) setDisconnectError(null);
                }}
              >
                <Button
                  variant="outline"
                  onClick={() => setDisconnectOpen(true)}
                  disabled={disconnecting}
                >
                  {googleCopy.disconnect}
                </Button>
                <DialogContent closeLabel={strings.common.close}>
                  <DialogHeader>
                    <DialogTitle>{googleCopy.disconnectConfirmTitle}</DialogTitle>
                    <DialogDescription>{googleCopy.disconnectConfirmBody}</DialogDescription>
                  </DialogHeader>
                  {disconnectError && (
                    <Alert variant="destructive">
                      <AlertDescription>{disconnectError}</AlertDescription>
                    </Alert>
                  )}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline" disabled={disconnecting}>
                        {googleCopy.disconnectCancel}
                      </Button>
                    </DialogClose>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDisconnectConfirm}
                      disabled={disconnecting}
                    >
                      {googleCopy.disconnectConfirm}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">{googleCopy.notConnected}</p>
            {connectError && (
              <Alert variant="destructive">
                <AlertDescription>{connectError}</AlertDescription>
              </Alert>
            )}
            <div>
              <Button onClick={handleConnect} disabled={connecting}>
                <ExternalLinkIcon className="size-4" aria-hidden />
                <span className="ml-2">{googleCopy.connect}</span>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
