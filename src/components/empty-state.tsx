import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Shared "sign in to see X" fallback — was byte-identical across index.tsx,
 * explore.tsx, and vault.tsx (Section 7 review finding). All three render
 * this before `_layout.tsx`'s auth gate would ever let an unauthenticated
 * user reach them, so it's a defensive fallback, not the primary UX path.
 */
export function SignInGate({ label }: { label: string }) {
  return (
    <ThemedView style={styles.center}>
      <SafeAreaView style={styles.center}>
        <ThemedText type="subtitle" style={styles.centerText}>
          {label}
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Shared boxed empty-state card, used identically by explore.tsx (My Stack) and vault.tsx. */
export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.emptyState}>
      <ThemedText type="smallBold" style={styles.centerText}>
        {title}
      </ThemedText>
      {!!subtitle && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {subtitle}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  centerText: {
    textAlign: 'center',
  },
  emptyState: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.one,
    alignItems: 'center',
  },
});
