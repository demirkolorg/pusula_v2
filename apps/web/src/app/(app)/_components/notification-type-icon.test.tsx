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
});
