import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AttachmentPreviewDialog,
  type AttachmentPreviewDialogProps,
  type AttachmentPreviewLabels,
} from './attachment-preview-dialog';

const labels: AttachmentPreviewLabels = {
  download: 'İndir',
  openInNewTab: 'Yeni sekmede aç',
  close: 'Kapat',
  zoomIn: 'Yakınlaştır',
  zoomOut: 'Uzaklaştır',
  zoomReset: 'Sıfırla',
  zoomArea: 'Önizleme alanı',
  loading: 'Yükleniyor',
  error: 'Hata',
  prev: 'Önceki ek',
  next: 'Sonraki ek',
};

function renderDialog(over: Partial<AttachmentPreviewDialogProps> = {}) {
  const props: AttachmentPreviewDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    fileName: 'gorsel.png',
    kind: 'image',
    url: 'https://storage.test/gorsel.png',
    labels,
    ...over,
  };
  render(<AttachmentPreviewDialog {...props} />);
  return props;
}

describe('<AttachmentPreviewDialog> navigation', () => {
  it('renders prev/next chevrons and the position indicator when navigable', () => {
    renderDialog({
      onPrev: vi.fn(),
      onNext: vi.fn(),
      hasPrev: true,
      hasNext: true,
      position: { index: 2, total: 5 },
    });
    expect(screen.getByRole('button', { name: 'Önceki ek' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sonraki ek' })).toBeEnabled();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('calls onNext / onPrev when the edge chevrons are clicked', async () => {
    const user = userEvent.setup();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    renderDialog({ onPrev, onNext, hasPrev: true, hasNext: true, position: { index: 2, total: 3 } });

    await user.click(screen.getByRole('button', { name: 'Sonraki ek' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Önceki ek' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('navigates with the ArrowRight / ArrowLeft keys', async () => {
    const user = userEvent.setup();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    renderDialog({ onPrev, onNext, hasPrev: true, hasNext: true, position: { index: 2, total: 3 } });

    await user.keyboard('{ArrowRight}');
    expect(onNext).toHaveBeenCalledTimes(1);
    await user.keyboard('{ArrowLeft}');
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('disables the chevron at a boundary and does not navigate past it via keyboard', async () => {
    const user = userEvent.setup();
    const onPrev = vi.fn();
    renderDialog({
      onPrev,
      onNext: vi.fn(),
      hasPrev: false,
      hasNext: true,
      position: { index: 1, total: 3 },
    });

    expect(screen.getByRole('button', { name: 'Önceki ek' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sonraki ek' })).toBeEnabled();
    await user.keyboard('{ArrowLeft}');
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('hides chevrons and the indicator for a single previewable attachment', () => {
    renderDialog({ position: { index: 1, total: 1 } });
    expect(screen.queryByRole('button', { name: 'Önceki ek' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sonraki ek' })).not.toBeInTheDocument();
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });
});
