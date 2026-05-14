# Card Cover Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add card cover photos alongside the existing card cover colour feature.

**Architecture:** Use the existing `attachments` table and MinIO/S3-compatible object storage. A card stores the selected cover attachment id, while the attachment row keeps ownership, file metadata, and object key. The API exposes presigned upload/download URLs and card update semantics mirror existing cover colour behaviour: permission checks, archived-board guard, idempotent no-op, activity, board version bump, realtime patch, and optimistic UI support.

**Tech Stack:** TypeScript, pnpm workspace, Drizzle/Postgres, tRPC, Zod, Vitest, React/Next.js, TanStack Query, AWS SDK S3 presigner against MinIO.

---

## File Structure

- `packages/domain/src/constants.ts`: add cover image MIME and size limits plus activity event enum values.
- `packages/domain/src/schemas/attachment.ts`: add upload/download input contracts.
- `packages/domain/src/schemas/card.ts`: allow `coverImageAttachmentId` in `card.update`.
- `packages/domain/src/schemas/index.ts` and `packages/domain/src/index.ts`: export attachment contracts.
- `packages/db/src/schema/cards.ts`: add nullable `coverImageAttachmentId`.
- `packages/db/drizzle/0014_*.sql` and `packages/db/drizzle/meta/0014_snapshot.json`: generated schema migration.
- `packages/api/src/context.ts`: add host-provided `objectStorage`.
- `packages/api/src/lib/object-storage.ts`: define the storage adapter interface and public cover image metadata shape.
- `packages/api/src/routers/attachment.ts`: add presigned upload/download procedures.
- `packages/api/src/routers/card.ts`: validate and set/clear card cover images.
- `packages/api/src/routers/board.ts`: include `coverImage` metadata in board card projection.
- `packages/api/src/root.ts`: mount `attachment` router.
- `apps/api/src/env.ts`: parse S3/MinIO env settings already present in `.env.example`.
- `apps/api/src/object-storage.ts`: instantiate S3 presigned URL adapter.
- `apps/api/src/trpc.ts`: wire the adapter into API context.
- `apps/api/package.json` and `pnpm-lock.yaml`: add AWS SDK S3 dependencies to the API server app.
- `packages/api/src/routers/attachment.test.ts`: cover upload/download authorization and validation.
- `packages/api/src/routers/card.test.ts`: cover set/clear/idempotent/realtime/activity behaviour.
- `packages/api/src/routers/board.test.ts`: cover `board.get` cover image metadata projection.
- `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-cover-color.tsx`: extend the existing cover panel with image upload/clear controls.
- `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-cover-color.test.tsx`: test upload and clear UI flow.
- `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-cover-image.tsx`: fetch and render a cover image URL.
- `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-item.tsx`: render photo cover before colour cover.
- `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-item.test.tsx`: test photo cover precedence.
- `apps/web/src/lib/realtime/event-handlers.ts` and tests: merge realtime `coverImage` patches into the board cache.
- `apps/web/src/lib/board-cache/mutations.ts` and tests: optimistically set/clear cover image metadata.

## Tasks

### Task 1: Domain And Database Contract

**Files:**
- Modify: `packages/domain/src/constants.ts`
- Create: `packages/domain/src/schemas/attachment.ts`
- Modify: `packages/domain/src/schemas/card.ts`
- Modify: `packages/domain/src/schemas/index.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/db/src/schema/cards.ts`
- Generate: `packages/db/drizzle/0014_*.sql`
- Generate: `packages/db/drizzle/meta/0014_snapshot.json`

- [ ] **Step 1: Write domain schema tests**

Add tests asserting:

```ts
expect(createAttachmentUploadInput.parse({
  cardId: 'card_123',
  fileName: 'kapak.png',
  mimeType: 'image/png',
  size: 1024,
})).toMatchObject({ mimeType: 'image/png' });

expect(() => createAttachmentUploadInput.parse({
  cardId: 'card_123',
  fileName: 'kapak.pdf',
  mimeType: 'application/pdf',
  size: 1024,
})).toThrow();

expect(updateCardInput.parse({
  cardId: 'card_123',
  coverImageAttachmentId: null,
})).toMatchObject({ coverImageAttachmentId: null });
```

- [ ] **Step 2: Run the failing domain tests**

