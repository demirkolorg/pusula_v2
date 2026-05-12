'use client';

import { useId, useState } from 'react';
import { signInInput, signUpInput } from '@pusula/domain';
import { Alert, AlertDescription, Button, Input, Label } from '@pusula/ui';
import { strings } from '@/lib/strings';

export type AuthFormVariant = 'sign-in' | 'sign-up';

export type AuthFormValues = {
  name?: string;
  email: string;
  password: string;
};

type AuthFormProps = {
  variant: AuthFormVariant;
  /** Called with validated, normalized values (email lower-cased / trimmed). */
  onSubmit: (values: AuthFormValues) => void;
  /** Async work in flight — disables inputs and the submit button. */
  pending?: boolean;
  /** Server-side error message (e.g. from Better Auth) to surface inline. */
  error?: string | null;
};

/**
 * Presentational auth form (sign-in / sign-up). No router / auth-client
 * dependency — the page wrappers wire those in. Validation uses the shared
 * `@pusula/domain` zod schemas so the rules match the server.
 */
export function AuthForm({ variant, onSubmit, pending = false, error }: AuthFormProps) {
  const ids = {
    name: useId(),
    email: useId(),
    password: useId(),
  };
  const copy = variant === 'sign-in' ? strings.auth.signIn : strings.auth.signUp;
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = {
      name: variant === 'sign-up' ? String(form.get('name') ?? '') : undefined,
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    };

    const schema = variant === 'sign-up' ? signUpInput : signInInput;
    const parsed = schema.safeParse(
      variant === 'sign-up' ? raw : { email: raw.email, password: raw.password },
    );
    if (!parsed.success) {
      const next: { name?: string; email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'email' || key === 'password') {
          next[key] ??= issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }

    setFieldErrors({});
    onSubmit(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {variant === 'sign-up' && (
        <div className="space-y-2">
          <Label htmlFor={ids.name}>{strings.auth.nameLabel}</Label>
          <Input
            id={ids.name}
            name="name"
            type="text"
            autoComplete="name"
            placeholder={strings.auth.namePlaceholder}
            disabled={pending}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? `${ids.name}-error` : undefined}
          />
          {fieldErrors.name && (
            <p id={`${ids.name}-error`} className="text-destructive text-sm">
              {fieldErrors.name}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={ids.email}>{strings.auth.emailLabel}</Label>
        <Input
          id={ids.email}
          name="email"
          type="email"
          autoComplete="email"
          placeholder={strings.auth.emailPlaceholder}
          disabled={pending}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? `${ids.email}-error` : undefined}
        />
        {fieldErrors.email && (
          <p id={`${ids.email}-error`} className="text-destructive text-sm">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.password}>{strings.auth.passwordLabel}</Label>
        <Input
          id={ids.password}
          name="password"
          type="password"
          autoComplete={variant === 'sign-up' ? 'new-password' : 'current-password'}
          placeholder={strings.auth.passwordPlaceholder}
          disabled={pending}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? `${ids.password}-error` : undefined}
        />
        {fieldErrors.password && (
          <p id={`${ids.password}-error`} className="text-destructive text-sm">
            {fieldErrors.password}
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
