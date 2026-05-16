'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AvatarImageMimeType } from '@pusula/domain';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AppSpinner } from '@/components/app-spinner';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';
import { uploadWithProgress } from '@/lib/upload-with-progress';
import { useTRPC } from '@/trpc/client';
import { AccountTabs } from './_components/account-tabs';
import { ChangePasswordForm } from './_components/change-password-form';
import { DeleteAccountSection } from './_components/delete-account-section';
import { NotificationsChannelsForm } from './_components/notifications-channels-form';
import { NotificationsDevicesList } from './_components/notifications-devices-list';
import { NotificationsDigestForm } from './_components/notifications-digest-form';
import { NotificationsQuietHoursForm } from './_components/notifications-quiet-hours-form';
import { NotificationsScopeTree } from './_components/notifications-scope-tree';
import { NotificationsSnoozeList } from './_components/notifications-snooze-list';
import { NotificationsTypeMatrix } from './_components/notifications-type-matrix';
import { ProfileForm } from './_components/profile-form';
import { SecurityActivitySection } from './_components/security-activity-section';

/**
 * `(app)/account` — self-service account settings: name + avatar URL, change
 * password, delete account. These don't go through tRPC — they call Better
 * Auth's own endpoints directly (see `docs/architecture/07-auth.md` "Profil &
 * hesap yönetimi" and `docs/architecture/08-web-ve-mobil.md` §8.1.7). The
 * `(app)` shell already guarantees a session; this is a safety net.
 *
 * Avatar can be uploaded as a file (DEM-160 — tRPC `user.initiateAvatarUpload`
 * → presigned PUT to MinIO → `updateUser` with the public URL) or set via a
 * plain URL. Account deletion is blocked while the user owns a workspace; the
 * server enforces it
 * (`@pusula/domain` `canDeleteOwnAccount` in Better Auth's `beforeDelete` hook),
 * and we surface the count here as a hint.
 */
export default function AccountPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { data: session, isPending, refetch } = authClient.useSession();
  const workspaces = useQuery(trpc.workspace.list.queryOptions());
  const initiateAvatarUpload = useMutation(trpc.user.initiateAvatarUpload.mutationOptions());

  const [profilePending, setProfilePending] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (isPending) {
    return <AppSpinner label={strings.account.loading} showLabel className="justify-start" />;
  }
  if (!session) return null;

  const user = session.user;
  // UI hint only — the server (`beforeDelete` hook) is the real gate. `workspace.list`
  // excludes archived workspaces, so a user who owns *only* an archived workspace would
  // see the delete button here and then get the server's error in the dialog. We also
  // fall back to 0 while the query is pending/errored, for the same reason: let the
  // server decide. The dialog surfaces whatever the server says.
  const ownedWorkspaceCount = workspaces.isSuccess
    ? workspaces.data.filter((w) => w.role === 'owner').length
    : 0;

  const handleProfileSubmit = async (values: { name: string; image: string | null }) => {
    setProfilePending(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      const res = await authClient.updateUser({ name: values.name, image: values.image });
      if (res.error) {
        setProfileError(res.error.message || strings.common.unknownError);
      } else {
        setProfileSuccess(true);
        await refetch();
      }
    } catch {
      setProfileError(strings.common.unknownError);
    } finally {
      setProfilePending(false);
    }
  };

  /**
   * Avatar upload (DEM-160): presign via tRPC → direct PUT to MinIO → return
   * the public URL. The caller (`ProfileForm`) puts the URL into `image`; the
   * actual `users.image` write happens on form submit via `updateUser`. The
   * file is already MIME/size-validated by the form, so `file.type` is a known
   * avatar MIME — the server re-validates regardless.
   */
  const handleUploadAvatar = async (file: File, onProgress: (percent: number) => void) => {
    const initiated = await initiateAvatarUpload.mutateAsync({
      mimeType: file.type as AvatarImageMimeType,
      size: file.size,
    });
    const handle = uploadWithProgress(
      initiated.upload.url,
      initiated.upload.headers,
      file,
      onProgress,
    );
    await handle.promise;
    return initiated.publicUrl;
  };

  const handlePasswordSubmit = async (values: { currentPassword: string; newPassword: string }) => {
    setPasswordPending(true);
    setPasswordError(null);
    setPasswordSuccess(false);
    try {
      const res = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: true,
      });
      if (res.error) {
        setPasswordError(res.error.message || strings.common.unknownError);
      } else {
        setPasswordSuccess(true);
      }
    } catch {
      setPasswordError(strings.common.unknownError);
    } finally {
      setPasswordPending(false);
    }
  };

  const handleDelete = async (password: string) => {
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await authClient.deleteUser({ password });
      if (res.error) {
        setDeleteError(res.error.message || strings.common.unknownError);
        setDeletePending(false);
        return;
      }
      router.replace('/sign-in');
    } catch {
      setDeleteError(strings.common.unknownError);
      setDeletePending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">{strings.account.pageTitle}</h1>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {strings.account.backToWorkspaces}
          </Link>
        </div>
        <p className="text-muted-foreground text-sm">{strings.account.pageDescription}</p>
      </div>

      <AccountTabs
        profile={
          <ProfileForm
            initialName={user.name}
            initialImage={user.image ?? null}
            email={user.email}
            pending={profilePending}
            error={profileError}
            success={profileSuccess}
            onSubmit={handleProfileSubmit}
            onUploadAvatar={handleUploadAvatar}
          />
        }
        security={
          <>
            <ChangePasswordForm
              pending={passwordPending}
              error={passwordError}
              success={passwordSuccess}
              onSubmit={handlePasswordSubmit}
            />
            <SecurityActivitySection />
            <DeleteAccountSection
              ownedWorkspaceCount={ownedWorkspaceCount}
              pending={deletePending}
              error={deleteError}
              onDelete={handleDelete}
            />
          </>
        }
        notifications={
          <>
            <NotificationsChannelsForm />
            <NotificationsTypeMatrix />
            <NotificationsQuietHoursForm />
            <NotificationsDigestForm />
            <NotificationsScopeTree />
            <NotificationsSnoozeList />
            <NotificationsDevicesList />
          </>
        }
      />
    </div>
  );
}
