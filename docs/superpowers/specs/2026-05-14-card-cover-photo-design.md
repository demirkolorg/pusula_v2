# Card Cover Photo Design

## Context

DEM-110 adds visual card covers on top of the existing card cover colour feature. The current colour flow is already wired end to end: `cards.cover_color`, `card.update({ coverColor })`, `board.get` / `card.get`, optimistic board cache, `card.updated` realtime events, and the card/detail UI. The product docs explicitly kept image covers out of DEM-66/67 because image covers depend on the attachment/storage layer.

The repo already has the storage foundation:

- Local MinIO is present in `docker-compose.yml`.
- `S3_*` variables are defined in `.env` / `env.example`.
- The `attachments` table exists in `packages/db/src/schema/comments.ts` and the initial Drizzle migration.

The missing pieces are the storage adapter, attachment upload API, card cover image reference, API projections, realtime patching, and web UI.

## Decision

Implement cover photos as card-owned image attachments. Add a nullable `cards.cover_image_attachment_id` reference to `attachments.id`. The actual image file remains in S3/MinIO, and the card stores only the selected attachment id.

When a cover image is present, it takes visual precedence over `coverColor`. The colour remains stored and can be restored visually when the image cover is cleared. This keeps the existing colour feature backward compatible and avoids destructive colour resets.

## Architecture

### Data Model

- Keep `attachments` as the canonical file metadata table.
- Add `cards.coverImageAttachmentId` (`cover_image_attachment_id`) nullable FK to `attachments.id`, `ON DELETE SET NULL`.
- Add an index on `cards.cover_image_attachment_id`.
- Keep `attachments.card_id` and `attachments.board_id` as ownership boundaries.

Invariant: a card can only use an attachment from the same card as its cover image. API procedures validate this before setting the field.

### Domain Contract

Add domain schemas for image attachment upload and cover selection:

- `createAttachmentUploadInput`: `{ cardId, fileName, mimeType, size, clientMutationId? }`
- `completeAttachmentUploadInput`: `{ cardId, attachmentId, clientMutationId? }`
- `setCardCoverImageInput`: `{ cardId, attachmentId: string | null, clientMutationId? }`

Initial image allowlist:

- `image/jpeg`
- `image/png`
- `image/webp`

Initial image size limit: 10 MiB per image. Non-image attachments stay out of this feature.

### API

Add an `attachment` router in `packages/api`:

- `attachment.createUpload`: board `member+`; validates card access, active board, image MIME and size; inserts attachment metadata with a deterministic random `storageKey`; returns `{ attachment, upload: { url, headers } }`.
- `attachment.getDownloadUrl`: board `viewer+`; validates attachment access and returns a short-lived presigned read URL for UI rendering.

Add card cover mutation surface:

- Prefer `card.update({ coverImageAttachmentId })` if the existing update shape stays manageable.
- Use a separate `card.setCoverImage` procedure if the update procedure becomes hard to keep clear.

Either route must:

- require board `member+`,
- reject archived boards,
- validate the attachment belongs to the same card,
- return `{ changed: false }` on no-op,
- write `card.cover_image_changed` / `card.cover_image_cleared`,
- bump `boards.version`,
- write one `card.updated` realtime event with `patch.coverImageAttachmentId` and `patch.coverImage`,
- carry `clientMutationId` for echo filtering.

### Storage Adapter

Add a small storage interface to `packages/api` context:

```ts
export interface ObjectStorage {
  createPresignedPutUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  createPresignedGetUrl(input: { key: string }): Promise<string>;
}
```

`apps/api` owns the concrete S3-compatible implementation and env parsing. `packages/api` depends only on the interface for tests and framework independence.

### API Projection

`board.get` and `card.get` include additive cover image metadata:

```ts
coverImage: null | {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
};
```

Image URLs are not embedded in `board.get` by default because every URL is short-lived. The web client calls `attachment.getDownloadUrl` for visible cover images. This avoids sending many presigned URLs for a large board and keeps board payload deterministic.

### Web UI

Extend the existing cover colour picker into a cover picker:

- Keep colour swatches.
- Add an image upload action.
- Add a clear image action when a cover image exists.
- Keep clear colour as a separate action.

Rendering:

- Board card: render an image strip/thumbnail above the title when `coverImage` exists; otherwise render the existing colour stripe.
- Card modal: render a wider image cover band/header when `coverImage` exists; otherwise keep the existing colour header.
- Read-only users see the cover image but cannot upload/set/clear.

### Error Handling

- Invalid MIME or oversized file: `BAD_REQUEST`.
- Attachment from another card or board: `BAD_REQUEST`.
- Viewer upload/set attempt: `FORBIDDEN`.
- Missing attachment: `NOT_FOUND`.
- Storage unavailable while presigning: `INTERNAL_SERVER_ERROR`; no card mutation is applied.
- Upload failure in the browser leaves only an unattached metadata row; cleanup can be handled later by a worker sweep. The card cover is not set until the upload completes.

### Testing

Use TDD:

- Domain schema tests for MIME and size validation.
- API integration tests for upload creation, invalid MIME/size, viewer forbidden, set/clear cover, same-card validation, activity/version/realtime patch.
- Web RTL tests for cover picker upload state, image precedence over colour, clear image, read-only behavior.
- Board cache/realtime tests for `coverImage` patch application.

## Out of Scope

- Cropping / focal point selection.
- Thumbnail generation.
- Virus scanning.
- OCR/search of image contents.
- Public permanent URLs.
- Multi-image gallery management beyond the existing attachment metadata table.
