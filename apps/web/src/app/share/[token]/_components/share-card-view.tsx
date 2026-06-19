/**
 * Faz 9D (DEM-130) — misafir kart görünümü. Trello-vari kart detay anatomisi:
 * cover banner (palet rengi) + başlık + label/üye chip'leri + meta row +
 * açıklama + checklist + yorumlar + misafir yorum form. Sade tek-kolon,
 * `max-w-3xl` center. App-shell DEĞİL (sade public layout).
 *
 * Misafir görmediği şeyler ([`docs/domain/08-paylasim-linki-kurallari.md`](docs/domain/08-paylasim-linki-kurallari.md)):
 * board adı dışı içerik, diğer kartlar, activity feed, e-posta, diğer paylaşım
 * linkleri. Kapak görseli artık snapshot'ta `card.coverImageUrl` (kısa süreli
 * presigned GET URL) ile döner; genel attachment indirme hâlâ backlog.
 */
import {
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  ListChecksIcon,
  MessageSquareIcon,
  UsersIcon,
} from 'lucide-react';
import { Avatar, MetaChip, RichTextContent, cn } from '@pusula/ui';
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
    /** Kapak eki için kısa süreli presigned GET URL (snapshot anında üretilir). */
    coverImageUrl: string | null;
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

/** `card.coverColor` → `bg-palet-*` Tailwind class. `@pusula/ui` `theme.css`. */
const COVER_PALETTE: Record<string, string> = {
  kirmizi: 'bg-palet-kirmizi',
  turuncu: 'bg-palet-turuncu',
  sari: 'bg-palet-sari',
  lime: 'bg-palet-lime',
  yesil: 'bg-palet-yesil',
  sky: 'bg-palet-sky',
  mavi: 'bg-palet-mavi',
  indigo: 'bg-palet-indigo',
  mor: 'bg-palet-mor',
  pembe: 'bg-palet-pembe',
  gri: 'bg-palet-gri',
  siyah: 'bg-palet-siyah',
};

/**
 * Label `color` (domain `LABEL_COLORS` — İngilizce isim seti) → design-token
 * palet class'ı. `@pusula/ui` `theme.css` `--palet-*` token'larıyla light/dark
 * uyumlu; foreground token'ı kontrastı korur. (Board tarafındaki
 * `label-colors.ts` ile aynı eşleme.)
 */
const LABEL_PALETTE: Record<string, string> = {
  green: 'bg-palet-yesil text-palet-yesil-foreground',
  yellow: 'bg-palet-sari text-palet-sari-foreground',
  orange: 'bg-palet-turuncu text-palet-turuncu-foreground',
  red: 'bg-palet-kirmizi text-palet-kirmizi-foreground',
  purple: 'bg-palet-mor text-palet-mor-foreground',
  blue: 'bg-palet-mavi text-palet-mavi-foreground',
  sky: 'bg-palet-sky text-palet-sky-foreground',
  lime: 'bg-palet-lime text-palet-lime-foreground',
  pink: 'bg-palet-pembe text-palet-pembe-foreground',
  black: 'bg-palet-siyah text-palet-siyah-foreground',
};

