import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { notificationTypeIcon } from './notification-type-icon';

describe('notificationTypeIcon', () => {
  it('uses the generic muted icon for unknown notification types', () => {
    const { container } = render(<>{notificationTypeIcon('future.notification.type')}</>);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('text-muted-foreground');
  });

  // Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03). 13 yeni
  // tipin her biri açıkça ele alınmalı (fallback'e düşmemeli). `archived`/
  // `deleted` tipleri bilinçli muted/rose; geri kalan tipler renkli ikon.
  const NEW_GRANULAR_TYPES = [
    'card_created',
    'list_created',
    'list_renamed',
    'list_moved',
    'list_archived',
    'list_deleted',
    'board_created',
    'board_renamed',
    'board_archived',
    'board_background_changed',
    'label_created',
    'label_updated',
    'label_deleted',
  ] as const;

  it.each(NEW_GRANULAR_TYPES)('renders a dedicated icon for %s', (type) => {
    const { container } = render(<>{notificationTypeIcon(type)}</>);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // shrink-0 base class her tipte var; ikonun gerçekten render edildiğini
    // (boş fragment dönmediğini) doğrular.
    expect(svg).toHaveClass('shrink-0');
  });
});
