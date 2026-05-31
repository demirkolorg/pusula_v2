import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HomeBreadcrumb } from './home-breadcrumb';

describe('<HomeBreadcrumb>', () => {
  const handlers = {
    onResetAll: vi.fn(),
    onResetToBoards: vi.fn(),
    onResetToLists: vi.fn(),
  };

  beforeEach(() => {
    handlers.onResetAll.mockReset();
    handlers.onResetToBoards.mockReset();
    handlers.onResetToLists.mockReset();
  });

  it('renders only Anasayfa when nothing is selected', () => {
    render(
      <HomeBreadcrumb
        workspaceName={null}
        boardTitle={null}
        listTitle={null}
        {...handlers}
      />,
    );
    // Tek "Anasayfa" crumb'ı, son crumb olduğu için inert (text, not button).
    expect(screen.getByText('Anasayfa')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows workspace > board > list crumbs when all selected', () => {
    render(
      <HomeBreadcrumb
        workspaceName="Pazarlama"
        boardTitle="Q3 Kampanya"
        listTitle="Yapılacaklar"
        {...handlers}
      />,
    );
    expect(screen.getByText('Anasayfa')).toBeInTheDocument();
    expect(screen.getByText('Pazarlama')).toBeInTheDocument();
    expect(screen.getByText('Q3 Kampanya')).toBeInTheDocument();
    expect(screen.getByText('Yapılacaklar')).toBeInTheDocument();
  });

  it('clicking Anasayfa fires onResetAll', async () => {
    render(
      <HomeBreadcrumb
        workspaceName="Pazarlama"
        boardTitle="Q3 Kampanya"
        listTitle={null}
        {...handlers}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Anasayfa' }));
    expect(handlers.onResetAll).toHaveBeenCalledTimes(1);
  });

  it('clicking the workspace crumb fires onResetToBoards', async () => {
    render(
      <HomeBreadcrumb
        workspaceName="Pazarlama"
        boardTitle="Q3 Kampanya"
        listTitle="Yapılacaklar"
        {...handlers}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pazarlama' }));
    expect(handlers.onResetToBoards).toHaveBeenCalledTimes(1);
  });

  it('clicking the board crumb fires onResetToLists', async () => {
    render(
      <HomeBreadcrumb
        workspaceName="Pazarlama"
        boardTitle="Q3 Kampanya"
        listTitle="Yapılacaklar"
        {...handlers}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Q3 Kampanya' }));
    expect(handlers.onResetToLists).toHaveBeenCalledTimes(1);
  });

  it('last crumb is rendered as inert text (no button role)', () => {
    render(
      <HomeBreadcrumb
        workspaceName="Pazarlama"
        boardTitle={null}
        listTitle={null}
        {...handlers}
      />,
    );
    // Pazarlama son crumb — buton değil.
    expect(screen.queryByRole('button', { name: 'Pazarlama' })).not.toBeInTheDocument();
    // Anasayfa hâlâ tıklanabilir.
    expect(screen.getByRole('button', { name: 'Anasayfa' })).toBeInTheDocument();
  });
});
