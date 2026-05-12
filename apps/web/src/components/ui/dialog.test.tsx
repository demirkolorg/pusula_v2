import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@pusula/ui/dialog';
import { strings } from '@/lib/strings';

describe('DialogContent', () => {
  it('labels the built-in close button with the provided closeLabel', () => {
    render(
      <Dialog open>
        <DialogContent closeLabel={strings.common.close}>
          <DialogTitle>Başlık</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: strings.common.close })).toBeInTheDocument();
  });

  it('falls back to the Turkish default when no closeLabel is given', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Başlık</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Kapat' })).toBeInTheDocument();
  });

  it('omits the close button when showCloseButton is false', () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false} closeLabel={strings.common.close}>
          <DialogTitle>Başlık</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole('button', { name: strings.common.close })).not.toBeInTheDocument();
  });
});
