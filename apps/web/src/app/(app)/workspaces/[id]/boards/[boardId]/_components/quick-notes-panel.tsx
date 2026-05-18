'use client';

import { useId, useState } from 'react';
import { InboxIcon, XIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { quickNoteContentSchema } from '@pusula/domain';
import { Button, Textarea } from '@pusula/ui';
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
  /** Close the panel (the `BoardTopBar` toggle owns the open state). */
  onClose: () => void;
};

/**
 * Web "Hızlı Notlar" paneli (DEM-205) — pano ekranının solunda açılıp kapanan,
 * Trello "Gelen Kutusu" mantığında kişisel yakalama paneli. Üstte not ekleme
 * alanı, altında notlar yeniden-eskiye. Bir not satırı bir pano listesine
 * sürüklenince karta dönüşür (`QuickNoteRow` + board `monitorForElements`).
 *
 * Panel yalnız pano ekranında render edilir (kullanıcı kararı — DEM-205); açık/
 * kapalı durumu `BoardDetailPage`'de tutulur ve `localStorage`'da saklanır.
 */
export function QuickNotesPanel({ canConvert, onClose }: QuickNotesPanelProps) {
  const trpc = useTRPC();
  const notesQuery = useQuery(trpc.quickNote.list.queryOptions());
  const { createNote, updateNote, deleteNote } = useQuickNoteMutations();
  const copy = strings.board.quickNotes;

  return (
    <aside
      aria-label={copy.panelTitle}
      className="border-border bg-card flex h-full w-72 shrink-0 flex-col border-r"
    >
      {/* Header height matches `BoardTopBar` (`min-h-14`) so the panel reads as
          a sibling piece of the board surface, not a layer bolted under it. */}
      <header className="border-border flex min-h-14 shrink-0 items-center gap-2 border-b px-3">
        <InboxIcon aria-hidden className="text-muted-foreground size-4" />
        <h2 className="flex-1 text-sm font-semibold">{copy.panelTitle}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={copy.close}
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
      </header>

      <div className="border-border border-b p-3">
        <QuickNoteComposer onSubmit={createNote} />
      </div>

      <div className="pusula-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {notesQuery.isPending ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {strings.common.loading}
          </p>
        ) : notesQuery.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm font-medium">{copy.loadErrorTitle}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => notesQuery.refetch()}>
              {strings.common.retry}
            </Button>
          </div>
        ) : notesQuery.data.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <InboxIcon aria-hidden className="text-muted-foreground/50 size-7" />
            <p className="text-sm font-medium">{copy.emptyTitle}</p>
            <p className="text-muted-foreground text-xs">{copy.emptyDescription}</p>
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
    </aside>
  );
}

/** Always-open "add a quick note" composer — clears + stays focused after submit. */
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
      className="space-y-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
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
        className="text-sm"
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="submit" size="sm" className="w-full">
        {copy.addSubmit}
      </Button>
    </form>
  );
}
