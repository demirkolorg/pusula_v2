import { useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

/**
 * Türkçe ay adları (tam) — başlık için. `format-date.ts` kısa adları
 * tutar; takvim başlığı tam ad gösterir. `Intl` yerine elle çeviri:
 * deterministik, Hermes/platform farkından bağımsız (mobil tarih deseni).
 */
const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

/** Pazartesi-başlangıçlı gün kısaltmaları — TR takvim düzeni. */
const TR_WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'] as const;

type MonthCalendarProps = {
  /** Vurgulanacak seçili gün — `null` ise yalnız bugün vurgulu. */
  selected: Date | null;
  /** Bir güne dokunulunca yerel gece-yarısı `Date` ile çağrılır. */
  onSelectDate: (date: Date) => void;
  /** `true` ise günler dokunulamaz (uçuştaki mutation sırasında). */
  disabled?: boolean;
};

/** İki tarih aynı takvim gününe mi düşüyor (yıl + ay + gün). */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Bağımlılıksız ay-grid takvim (Faz 7G-3 — kart son tarihi tam seçici).
 *
 * Tek ay ızgarası: ‹ ay-yıl › navigasyonu + Pazartesi-başlangıçlı gün
 * satırı + gün hücreleri; bugün ve seçili gün vurgulu. Yeni native
 * bağımlılık yoktur (`@react-native-community/datetimepicker` eklenmedi —
 * 7G-2/7K "yeni dep eklemeden" presedanı); Expo Go uyumlu, NativeWind ile
 * design token'lara hizalı. Saat sabitleme çağırana aittir — `onSelectDate`
 * yerel gece-yarısı bir `Date` döndürür (`due-date-sheet` 18:00'a sabitler).
 */
export function MonthCalendar({ selected, onSelectDate, disabled = false }: MonthCalendarProps) {
  const theme = themeFor(useColorScheme());
  // Mount anına sabitlenir — render başına yeni `Date` üretmemek için.
  const [today] = useState(() => new Date());
  // Görüntülenen ay — seçili gün varsa onun ayı, yoksa bu ay.
  const [view, setView] = useState(() => {
    const base = selected ?? today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const shiftMonth = (delta: number) => {
    setView((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  // Ayın ilk gününün Pazartesi-başlangıçlı sütun indisi (0=Pzt … 6=Paz).
  const firstWeekday = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  // Önde boş hücreler + ayın günleri + satırı 7'ye tamamlayan boş hücreler.
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-3">
      {/* Ay navigasyonu */}
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.cardDetail.dueCalendarPrevMonth}
          disabled={disabled}
          hitSlop={8}
          onPress={() => shiftMonth(-1)}
          className={`rounded-full p-1.5 ${disabled ? 'opacity-50' : 'active:opacity-60'}`}
        >
          <Icon name="chevron-left" size={20} color={theme.foreground} />
        </Pressable>
        <Text weight="semibold" className="text-sm text-foreground">
          {TR_MONTHS[view.month]} {view.year}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.cardDetail.dueCalendarNextMonth}
          disabled={disabled}
          hitSlop={8}
          onPress={() => shiftMonth(1)}
          className={`rounded-full p-1.5 ${disabled ? 'opacity-50' : 'active:opacity-60'}`}
        >
          <Icon name="chevron-right" size={20} color={theme.foreground} />
        </Pressable>
      </View>

      {/* Gün başlıkları */}
      <View className="flex-row">
        {TR_WEEKDAYS.map((weekday) => (
          <View key={weekday} className="flex-1 items-center py-1">
            <Text className="text-xs text-muted-foreground">{weekday}</Text>
          </View>
        ))}
      </View>

      {/* Gün ızgarası */}
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} className="flex-row">
          {week.map((day, dayIndex) => {
            if (day == null) {
              return <View key={dayIndex} className="flex-1" />;
            }
            const date = new Date(view.year, view.month, day);
            const isSelected = selected != null && isSameDay(date, selected);
            const isToday = isSameDay(date, today);
            return (
              <View key={dayIndex} className="flex-1 items-center py-0.5">
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled }}
                  accessibilityLabel={`${day} ${TR_MONTHS[view.month]} ${view.year}${
                    isToday ? `, ${strings.cardDetail.dueToday}` : ''
                  }`}
                  disabled={disabled}
                  onPress={() => onSelectDate(date)}
                  className={`h-9 w-9 items-center justify-center rounded-full ${
                    isSelected ? 'bg-primary' : isToday ? 'border border-primary' : ''
                  } ${disabled ? 'opacity-50' : 'active:opacity-60'}`}
                >
                  <Text
                    weight={isSelected || isToday ? 'medium' : 'regular'}
                    className={`text-sm ${
                      isSelected
                        ? 'text-primary-foreground'
                        : isToday
                          ? 'text-primary'
                          : 'text-foreground'
                    }`}
                  >
                    {day}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
