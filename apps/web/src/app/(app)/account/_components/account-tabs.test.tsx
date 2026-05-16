import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AccountTabs } from './account-tabs';

const replaceMock = vi.fn();
let currentSearch = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

function renderTabs() {
  return render(
    <AccountTabs
      profile={<div>profile-panel</div>}
      security={<div>security-panel</div>}
      notifications={<div>notifications-panel</div>}
    />,
  );
}

describe('AccountTabs', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    currentSearch = '';
  });

  it('defaults to the profile tab when no query param is present', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Profil' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('profile-panel')).toBeInTheDocument();
  });

  it('opens the notifications tab when ?tab=notifications is in the URL', () => {
    currentSearch = 'tab=notifications';
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Bildirimler' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('notifications-panel')).toBeInTheDocument();
  });

  it('falls back to profile when ?tab= is an unknown value', () => {
    currentSearch = 'tab=nope';
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Profil' })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls router.replace with the new tab on click, preserving scroll', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole('tab', { name: 'Güvenlik' }));

    expect(replaceMock).toHaveBeenCalledWith('?tab=security', { scroll: false });
  });
});
