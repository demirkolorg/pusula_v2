'use client';

import { useId, useState } from 'react';
import { InboxIcon, PencilLineIcon, PlusIcon, XIcon } from 'lucide-react';
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
   * Board ekranı dışında `false` geçilir → drag handle gizli, kullanıcı sadece
   * not yazıp/düzenleyip/silebilir.
   */
  canConvert: boolean;
  /** Close the panel (the global header toggle owns the open state). */
  onClose: () => void;
  /**
   * Bir link / aksiyon sonrası çağrılır. Mobil sheet modunda panelin kendini
   * kapatması için kullanılır; persistent (lg+) modda parent `undefined`
   * geçer ve panel açık kalır. Şu an Hızlı Notlar'ın içinde navigate yok;
   * future-proof için Gezgin paneliyle simetrik tutuldu.
   */
  onNavigate?: () => void;
};

/**
 * Global "Hızlı Notlar" paneli (DEM-205) — uygulamanın her ekranında erişilebilen,
 * Trello "Gelen Kutusu" mantığında kişisel yakalama paneli. Üstte not ekleme
 * alanı, altında notlar yeniden-eskiye. Pano ekranında bir not satırı bir
 * listeye sürüklenince karta dönüşür (`QuickNoteRow` + board
 * `monitorForElements`); pano dışında drag handle gizli (sadece CRUD).
 *
 * Gezgin paneliyle birebir aynı görsel + davranış:
 * - **Sistem teması:** `bg-background` + `text-foreground` (pano arka planı
 *   etkilemez).
 * - `lg+`: persistent sidebar (yuvarlak köşeli kart).
 * - `<lg`: overlay sheet (full-bleed).
 */
export function QuickNotesPanel({ canConvert, onClose }: QuickNotesPanelProps) {
  const trpc = useTRPC();
  const notesQuery = useQuery(trpc.quickNote.list.queryOptions());
  const { createNote, updateNote, deleteNote } = useQuickNoteMutations();
  const copy = strings.board.quickNotes;

  return (
    <aside
      aria-label={copy.panelTitle}
      // `lg+`: yuvarlak kart (Trello "Gelen Kutusu" deseni); sistem teması
      // (Gezgin paneliyle aynı). Mobilde köşesiz — paneller arası gap yok.
      className="bg-background text-foreground border-border flex h-full w-96 shrink-0 flex-col overflow-hidden lg:rounded-xl lg:border"
    >
      <header className="bg-card text-card-foreground border-border flex min-h-14 shrink-0 items-center gap-2 border-b px-3">
        <InboxIcon aria-hidden className="size-4 opacity-70" />
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <QuickNoteComposer onSubmit={createNote} />

        <div className="pusula-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
          {notesQuery.isPending ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {strings.common.loading}
            </p>
          ) : notesQuery.isError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-foreground text-sm font-medium">{copy.loadErrorTitle}</p>
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
              <InboxIcon aria-hidden className="text-muted-foreground size-7" />
              <p className="text-foreground text-sm font-medium">{copy.emptyTitle}</p>
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
      </div>
    </aside>
  );
}

/**
 * Always-open "add a quick note" composer — clears + stays focused after submit.
 * Form `bg-muted` tinted yüzey üzerine `bg-card` textarea — sistem temasıyla
 * uyumlu (pano arka planından bağımsız).
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
      className="bg-muted/50 ring-border shrink-0 space-y-2.5 rounded-xl p-3 ring-1"
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
