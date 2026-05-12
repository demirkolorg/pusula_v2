'use client';

import { useId, useState } from 'react';
import { userImageUrlSchema, userNameSchema } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
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
};

/**
 * Presentational profile form (display name + avatar URL). No auth-client
 * dependency — `account/page.tsx` wires that in. Validation uses the shared
 * `@pusula/domain` schemas so the rules match the server. The avatar is a plain
 * URL for now (no upload yet — karar 2026-05-12); an empty value clears it.
 */
export function ProfileForm({
  initialName,
  initialImage,
  email,
  pending,
  error,
  success,
  onSubmit,
}: ProfileFormProps) {
  const copy = strings.account.profile;
  const emailId = useId();
  const nameId = useId();
  const imageId = useId();

  const [name, setName] = useState(initialName);
  const [image, setImage] = useState(initialImage ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [noChange, setNoChange] = useState(false);

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
              disabled={pending}
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
            <Label htmlFor={imageId}>{copy.imageLabel}</Label>
            <Input
              id={imageId}
              name="image"
              type="url"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              placeholder={copy.imagePlaceholder}
              disabled={pending}
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

          <Button type="submit" disabled={pending}>
            {pending ? copy.saving : copy.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