Run: `pnpm.cmd --filter @pusula/domain test -- schemas/card.test.ts`

Expected: FAIL because the attachment schema and `coverImageAttachmentId` input are not defined.

- [ ] **Step 3: Add constants and schemas**

Implement:

```ts
export const CARD_COVER_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CARD_COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
```

Add `card.cover_image_changed` and `card.cover_image_cleared` to `ACTIVITY_EVENT_TYPES` after the existing cover colour entries.

Add `packages/domain/src/schemas/attachment.ts`:

```ts
import { z } from 'zod';
import { CARD_COVER_IMAGE_MAX_BYTES, CARD_COVER_IMAGE_MIME_TYPES } from '../constants';
import { idSchema } from './common';

export const coverImageMimeTypeSchema = z.enum(CARD_COVER_IMAGE_MIME_TYPES);

export const createAttachmentUploadInput = z.object({
  cardId: idSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: coverImageMimeTypeSchema,
  size: z.number().int().positive().max(CARD_COVER_IMAGE_MAX_BYTES),
});

export const getAttachmentDownloadUrlInput = z.object({
  attachmentId: idSchema,
});
```

- [ ] **Step 4: Add card schema field and DB column**

Extend `updateCardInput`:

```ts
coverImageAttachmentId: idSchema.nullable().optional(),
```

Extend `cardCols` only after the DB schema has:

```ts
coverImageAttachmentId: text().references(() => attachments.id, { onDelete: 'set null' }),
```

- [ ] **Step 5: Generate migration and verify**

Run:

```powershell
pnpm.cmd db:generate
pnpm.cmd --filter @pusula/domain test -- schemas/card.test.ts
pnpm.cmd --filter @pusula/db typecheck
```

Expected: generated migration adds `cards.cover_image_attachment_id` and the tests/typecheck pass.

### Task 2: Storage Adapter And Attachment Router

**Files:**
- Create: `packages/api/src/lib/object-storage.ts`
- Create: `packages/api/src/routers/attachment.ts`
- Create: `packages/api/src/routers/attachment.test.ts`
- Modify: `packages/api/src/context.ts`
- Modify: `packages/api/src/root.ts`
- Modify: `packages/api/src/index.ts`
- Modify: `apps/api/src/env.ts`
- Create: `apps/api/src/object-storage.ts`
- Modify: `apps/api/src/trpc.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write router tests**

Create tests asserting a board member can create a presigned upload row, a viewer cannot, non-image MIME is rejected by Zod, and `getDownloadUrl` returns a URL only to a board viewer.

Use a fake storage implementation:

```ts
const objectStorage = {
  createPresignedPutUrl: vi.fn(async () => ({ url: 'https://storage.test/put', headers: { 'content-type': 'image/png' } })),
  createPresignedGetUrl: vi.fn(async () => 'https://storage.test/get'),
};
```

- [ ] **Step 2: Run the failing API router test**

Run:

```powershell
$env:DATABASE_URL='postgresql://pusula:pusula@localhost:5436/pusula'
$env:REDIS_URL='redis://localhost:6380'
$env:AUTH_SECRET='change-me-in-local-and-prod'
$env:APP_URL='http://localhost:3000'
$env:API_URL='http://localhost:3001'
pnpm.cmd --filter @pusula/api test -- routers/attachment.test.ts
```

Expected: FAIL because `attachment` router is not mounted.

- [ ] **Step 3: Add the API storage interface**

Add:

```ts
export interface ObjectStorage {
  createPresignedPutUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  createPresignedGetUrl(input: { key: string }): Promise<string>;
}

export type CoverImage = {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
};
```

- [ ] **Step 4: Add attachment router**

`createUpload` must:

```ts
const storageKey = `boards/${ctx.card.boardId}/cards/${ctx.card.id}/${crypto.randomUUID()}-${safeName}`;
const [attachment] = await ctx.db.insert(attachments).values({
  cardId: ctx.card.id,
  boardId: ctx.card.boardId,
  uploaderId: ctx.session.user.id,
  storageKey,
  fileName: input.fileName,
  mimeType: input.mimeType,
  size: input.size,
}).returning();
```

Then call `ctx.objectStorage.createPresignedPutUrl({ key: storageKey, contentType: input.mimeType, contentLength: input.size })`.

`getDownloadUrl` must load the attachment, resolve board access, and call `ctx.objectStorage.createPresignedGetUrl({ key: attachment.storageKey })`.

- [ ] **Step 5: Wire concrete S3 storage**

Install dependencies:

```powershell
pnpm.cmd --filter @pusula/api-server add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Add env fields:

