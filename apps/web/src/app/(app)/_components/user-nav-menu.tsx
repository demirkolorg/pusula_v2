'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOutIcon, UserIcon } from 'lucide-react';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pusula/ui';
import { authClient } from '@/lib/auth-client';
import { strings } from '@/lib/strings';

type UserNavMenuProps = {
  userName: string;
  userEmail: string;
  /** Avatar image URL; omitted/`null` falls back to initials. */
  userImage?: string | null;
};

export function UserNavMenu({ userName, userEmail, userImage }: UserNavMenuProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const copy = strings.shell.userMenu;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } catch {
      // Sign-out is best-effort; leave for /sign-in either way.
    } finally {
      router.replace('/sign-in');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={copy.ariaLabel}
          className="size-9 rounded-full"
        >
          <Avatar
            name={userName || userEmail}
            image={userImage}
            size="md"
            className="size-8"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="w-56">
        <DropdownMenuLabel>
          <span className="grid leading-tight">
            <span className="truncate text-sm font-medium">{userName}</span>
            <span className="text-muted-foreground truncate text-xs">{userEmail}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/account')}>
          <UserIcon />
          {copy.account}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            void handleSignOut();
          }}
        >
          <LogOutIcon />
          {signingOut ? strings.shell.signingOut : strings.shell.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
