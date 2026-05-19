'use client';

import { useId, useState } from 'react';
import { InboxIcon, PencilLineIcon, PlusIcon, XIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { quickNoteContentSchema } from '@pusula/domain';
import { Button, Textarea, boardBackgroundClass, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useQuickNoteMutations } from '@/lib/use-quick-note-mutations';
import { useTRPC } from '@/trpc/client';
import { QuickNoteRow } from './quick-note-row';

type QuickNotesPanelProps = {
  /**
   * Whether a note may be dragged onto a list to convert it — board `member+`
   * on an active board. Note CRUD is always allowed (a quick note is personal).
   */
  canConvert: boolean;
  /** The board's background — the panel body shares it so it reads as one board surface. */
  background: string | null;
  /** Close the panel (the `BoardTopBar` toggle owns the open state). */
  onClose: () => void;
};

/** Chrome-foreground ghost button for the board-coloured panel header. */
const headerButtonClass =
  'text-[color:var(--board-chrome-fg)] hover:bg-white/10 hover:text-[color:var(--board-chrome-fg)]';

/**
 * Foreground for text that sits directly on the transparent (board-coloured)
 * panel body — loading / error / empty states. `--board-canvas-fg` flips
 * light/dark by the board surface lightness, so the copy stays readable on any
 * background. The composer + note rows are `bg-card` surfaces and keep theme
 * foreground colours.
 */
const canvasFgClass = 'text-[color:var(--board-canvas-fg)]';
const canvasFgMutedClass = 'text-[color:var(--board-canvas-fg-muted)]';

/**
 * Web "Hızlı Notlar" paneli (DEM-205) — pano ekranının solunda açılıp kapanan,
 * Trello "Gelen Kutusu" mantığında kişisel yakalama paneli. Üstte not ekleme
 * alanı, altında notlar yeniden-eskiye. Bir not satırı bir pano listesine
 * sürüklenince karta dönüşür (`QuickNoteRow` + board `monitorForElements`).
 *
 * Panel pano yüzeyinin bir parçası gibi okunur: başlık şeridi `BoardTopBar` ile
 * aynı renkte (`bg-board-topbar`) ve aynı yükseklikte; gövdesi şeffaftır, pano
 * arka planını gösterir. Not kartları `bg-card`; not ekleme alanı (composer) ise
 * pano listeleriyle aynı yüzeyi (`--board-list-bg`) kullanır → şeffaf pano
 * üzerinde yalnız duran beyaz bir kutu gibi değil, panonun bir listesi gibi
 * okunur. Gövdeye `p-5` boşluk verilir → panel içeriği ile pano kolonları
 * arasında nefes payı.
 *
 * Panel yalnız pano ekranında render edilir; açık/kapalı durumu
 * `BoardDetailPage`'de tutulur ve `localStorage`'da saklanır.
 */
export function QuickNotesPanel({ canConvert, background, onClose }: QuickNotesPanelProps) {
  const trpc = useTRPC();
  const notesQuery = useQuery(trpc.quickNote.list.queryOptions());
  const { createNote, updateNote, deleteNote } = useQuickNoteMutations();
  const copy = strings.board.quickNotes;

  return (
    <aside
      aria-label={copy.panelTitle}
      className={cn('flex h-full w-96 shrink-0 flex-col', boardBackgroundClass(background))}
    >
      {/* Header — board topbar colour, `min-h-14` aligned with `BoardTopBar`. */}
      <header className="bg-board-topbar flex min-h-14 shrink-0 items-center gap-2 px-3 text-[color:var(--board-chrome-fg)]">
        <InboxIcon aria-hidden className="size-4" />
        <h2 className="flex-1 text-sm font-semibold">{copy.panelTitle}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`size-7 ${headerButtonClass}`}
          aria-label={copy.close}
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
      </header>

      {/* Body — transparent (the board background shows through); `p-5` gap. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5">
        <QuickNoteComposer onSubmit={createNote} />

        <div className="pusula-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
          {notesQuery.isPending ? (
            <p className={cn('py-6 text-center text-sm', canvasFgMutedClass)}>
              {strings.common.loading}
            </p>
          ) : notesQuery.isError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className={cn('text-sm font-medium', canvasFgClass)}>{copy.loadErrorTitle}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => notesQuery.refetch()}
              >
                {strings.common.retry}
              </Button>
            </div>
          ) : notesQuery.data.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center">
              <InboxIcon aria-hidden className={cn('size-7', canvasFgMutedClass)} />
              <p className={cn('text-sm font-medium', canvasFgClass)}>{copy.emptyTitle}</p>
              <p className={cn('text-xs', canvasFgMutedClass)}>{copy.emptyDescription}</p>
            </div>
          ) : (
            notesQuery.data.map((note) => (
              <QuickNoteRow
                key={note.id}
                note={note}
                canConvert={canConvert}
                onUpdate={(content) => updateNote(note.id, content)}
                onDelete={() => deleteNote(note.id)}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * Always-open "add a quick note" composer — clears + stays focused after submit.
 *
 * The form is a `--board-list-bg` surface (the same colour as the board's list
 * columns) carrying a small section label, the input and the submit button. On
 * that tinted surface the `bg-card` textarea reads as a proper input field —
 * not a lone white box floating on the board background.
 */
function QuickNoteComposer({ onSubmit }: { onSubmit: (content: string) => void }) {
  const inputId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const copy = strings.board.quickNotes;

  const submit = () => {
    const parsed = quickNoteContentSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setError(null);
    onSubmit(parsed.data);
    setValue('');
  };

  return (
    <form
      className="shrink-0 space-y-2.5 rounded-xl bg-[color:var(--board-list-bg)] p-3 shadow-sm ring-1 ring-[color:var(--board-list-border)]"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="text-muted-foreground flex items-center gap-1.5">
        <PencilLineIcon aria-hidden className="size-3.5" />
        <span className="text-xs font-semibold">{copy.composerTitle}</span>
      </div>
      <Textarea
        id={inputId}
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={copy.addPlaceholder}
        aria-label={copy.addPlaceholder}
        aria-invalid={error ? true : undefined}
        className="bg-card resize-none text-sm shadow-sm"
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="submit" size="sm" className="w-full gap-1.5">
        <PlusIcon aria-hidden className="size-4" />
        {copy.addSubmit}
      </Button>
    </form>
  );
}
