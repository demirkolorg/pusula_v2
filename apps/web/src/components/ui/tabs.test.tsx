import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pusula/ui/tabs';

describe('Tabs', () => {
  it('shows the active tab panel and switches on click', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="comments">
        <TabsList>
          <TabsTrigger value="comments">Yorumlar</TabsTrigger>
          <TabsTrigger value="activity">Aktivite</TabsTrigger>
        </TabsList>
        <TabsContent value="comments">Yorum içeriği</TabsContent>
        <TabsContent value="activity">Aktivite içeriği</TabsContent>
      </Tabs>,
    );

    expect(screen.getByText('Yorum içeriği')).toBeInTheDocument();
    expect(screen.queryByText('Aktivite içeriği')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Aktivite' }));
    expect(screen.getByText('Aktivite içeriği')).toBeInTheDocument();
  });
});
