/**
 * Faz 9D (DEM-130) — misafir kart snapshot görünümü. Tek-kolon read-only.
 * `apps/api` `GET /share/:token` cevabını tüketir. Tiptap rich render Faz 11
 * iyileştirme listesinde; şimdi açıklama düz string (`whitespace-pre-wrap`).
 *
 * Misafir görmediği şeyler ([`docs/domain/08-paylasim-linki-kurallari.md`](docs/domain/08-paylasim-linki-kurallari.md)):
 * board adı dışı içerik, diğer kartlar, activity feed, e-posta, diğer paylaşım
 * linkleri.
 */
import { strings } from '@/lib/strings';
import { ShareCommentForm } from './share-comment-form';

export type ShareSnapshot = {
  workspace: { name: string };
  sharedBy: { name: string | null } | null;
  expiresAt: string;
  card: {
    id: string;
    title: string;
    description: string | null;
    dueAt: string | null;
    completed: boolean;
    coverColor: string | null;
    coverImageAttachmentId: string | null;
  };
  labels: Array<{ id: string; name: string; color: string }>;
  members: Array<{ id: string; name: string | null; image: string | null; role: string }>;
  checklists: Array<{
    id: string;
    title: string;
    items: Array<{ id: string; content: string; completed: boolean; position: string }>;
  }>;
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    editedAt: string | null;
    isGuest: boolean;
    authorName: string | null;
    authorImage: string | null;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: string;
  }>;
};

type ShareCardViewProps = {
  token: string;
  snapshot: ShareSnapshot;
  apiUrl: string;
};

export function ShareCardView({ token, snapshot, apiUrl }: ShareCardViewProps) {
  const copy = strings.share.guest;
  const { workspace, sharedBy, card, labels, members, checklists, comments } = snapshot;

  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b pb-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {copy.sharedWithYou}
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">{copy.workspaceLabel}</span>{' '}
          <span className="font-medium">{workspace.name}</span>
          {sharedBy && (
            <>
              {' · '}
              <span className="text-muted-foreground">{copy.sharedByLabel}</span>{' '}
              <span className="font-medium">{sharedBy.name ?? copy.unknownSharer}</span>
            </>
          )}
        </p>
      </header>

      <section className="space-y-3">
        <h1 className={`text-2xl font-semibold ${card.completed ? 'line-through opacity-70' : ''}`}>
          {card.title}
        </h1>
        {card.completed && (
          <p className="text-muted-foreground text-xs">{copy.completed}</p>
        )}
        {card.dueAt && (
          <p className="text-muted-foreground text-sm">
            {copy.due} {formatDate(card.dueAt)}
          </p>
        )}
        {card.description && (
          <p className="text-sm whitespace-pre-wrap">{card.description}</p>
        )}
      </section>

      {labels.length > 0 && (
        <section>
          <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            {copy.labelsHeading}
          </h2>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <span
                key={label.id}
                className="rounded bg-secondary px-2 py-0.5 text-xs"
                data-color={label.color}
              >
                {label.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {members.length > 0 && (
        <section>
          <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            {copy.membersHeading}
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-full border px-2 py-1"
              >
                <span className="bg-muted inline-flex size-6 items-center justify-center rounded-full text-xs">
                  {(m.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span>{m.name ?? copy.unknownSharer}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {checklists.length > 0 && (
        <section>
          <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            {copy.checklistsHeading}
          </h2>
          <div className="space-y-3">
            {checklists.map((cl) => (
              <div key={cl.id}>
                <p className="text-sm font-medium">{cl.title}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {cl.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={item.completed}
                        readOnly
                        disabled
                        className="mt-1"
                      />
                      <span className={item.completed ? 'line-through opacity-70' : ''}>
                        {item.content}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
          {copy.commentsHeading}
        </h2>
        {comments.length === 0 ? (
          <p className="text-muted-foreground text-sm">{copy.emptyCommentsHint}</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-md border p-3"
                data-guest={c.isGuest ? 'true' : 'false'}
              >
                <p className="font-medium">
                  {c.isGuest
                    ? copy.guestAuthorLabel
                    : (c.authorName ?? copy.deletedUserLabel)}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {formatDate(c.createdAt)}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 border-t pt-4">
        <ShareCommentForm token={token} apiUrl={apiUrl} />
      </section>

      <p className="text-muted-foreground text-xs">{copy.noRealtimeNotice}</p>
      {snapshot.attachments.length > 0 && (
        <p className="text-muted-foreground text-xs">{copy.attachmentsDownloadNotice}</p>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
