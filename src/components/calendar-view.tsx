import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { StackItem } from '@/lib/types';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Lightweight month-grid calendar (no external calendar library — none is
 * installed, and adding a native dep here would require a dev-client
 * rebuild out of scope for this section). Dots mark days with a stacked
 * deadline; tapping a day filters the list below to that day's items.
 */
export function CalendarView({
  items,
  selectedDate,
  onSelectDate,
}: {
  items: StackItem[];
  selectedDate: string | null;
  onSelectDate: (dateKey: string | null) => void;
}) {
  const theme = useTheme();
  const [monthOffset, setMonthOffset] = useState(0);

  const deadlinesByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const deadline = item.opportunity?.deadline;
      if (!deadline) continue;
      const key = deadline.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const viewDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const out: { key: string; day: number | null }[] = [];
    for (let i = 0; i < startOffset; i++) out.push({ key: `blank-${i}`, day: null });
    for (let day = 1; day <= daysInMonth; day++) {
      out.push({ key: toDateKey(new Date(year, month, day)), day });
    }
    return out;
  }, [viewDate]);

  return (
    <View style={styles.container}>
      <View style={styles.monthRow}>
        <Pressable onPress={() => setMonthOffset((m) => m - 1)} hitSlop={8}>
          <ThemedText type="smallBold">‹</ThemedText>
        </Pressable>
        <ThemedText type="smallBold">{monthLabel}</ThemedText>
        <Pressable onPress={() => setMonthOffset((m) => m + 1)} hitSlop={8}>
          <ThemedText type="smallBold">›</ThemedText>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.weekdayCell}>
            {label}
          </ThemedText>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const count = cell.day ? deadlinesByDay.get(cell.key) : 0;
          const isSelected = cell.key === selectedDate;
          return (
            <Pressable
              key={cell.key}
              disabled={!cell.day}
              style={[
                styles.dayCell,
                isSelected && { backgroundColor: theme.backgroundSelected, borderRadius: Spacing.two },
              ]}
              onPress={() => onSelectDate(isSelected ? null : cell.key)}>
              {cell.day != null && (
                <>
                  <ThemedText type="small">{cell.day}</ThemedText>
                  {!!count && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
