'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CopyIcon, FileJsonIcon } from 'lucide-react';
import { bulkImportChecklistsBody } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@pusula/ui';
import { strings } from '@/lib/strings';

type BulkImportChecklist = { title: string; items: string[] };

/**
 * "JSON ile içe aktar" — bir karta tek seferde birden fazla yapılacaklar
 * listesini + maddelerini ekler. Trigger `SectionHeader` action slotunda durur
 * (ikon-only, `AddChecklistTrigger` stiliyle uyumlu); tıklayınca shadcn
 * `Dialog` açılır.
 *
 * Akış: yapıştırılan metin `JSON.parse` (başarısızsa "Geçersiz JSON") →
 * `bulkImportChecklistsBody.safeParse` (Zod, Türkçe path'li ilk hata) →
 * geçerliyse `onImport(checklists)` (wiring `cardId`/`clientMutationId` ekler).
 *
 * Mutation'ı wiring fire-and-forget tetikler; bu bileşen `pending`/`error`
 * prop'larıyla sunucu yanıtını izler: gönderim sonrası `pending` düşüp `error`
 * yoksa **başarı** sayar → formu temizler + dialog'u kapatır; `error` varsa
 * dialog açık kalır ve hatayı gösterir. Böylece gerçek optimistic olmadan da
 * yükleniyor durumu + sunucu hatası kullanıcıya yansır.
 */
export function ChecklistBulkImportDialog({
  onImport,
  pending,
  error,
  disabled,
}: {
  onImport: (checklists: BulkImportChecklist[]) => void;
  /** Toplu içe aktarma mutation'ı devam ediyor mu (sadece bu mutation). */
  pending: boolean;
  /** Sunucu tarafı hata mesajı (sadece bu mutation); yoksa `null`. */
  error?: string | null;
  /** Diğer checklist mutation'ları devam ederken trigger'ı kilitle. */
  disabled?: boolean;
}) {
  const copy = strings.card.checklist.bulkImport;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  // İstemci tarafı doğrulama hatası (JSON.parse veya Zod). Sunucu hatası ayrı
  // (`error` prop) — ikisi birden görünmez, `parseError` önceliklidir.
  const [parseError, setParseError] = useState<string | null>(null);
  // Gönderim yapıldı mı — sunucu yanıtına göre kapatmayı tetikler.
  const [submitted, setSubmitted] = useState(false);
  // Gönderimden sonra `pending`'in bir kez `true` olduğunu gördük mü. Kapatmayı
  // yalnız `true → false` geçişinde tetiklemek için; aksi halde `mutate` ile
  // `pending`'in yayılması arasındaki tek-render boşluğunda dialog erkenden
  // kapanabilir (yarış). Ref render tetiklemez.
  const sawPendingRef = useRef(false);

  const reset = () => {
    setValue('');
    setParseError(null);
    setSubmitted(false);
    sawPendingRef.current = false;
  };

  // Sunucu yanıtını izle: gönderimden sonra `pending` bir kez yükselip düşünce,
  // hata yoksa başarı say → temizle + kapat. Hata varsa açık bırak (düzeltilir).
  useEffect(() => {
    if (!submitted) return;
    if (pending) {
      sawPendingRef.current = true;
      return;
    }
    if (!sawPendingRef.current) return;
    setSubmitted(false);
    sawPendingRef.current = false;
    if (!error) {
      reset();
      setOpen(false);
    }
  }, [submitted, pending, error]);

  const handleOpenChange = (next: boolean) => {
    // Gönderim sürerken kapanışı engelle (istenmeyen kayıp yükleme durumu).
    if (!next && pending) return;
    if (!next) reset();
    setOpen(next);
  };

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(copy.template);
      toast.success(copy.templateCopied);
    } catch {
      toast.error(copy.templateCopyError);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setParseError(copy.invalidJson);
      return;
    }
    const result = bulkImportChecklistsBody.safeParse(parsed);
    if (!result.success) {
      setParseError(result.error.issues[0]?.message ?? strings.common.unknownError);
      return;
    }
    setParseError(null);
    setSubmitted(true);
    onImport(result.data.checklists);
  };

  const shownError = parseError ?? error ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={copy.action}
            >
              <FileJsonIcon className="size-4" aria-hidden />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{copy.action}</TooltipContent>
      </Tooltip>

      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.dialogTitle}</DialogTitle>
          <DialogDescription>{copy.dialogDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                {copy.templateLabel}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground -mr-1.5 h-7 gap-1.5 px-2"
                onClick={handleCopyTemplate}
              >
                <CopyIcon className="size-3.5" aria-hidden />
                {copy.copyTemplate}
              </Button>
            </div>
            <pre className="pusula-scrollbar bg-muted/50 max-h-40 overflow-auto rounded-md border p-3 text-xs leading-relaxed">
              <code>{copy.template}</code>
            </pre>
          </div>

          <Textarea
            name="checklistBulkImportJson"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (parseError) setParseError(null);
            }}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            disabled={pending}
            rows={8}
            // `@pusula/ui` Textarea varsayılanı `field-sizing-content` (içerikle
            // auto-grow) — uzun JSON'da textarea onlarca satıra büyüyüp dialog'u
            // taşırır. `field-sizing-fixed` ile `rows`'a sabitle; içerik uzarsa
            // `max-h-64` + `overflow-y-auto` textarea'nın KENDİ içinde scroll'lanır.
            className="field-sizing-fixed max-h-64 resize-y overflow-y-auto font-mono text-xs"
            aria-invalid={shownError ? true : undefined}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />

          {shownError && (
            <Alert variant="destructive">
              <AlertDescription>{shownError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || value.trim().length === 0}>
              {pending ? copy.submitting : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
