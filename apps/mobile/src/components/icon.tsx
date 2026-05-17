import type { ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Feather>['name'];

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
};

/**
 * İkon sarmalayıcısı — `@expo/vector-icons` `Feather` (web `lucide-react` ile
 * görsel dil tutarlı; lucide Feather'ın türevi). Tek sarmalayıcı, ileride
 * istenirse ikon kütüphanesi değişimi bu dosyada kalır.
 */
export function Icon({ name, size = 20, color }: IconProps) {
  return <Feather name={name} size={size} color={color} />;
}

export type { IconName };
