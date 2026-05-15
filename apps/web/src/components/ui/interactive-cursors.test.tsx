import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@pusula/ui/button';
import { CardCompleteToggle } from '@pusula/ui/card-complete-toggle';
import { Checkbox } from '@pusula/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@pusula/ui/context-menu';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@pusula/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pusula/ui/dropdown-menu';
import { MetaChip } from '@pusula/ui/meta-chip';
import { Popover, PopoverTrigger } from '@pusula/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pusula/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@pusula/ui/tabs';

describe('interactive UI cursors', () => {
  it('uses pointer cursor for shared clickable roots', () => {
    render(
      <>
        <Button>Kaydet</Button>
        <Checkbox aria-label="Tamamlandi" />
        <CardCompleteToggle checked={false} aria-label="Karti tamamla" />
        <Tabs defaultValue="board">
          <TabsList>
            <TabsTrigger value="board">Pano</TabsTrigger>
          </TabsList>
        </Tabs>
        <MetaChip interactive variant="modal">
          Tarih
        </MetaChip>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Kaydet' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('checkbox', { name: 'Tamamlandi' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('checkbox', { name: 'Karti tamamla' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('tab', { name: 'Pano' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('button', { name: 'Tarih' })).toHaveClass('cursor-pointer');
  });

  it('uses pointer cursor for Radix trigger and item wrappers', () => {
    render(
      <>
        <DropdownMenu open>
          <DropdownMenuTrigger>Menu ac</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Yeniden adlandir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ContextMenu>
          <ContextMenuTrigger>Hedef</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Arsivle</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <Popover>
          <PopoverTrigger>Secenekler</PopoverTrigger>
        </Popover>
        <Dialog open modal={false}>
          <DialogTrigger>Dialog ac</DialogTrigger>
          <DialogContent showCloseButton={false} aria-describedby={undefined}>
            <DialogTitle>Baslik</DialogTitle>
            <DialogClose>Kapat</DialogClose>
          </DialogContent>
        </Dialog>
        <Select open value="one">
          <SelectTrigger aria-label="Secim">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one">Bir</SelectItem>
          </SelectContent>
        </Select>
      </>,
    );
    fireEvent.contextMenu(screen.getByText('Hedef'));

    expect(screen.getByRole('button', { name: 'Menu ac', hidden: true })).toHaveClass(
      'cursor-pointer',
    );
    expect(screen.getByRole('menuitem', { name: 'Yeniden adlandir', hidden: true })).toHaveClass(
      'cursor-pointer',
    );
    expect(screen.getByText('Hedef')).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Arsivle', hidden: true })).toHaveClass(
      'cursor-pointer',
    );
    expect(screen.getByRole('button', { name: 'Secenekler', hidden: true })).toHaveClass(
      'cursor-pointer',
    );
    expect(screen.getByRole('button', { name: 'Dialog ac', hidden: true })).toHaveClass(
      'cursor-pointer',
    );
    expect(screen.getByRole('button', { name: 'Kapat', hidden: true })).toHaveClass(
      'cursor-pointer',
    );
    expect(screen.getByRole('combobox', { name: 'Secim', hidden: true })).toHaveClass(
      'cursor-pointer',
    );
    expect(screen.getByRole('option', { name: 'Bir', hidden: true })).toHaveClass('cursor-pointer');
  });
});
