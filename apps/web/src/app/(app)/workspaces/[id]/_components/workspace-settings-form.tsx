'use client';

import { useEffect, useId, useState } from 'react';
import { workspaceNameSchema, workspaceSlugSchema } from '@pusula/domain';
import { Alert, AlertDescription, Button, Input, Label } from '@pusula/ui';
import { strings } from '@/lib/strings';

export type WorkspaceSettingsValues = {
  /** Validated, trimmed workspace name. */
  name: string;
  /** Validated, trimmed slug. */
  slug: string;
};

type WorkspaceSettingsFormProps = {
  /** Current persisted name — pre-fills the field and resets it after a save. */
  name: string;
  /** Current persisted slug. */
  slug: string;
  /** Called with the validated, normalized values on submit. */
  onSubmit: (values: WorkspaceSettingsValues) => void;
  /** Mutation in flight — disables the inputs and the submit button. */
  pending?: boolean;
  /** Server-side error message to surface inline (e.g. CONFLICT on slug). */
  error?: string | null;
  /** Success notice to show after a save (e.g. "saved" / "no change"). */
  notice?: string | null;
};

/**
 * Presentational workspace settings form: name + slug fields with client-side
 * validation against the shared `@pusula/domain` schemas (so the rule matches
 * the server, which normalizes too). No tRPC dependency — the container wires
 * the mutation. The submit button is disabled when nothing changed.
 */
export function WorkspaceSettingsForm({
  name,
  slug,
  onSubmit,
  pending = false,
  error,
  notice,
}: WorkspaceSettingsFormProps) {
  const nameId = useId();
  const slugId = useId();
  const [nameValue, setNameValue] = useState(name);
  const [slugValue, setSlugValue] = useState(slug);
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);

  // Re-sync the fields when the persisted values change (e.g. after a save).
  useEffect(() => setNameValue(name), [name]);
  useEffect(() => setSlugValue(slug), [slug]);

  const dirty = nameValue !== name || slugValue !== slug;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedName = workspaceNameSchema.safeParse(nameValue);
    const parsedSlug = workspaceSlugSchema.safeParse(slugValue);
    setNameError(
      parsedName.success
        ? null
        : (parsedName.error.issues[0]?.message ?? strings.common.unknownError),
    );
    setSlugError(
      parsedSlug.success
        ? null
        : (parsedSlug.error.issues[0]?.message ?? strings.common.unknownError),
    );
    if (!parsedName.success || !parsedSlug.success) return;
    onSubmit({ name: parsedName.data, slug: parsedSlug.data });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={nameId}>{strings.workspace.manage.nameLabel}</Label>
        <Input
          id={nameId}
          name="name"
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          placeholder={strings.workspace.manage.namePlaceholder}
          disabled={pending}
          autoComplete="off"
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
        <Label htmlFor={slugId}>{strings.workspace.manage.slugLabel}</Label>
        <Input
          id={slugId}
          name="slug"
          value={slugValue}
          onChange={(event) => setSlugValue(event.target.value)}
          placeholder={strings.workspace.manage.slugPlaceholder}
          disabled={pending}
          autoComplete="off"
          aria-invalid={slugError ? true : undefined}
          aria-describedby={slugError ? `${slugId}-error` : `${slugId}-help`}
        />
        {slugError ? (
          <p id={`${slugId}-error`} className="text-destructive text-sm">
            {slugError}
          </p>
        ) : (
          <p id={`${slugId}-help`} className="text-muted-foreground text-sm">
            {strings.workspace.manage.slugHelp}
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && notice && <p className="text-muted-foreground text-sm">{notice}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? strings.workspace.manage.saving : strings.workspace.manage.save}
        </Button>
      </div>
    </form>
  );
}
