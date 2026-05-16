'use client';

import { useId, useRef, useState } from 'react';
import {
  AVATAR_IMAGE_MAX_BYTES,
  AVATAR_IMAGE_MIME_TYPES,
  userImageUrlSchema,
  userNameSchema,
} from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@pusula/ui';
import { strings } from '@/lib/strings';

/** `accept` attribute for the avatar file input — the shared MIME allowlist. */
const AVATAR_ACCEPT = AVATAR_IMAGE_MIME_TYPES.join(',');

type ProfileFormProps = {
  initialName: string;
  initialImage: string | null;
  email: string;
  pending: boolean;
  /** Server-side error (from Better Auth `updateUser`) to surface inline. */
  error?: string | null;
  /** Set after a successful save — shows the "profil güncellendi" notice. */
  success?: boolean;
  /** Called with validated values. `image: null` clears the avatar. */
  onSubmit: (values: { name: string; image: string | null }) => void;
  /**
   * Uploads `file` to object storage and resolves with the public avatar URL
   * to use as `image`. `onProgress` receives 0..100. Wired by
   * `account/page.tsx` (tRPC `user.initiateAvatarUpload` → presigned PUT).
   */
  onUploadAvatar: (file: File, onProgress: (percent: number) => void) => Promise<string>;
};

/**
 * Presentational profile form (display name + avatar). No auth-client
 * dependency — `account/page.tsx` wires that in. Validation uses the shared
 * `@pusula/domain` schemas so the rules match the server.
 *
 * The avatar can be set two ways (DEM-160): a file upload (`onUploadAvatar` →
 * MinIO, public URL) or pasting a plain `http(s)` URL, which stays an optional
 * fallback. Either way `image` ends up an `http(s)` URL; an empty value clears
 * the avatar.
 */
export function ProfileForm({
  initialName,
  initialImage,
  email,
  pending,
  error,
  success,
  onSubmit,
  onUploadAvatar,
}: ProfileFormProps) {
  const copy = strings.account.profile;
  const emailId = useId();
  const nameId = useId();
  const imageId = useId();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialName);
  const [image, setImage] = useState(initialImage ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [noChange, setNoChange] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const busy = pending || uploading;
  const hasImage = image.trim() !== '';

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the *same* file again still fires `change`.
    event.target.value = '';
    if (!file) return;

    setImageError(null);
    setNoChange(false);

    // Client-side gate — the server re-validates (MIME + size are signed into
    // the presigned PUT), this is just fast UX feedback.
    if (!(AVATAR_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      setImageError(copy.avatarTypeError);
      return;
    }
    if (file.size <= 0 || file.size > AVATAR_IMAGE_MAX_BYTES) {
      setImageError(copy.avatarSizeError);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const url = await onUploadAvatar(file, setProgress);
      setImage(url);
    } catch {
      setImageError(copy.avatarUploadError);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    setImage('');
    setImageError(null);
    setNoChange(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNoChange(false);

    let ok = true;
    let nextName = name;
    const parsedName = userNameSchema.safeParse(name);
    if (parsedName.success) {
      nextName = parsedName.data;
      setNameError(null);
    } else {
      setNameError(parsedName.error.issues[0]?.message ?? strings.common.unknownError);
      ok = false;
    }

    let nextImage: string | null = null;
    const trimmedImage = image.trim();
    if (trimmedImage !== '') {
      const parsedImage = userImageUrlSchema.safeParse(trimmedImage);
      if (parsedImage.success) {
        nextImage = parsedImage.data;
        setImageError(null);
      } else {
        setImageError(parsedImage.error.issues[0]?.message ?? strings.common.unknownError);
        ok = false;
      }
    } else {
      setImageError(null);
    }
    if (!ok) return;

    if (nextName === initialName && nextImage === (initialImage || null)) {
      setNoChange(true);
      return;
    }
    onSubmit({ name: nextName, image: nextImage });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={emailId}>{copy.emailLabel}</Label>
            <Input
              id={emailId}
              value={email}
              readOnly
              disabled
              aria-describedby={`${emailId}-help`}
            />
            <p id={`${emailId}-help`} className="text-muted-foreground text-sm">
              {copy.emailReadonlyHelp}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={nameId}>{copy.nameLabel}</Label>
            <Input
              id={nameId}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={copy.namePlaceholder}
              disabled={busy}
              autoComplete="name"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${nameId}-error` : undefined}
            />
            {nameError && (
              <p id={`${nameId}-error`} className="text-destructive text-sm">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{copy.avatarLabel}</Label>
            <div className="flex items-center gap-4">
              <Avatar
                name={name}
                image={hasImage ? image.trim() : null}
                size="lg"
                className="size-16 text-lg"
              />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={AVATAR_ACCEPT}
                    className="sr-only"
                    onChange={handleFileSelect}
                    disabled={busy}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                  >
                    {uploading
                      ? `${copy.avatarUploading} %${progress}`
                      : hasImage
                        ? copy.avatarChangeButton
                        : copy.avatarUploadButton}
                  </Button>
                  {hasImage && !uploading && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveAvatar}
                      disabled={pending}
                    >
                      {copy.avatarRemoveButton}
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">{copy.avatarUploadHelp}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={imageId}>{copy.imageLabel}</Label>
            <Input
              id={imageId}
              name="image"
              type="url"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              placeholder={copy.imagePlaceholder}
              disabled={busy}
              autoComplete="off"
              aria-invalid={imageError ? true : undefined}
              aria-describedby={imageError ? `${imageId}-error` : `${imageId}-help`}
            />
            {imageError ? (
              <p id={`${imageId}-error`} className="text-destructive text-sm">
                {imageError}
              </p>
            ) : (
              <p id={`${imageId}-help`} className="text-muted-foreground text-sm">
                {copy.imageHelp}
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{copy.saved}</AlertDescription>
            </Alert>
          )}
          {noChange && <p className="text-muted-foreground text-sm">{copy.noChange}</p>}

          <Button type="submit" disabled={busy}>
            {pending ? copy.saving : copy.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
