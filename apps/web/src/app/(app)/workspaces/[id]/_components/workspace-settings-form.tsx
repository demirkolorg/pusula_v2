'use client';

import { useEffect, useId, useState } from 'react';
import {
  workspaceIconSchema,
  workspaceNameSchema,
  workspaceSlugSchema,
  type EntityIcon,
} from '@pusula/domain';
import { Alert, AlertDescription, Button, Input, Label, Separator } from '@pusula/ui';
import { EntityIconPicker } from '@/components/entity-icon';
import { strings } from '@/lib/strings';

export type WorkspaceSettingsValues = {
  /** Validated, trimmed workspace name. */
  name: string;
  /** Validated, trimmed slug. */
  slug: string;
  /** Stable icon token shown in shell switchers. */
  icon: EntityIcon;
};

type WorkspaceSettingsFormProps = {
  /** Current persisted name — pre-fills the field and resets it after a save. */
  name: string;
  /** Current persisted slug. */
  slug: string;
  /** Current persisted icon token. */
  icon: EntityIcon;
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
  icon,
  onSubmit,
  pending = false,
  error,
  notice,
}: WorkspaceSettingsFormProps) {
  const nameId = useId();
  const slugId = useId();
  const [nameValue, setNameValue] = useState(name);
  const [slugValue, setSlugValue] = useState(slug);
  const [iconValue, setIconValue] = useState<EntityIcon>(icon);
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);

  // Re-sync the fields when the persisted values change (e.g. after a save).
  useEffect(() => setNameValue(name), [name]);
  useEffect(() => setSlugValue(slug), [slug]);
  useEffect(() => setIconValue(icon), [icon]);

  const dirty = nameValue !== name || slugValue !== slug || iconValue !== icon;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedName = workspaceNameSchema.safeParse(nameValue);
    const parsedSlug = workspaceSlugSchema.safeParse(slugValue);
    const parsedIcon = workspaceIconSchema.safeParse(iconValue);
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
    if (!parsedName.success || !parsedSlug.success || !parsedIcon.success) return;
    onSubmit({ name: parsedName.data, slug: parsedSlug.data, icon: parsedIcon.data });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
        <div className="space-y-1">
          <Label htmlFor={nameId}>{strings.workspace.manage.nameLabel}</Label>
          <p className="text-muted-foreground text-sm">
            {strings.workspace.manage.nameDescription}
          </p>
        </div>
        <div className="space-y-2">
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
      </div>

      <Separator />

      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
        <div className="space-y-1">
          <Label htmlFor={slugId}>{strings.workspace.manage.slugLabel}</Label>
          <p className="text-muted-foreground text-sm">
            {strings.workspace.manage.slugDescription}
          </p>
        </div>
        <div className="space-y-2">
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
      </div>

      <Separator />

      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
        <div className="space-y-1">
          <Label>{strings.workspace.manage.iconLabel}</Label>
          <p className="text-muted-foreground text-sm">
            {strings.workspace.manage.iconDescription}
          </p>
        </div>
        <EntityIconPicker
          value={iconValue}
          onValueChange={setIconValue}
          labels={strings.entityIcons}
          disabled={pending}
        />
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
