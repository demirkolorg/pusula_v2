'use client';

/**
 * Faz 9D (DEM-130) — misafir yorum yazma formu. Tiptap rich editor Faz 11
 * iyileştirme listesinde; şimdi düz `textarea` (mention parse edilmez,
 * server zaten ham metin saklar). `POST ${apiUrl}/share/${token}/comments`
 * client fetch; başarı sonrası router refresh (revalidate SSR).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Label, toast } from '@pusula/ui';
import { strings } from '@/lib/strings';

const MAX_BODY = 10_000;

type ShareCommentFormProps = {
  token: string;
  apiUrl: string;
};

export function ShareCommentForm({ token, apiUrl }: ShareCommentFormProps) {
  const router = useRouter();
  const copy = strings.share.guest;
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setError(copy.commentTooShort);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/share/${encodeURIComponent(token)}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        setError(copy.commentFailed);
        toast.error(copy.commentFailed);
        return;
      }
      setBody('');
      toast(copy.commentSent);
      router.refresh();
    } catch {
      setError(copy.commentFailed);
      toast.error(copy.commentFailed);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Label htmlFor="share-comment-body" className="sr-only">
        {copy.commentPlaceholder}
      </Label>
      <textarea
        id="share-comment-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_BODY}
        placeholder={copy.commentPlaceholder}
        rows={3}
        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        disabled={pending}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || body.trim().length === 0}>
          {pending ? copy.submitting : copy.submitComment}
        </Button>
      </div>
    </form>
  );
}