```ts
S3_ENDPOINT: z.string().min(1).default('http://localhost:9000'),
S3_REGION: z.string().min(1).default('us-east-1'),
S3_BUCKET: z.string().min(1).default('pusula'),
S3_ACCESS_KEY_ID: z.string().min(1).default('pusula'),
S3_SECRET_ACCESS_KEY: z.string().min(1).default('pusula-secret'),
```

Create an S3 client with `forcePathStyle: true`, `PutObjectCommand`, `GetObjectCommand`, and `getSignedUrl`.

- [ ] **Step 6: Run router tests**

Run: `pnpm.cmd --filter @pusula/api test -- routers/attachment.test.ts`

Expected: PASS.

### Task 3: Card Cover Image Mutation And Board Projection

**Files:**
- Modify: `packages/api/src/routers/card.ts`
- Modify: `packages/api/src/routers/board.ts`
- Modify: `packages/api/src/routers/card.test.ts`
- Modify: `packages/api/src/routers/board.test.ts`

- [ ] **Step 1: Write API tests**

Add cases:

```ts
const upload = await callerFor(memberId).attachment.createUpload({
  cardId: card.id,
  fileName: 'cover.png',
  mimeType: 'image/png',
  size: 1234,
});

const updated = await callerFor(memberId).card.update({
  cardId: card.id,
  coverImageAttachmentId: upload.attachment.attachmentId,
  clientMutationId: crypto.randomUUID(),
});

expect(updated.coverImageAttachmentId).toBe(upload.attachment.attachmentId);
expect(updated.changed).toBe(true);
```

Also assert:

```ts
await expect(callerFor(memberId).card.update({
  cardId: otherCard.id,
  coverImageAttachmentId: upload.attachment.attachmentId,
  clientMutationId: crypto.randomUUID(),
})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
```

- [ ] **Step 2: Run failing card tests**

Run: `pnpm.cmd --filter @pusula/api test -- routers/card.test.ts`

Expected: FAIL because `coverImageAttachmentId` is accepted by domain but ignored by router.

- [ ] **Step 3: Implement card update handling**

Add key-presence detection:

```ts
const wantsCoverImage = 'coverImageAttachmentId' in input;
```

Load and validate the attachment when non-null:

```ts
const [coverAttachment] = await tx.select().from(attachments).where(eq(attachments.id, input.coverImageAttachmentId)).limit(1);
if (!coverAttachment || coverAttachment.cardId !== card.id || coverAttachment.boardId !== card.boardId) {
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Kapak fotoğrafı bu karta ait olmalı.' });
}
```

Set:

```ts
if (coverImageChanged) patch.coverImageAttachmentId = input.coverImageAttachmentId ?? null;
```

Write `card.cover_image_changed` or `card.cover_image_cleared`, bump board version, and add realtime patch:

```ts
realtimePatch.coverImage = nextCoverImage;
```

- [ ] **Step 4: Add board projection**

Fetch all referenced cover attachments in one batched query:

```ts
const coverAttachmentIds = boardCards.map((c) => c.coverImageAttachmentId).filter((id): id is string => Boolean(id));
```

Map each card to:

```ts
coverImage: coverImageByAttachmentId.get(card.coverImageAttachmentId ?? '') ?? null,
```

- [ ] **Step 5: Run API tests**

Run:

```powershell
pnpm.cmd --filter @pusula/api test -- routers/attachment.test.ts routers/card.test.ts routers/board.test.ts
```

Expected: PASS.

### Task 4: Web Cover Photo UI And Cache Updates

