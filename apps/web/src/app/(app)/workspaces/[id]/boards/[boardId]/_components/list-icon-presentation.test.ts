import { describe, expect, it } from 'vitest';
import { LIST_ICON_COLORS, LIST_ICONS } from '@pusula/domain';
import {
  LIST_ICON_CHECK_FG,
  LIST_ICON_COMPONENTS,
  LIST_ICON_FG,
  LIST_ICON_SWATCH_BG,
  asListIcon,
  asListIconColor,
} from './list-icon-presentation';

describe('list icon presentation helpers', () => {
  it('covers every list icon and icon colour token from the domain palette', () => {
    expect(Object.keys(LIST_ICON_COMPONENTS).sort()).toEqual([...LIST_ICONS].sort());
    expect(Object.keys(LIST_ICON_FG).sort()).toEqual([...LIST_ICON_COLORS].sort());
    expect(Object.keys(LIST_ICON_SWATCH_BG).sort()).toEqual([...LIST_ICON_COLORS].sort());
    expect(Object.keys(LIST_ICON_CHECK_FG).sort()).toEqual([...LIST_ICON_COLORS].sort());
  });

  it('narrows unknown list icon and colour values to null', () => {
    expect(asListIcon('star')).toBe('star');
    expect(asListIcon('not-a-real-icon')).toBeNull();
    expect(asListIcon(null)).toBeNull();

    expect(asListIconColor('mavi')).toBe('mavi');
    expect(asListIconColor('not-a-real-colour')).toBeNull();
    expect(asListIconColor(null)).toBeNull();
  });
});