export function ShareCardView({ token, snapshot, apiUrl }: ShareCardViewProps) {
  const copy = strings.share.guest;
  const { workspace, sharedBy, card, labels, members, checklists, comments } = snapshot;

  const coverClass = card.coverColor ? COVER_PALETTE[card.coverColor] ?? 'bg-muted' : null;

  // Checklist progress (tüm checklist'lerin toplam tamamlanan/toplam item).
  const totalItems = checklists.reduce((acc, cl) => acc + cl.items.length, 0);
  const doneItems = checklists.reduce(
    (acc, cl) => acc + cl.items.filter((i) => i.completed).length,
    0,
  );

  return (
    <div className="space-y-4">
      {/* Üst breadcrumb — workspace + paylaşan */}
      <header className="text-muted-foreground space-y-0.5 text-xs">
        <p className="font-medium uppercase tracking-wide">{copy.sharedWithYou}</p>
        <p>
          <span>{workspace.name}</span>
          {sharedBy && (
            <>
              <span className="px-1.5">·</span>
              <span>
                {copy.sharedByLabel} {sharedBy.name ?? copy.unknownSharer}
              </span>
            </>
          )}
        </p>
      </header>

      {/* Trello-vari kart kabı: cover banner + body. Kapak görseli varsa
          öncelikli (presigned URL ile); yoksa palet rengi şeridi. */}
      <article className="bg-card overflow-hidden rounded-xl border shadow-sm">
        {card.coverImageUrl ? (
          <div className="bg-muted h-44 w-full overflow-hidden">
            <img
              src={card.coverImageUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
            />
          </div>
        ) : coverClass ? (
          <div className={cn('h-28 w-full', coverClass)} aria-hidden />
        ) : null}

        <div className="space-y-5 p-5 sm:p-6">
          {/* Başlık + completed */}
          <div className="flex items-start gap-3">
            {card.completed && (
              <CheckCircle2Icon
                className="mt-1.5 size-5 shrink-0 text-emerald-600"
                aria-label={copy.completed}
              />
            )}
            <h1
              className={cn(
                'text-2xl font-semibold leading-tight',
                card.completed && 'text-muted-foreground line-through',
              )}
            >
              {card.title}
            </h1>
          </div>

          {/* Label chips */}
          {labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label) => (
                <span
                  key={label.id}
                  className={cn(
                    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                    LABEL_PALETTE[label.color] ?? 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}

          {/* Meta row — due + üye sayısı + checklist progress + yorum sayısı */}
          {(card.dueAt || members.length > 0 || totalItems > 0 || comments.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {card.dueAt && (
                <MetaChip icon={<CalendarIcon className="size-3" />}>
                  {copy.due} {formatDate(card.dueAt)}
                </MetaChip>
              )}
              {members.length > 0 && (
                <MetaChip icon={<UsersIcon className="size-3" />}>
                  {members.length}
                </MetaChip>
              )}
              {totalItems > 0 && (
                <MetaChip icon={<ListChecksIcon className="size-3" />}>
                  {doneItems}/{totalItems}
                </MetaChip>
              )}
              {comments.length > 0 && (
                <MetaChip icon={<MessageSquareIcon className="size-3" />}>
                  {comments.length}
                </MetaChip>
              )}
            </div>
          )}

          {/* Üyeler — Avatar chip'ler */}
          {members.length > 0 && (
            <Section title={copy.membersHeading}>
              <ul className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="bg-muted/50 inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm"
                  >
                    <Avatar name={m.name ?? copy.unknownSharer} image={m.image} size="sm" />
                    <span className="leading-none">{m.name ?? copy.unknownSharer}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Açıklama — Tiptap JSON; ham metin değil, kontrollü read-only renderer */}
          {card.description && (
            <Section title={copy.descriptionHeading}>
              <RichTextContent value={card.description} />
            </Section>
          )}

          {/* Checklist'ler */}
          {checklists.length > 0 && (
            <Section title={copy.checklistsHeading}>
              <div className="space-y-3">
                {checklists.map((cl) => {
                  const clDone = cl.items.filter((i) => i.completed).length;
                  return (
                    <div key={cl.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{cl.title}</p>
                        <span className="text-muted-foreground text-xs">
                          {clDone}/{cl.items.length}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {cl.items.map((item) => (
                          <li key={item.id} className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              readOnly
                              disabled
                              aria-label={item.content}
                              className="border-input mt-1 size-3.5 rounded"
                            />
                            <span
                              className={cn(
                                'flex-1',
                                item.completed &&
                                  'text-muted-foreground line-through',
                              )}
                            >
                              {item.content}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      </article>

      {/* Yorumlar — ayrı kart */}
      <article className="bg-card space-y-5 rounded-xl border p-5 shadow-sm sm:p-6">
        <Section title={copy.commentsHeading}>
          {comments.length === 0 ? (
            <p className="text-muted-foreground text-sm">{copy.emptyCommentsHint}</p>
          ) : (
            <ul className="space-y-4">
              {comments.map((c) => {
                const authorName = c.isGuest
                  ? copy.guestAuthorLabel
                  : (c.authorName ?? copy.deletedUserLabel);
                return (
                  <li
                    key={c.id}
                    className="flex gap-3"
                    data-guest={c.isGuest ? 'true' : 'false'}
                  >
                    <Avatar name={authorName} image={c.authorImage} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{authorName}</span>
                        {c.isGuest && (
                          <span className="bg-muted text-muted-foreground rounded px-1.5 text-[10px] font-medium uppercase tracking-wide">
                            {copy.guestAuthorLabel}
                          </span>
                        )}
                        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                          <ClockIcon className="size-3" />
                          {formatDate(c.createdAt)}
                        </span>
                      </div>
                      {/* Yorum gövdesi Tiptap JSON taşır — RichTextContent
                          ile render edilir; legacy düz metin tek paragrafa
                          parse edilir (parseRichTextValue fallback). */}
                      <RichTextContent value={c.body} className="mt-1" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* Misafir yorum form — yorumlar listesinin altında, aynı kart içinde */}
        <div className="border-t pt-5">
          <ShareCommentForm token={token} apiUrl={apiUrl} />
        </div>
      </article>

      {/* Footer info */}
      <footer className="text-muted-foreground space-y-1 text-xs">
        <p>{copy.noRealtimeNotice}</p>
        {snapshot.attachments.length > 0 && <p>{copy.attachmentsDownloadNotice}</p>}
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </section>
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
