import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Shared chip visual, extracted from onboarding's demographics (single-select
 * with optional clear) and LinkedIn tag-confirmation (multi-select) screens
 * — same pill markup/selected-state styling, different selection logic per
 * caller. Callers own selection state; this only renders one pill.
 */
export function Chip({
  label,
  selected,
  onPress,
  theme,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: { accent: string; backgroundElement: string; backgroundSelected: string };
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.accent : 'transparent',
        },
      ]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <ThemedView style={styles.chipRow}>{children}</ThemedView>;
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 2,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