**Files:**
- Create: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-cover-image.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-item.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-item.test.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-cover-color.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-cover-color.test.tsx`
- Modify: `apps/web/src/lib/board-cache/mutations.ts`
- Modify: `apps/web/src/lib/board-cache/mutations.test.tsx`
- Modify: `apps/web/src/lib/realtime/event-handlers.ts`
- Modify: `apps/web/src/lib/realtime/event-handlers.test.ts`

- [ ] **Step 1: Write UI/cache tests**

Assert photo cover wins over colour:

```tsx
render(<CardItem card={{ ...card, coverColor: 'mavi', coverImage: { attachmentId: 'att_1', fileName: 'cover.png', mimeType: 'image/png', size: 123 } }} />);
expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument();
```

Assert upload calls:

```ts
expect(createUpload).toHaveBeenCalledWith(expect.objectContaining({ cardId: card.id, mimeType: 'image/png' }));
expect(cardUpdate).toHaveBeenCalledWith(expect.objectContaining({ cardId: card.id, coverImageAttachmentId: 'att_1' }));
```

Assert realtime merge:

```ts
applyBoardRealtimeEvent(cache, { type: 'card.updated', data: { cardId, patch: { coverImage: null } } });
expect(nextCard.coverImage).toBeNull();
```

- [ ] **Step 2: Run failing web tests**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- card-item.test.tsx card-detail-cover-color.test.tsx mutations.test.tsx event-handlers.test.ts
```

Expected: FAIL because cover image UI and cache patches do not exist.

- [ ] **Step 3: Render cover images**

Create `CardCoverImage`:

```tsx
const { data } = useQuery(
  trpc.attachment.getDownloadUrl.queryOptions(
    { attachmentId: coverImage.attachmentId },
    { staleTime: 60_000 },
  ),
);

return data?.url ? <img src={data.url} alt="" className="h-24 w-full object-cover" /> : null;
```

Use it in `CardItem` before the colour cover strip.

- [ ] **Step 4: Add upload and clear controls**

Extend the existing cover panel with:

```tsx
const upload = await createUpload.mutateAsync({
  cardId,
  fileName: file.name,
  mimeType: file.type,
  size: file.size,
});
await fetch(upload.upload.url, { method: 'PUT', headers: upload.upload.headers, body: file });
await updateCard.mutateAsync({ cardId, coverImageAttachmentId: upload.attachment.attachmentId, clientMutationId: crypto.randomUUID() });
```

Clear:

```tsx
await updateCard.mutateAsync({ cardId, coverImageAttachmentId: null, clientMutationId: crypto.randomUUID() });
```

- [ ] **Step 5: Run web tests**

Run: `pnpm.cmd --filter @pusula/web test -- card-item.test.tsx card-detail-cover-color.test.tsx mutations.test.tsx event-handlers.test.ts`

Expected: PASS.

### Task 5: Verification And Finish

**Files:**
- All changed files from Tasks 1-4.

- [ ] **Step 1: Run focused package tests**

Run:

```powershell
$env:DATABASE_URL='postgresql://pusula:pusula@localhost:5436/pusula'
$env:REDIS_URL='redis://localhost:6380'
$env:AUTH_SECRET='change-me-in-local-and-prod'
$env:APP_URL='http://localhost:3000'
$env:API_URL='http://localhost:3001'
pnpm.cmd --filter @pusula/domain test
pnpm.cmd --filter @pusula/db typecheck
pnpm.cmd --filter @pusula/api test -- routers/attachment.test.ts routers/card.test.ts routers/board.test.ts
pnpm.cmd --filter @pusula/api-server typecheck
pnpm.cmd --filter @pusula/web test -- card-item.test.tsx card-detail-cover-color.test.tsx mutations.test.tsx event-handlers.test.ts
```

Expected: all commands pass.

- [ ] **Step 2: Run full workspace verification**

Run:

```powershell
pnpm.cmd typecheck
pnpm.cmd test
```

Expected: all packages pass.

- [ ] **Step 3: Review diff and commit**

Run:

```powershell
git status --short
git diff --stat
git add docs packages apps pnpm-lock.yaml
git commit -m "feat: DEM-110 add card cover photos"
```

Expected: commit succeeds on branch `codex/dem-110-card-cover-photo`.

## Self-Review

- Spec coverage: data model, presigned upload/download, permission checks, same-card validation, colour fallback, activity/realtime/cache and UI upload are covered by Tasks 1-4.
- Placeholder scan: no unspecified tasks remain; every task names exact files and commands.
- Type consistency: the property name is `coverImageAttachmentId` in DB/API input and `coverImage` in returned board/UI metadata.
