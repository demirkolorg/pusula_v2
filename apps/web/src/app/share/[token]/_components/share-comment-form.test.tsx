/**
 * Faz 9E (DEM-131) — `ShareCommentForm` RTL testleri.
 * Boş submit reject + fetch + başarı + hata yolları.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PusulaUi from '@pusula/ui';
import { strings } from '@/lib/strings';
import { ShareCommentForm } from './share-comment-form';

const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('@pusula/ui', async () => {
  const actual = await vi.importActual<typeof PusulaUi>('@pusula/ui');
  return {
    ...actual,
    toast: Object.assign(vi.fn(), { error: vi.fn() }),
  };
});

const originalFetch = globalThis.fetch;

beforeEach(() => {
  refreshMock.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('<ShareCommentForm>', () => {
  const props = { token: 'abc12345-test-token-deterministic-fixture-43c', apiUrl: 'http://api.test' };

  it('boş submit reject; hata mesajı görünür', async () => {
    render(<ShareCommentForm {...props} />);
    const button = screen.getByRole('button', { name: strings.share.guest.submitComment });
    expect(button).toBeDisabled();
    // boş başlatma — yine de doğru hata mesajı görünmesi için
    // submit event tetikleyelim: trim sonrası boş → commentTooShort. Disabled
    // olduğundan tıklanamaz; form submit'i programmatic tetikle.
    const form = button.closest('form')!;
    form.requestSubmit();
    await waitFor(() => {
      expect(screen.getByText(strings.share.guest.commentTooShort)).toBeInTheDocument();
    });
  });

  it('başarılı submit → fetch çağırır + router.refresh + textarea temizlenir', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'c1', createdAt: new Date().toISOString() }), { status: 201 })) as unknown as typeof fetch;

    render(<ShareCommentForm {...props} />);
    const textarea = screen.getByPlaceholderText(strings.share.guest.commentPlaceholder);
    await user.type(textarea, '  Merhaba misafir yorumu  ');
    const button = screen.getByRole('button', { name: strings.share.guest.submitComment });
    await user.click(button);

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`${props.apiUrl}/share/${encodeURIComponent(props.token)}/comments`);
    expect(JSON.parse(init.body as string)).toEqual({ body: 'Merhaba misafir yorumu' });
    expect(textarea).toHaveValue('');
  });

  it('fail status → hata mesajı görünür + router.refresh çağrılmaz', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'gone' }), { status: 410 })) as unknown as typeof fetch;

    render(<ShareCommentForm {...props} />);
    await user.type(screen.getByPlaceholderText(strings.share.guest.commentPlaceholder), 'Yorum');
    await user.click(screen.getByRole('button', { name: strings.share.guest.submitComment }));

    await waitFor(() => {
      expect(screen.getByText(strings.share.guest.commentFailed)).toBeInTheDocument();
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
