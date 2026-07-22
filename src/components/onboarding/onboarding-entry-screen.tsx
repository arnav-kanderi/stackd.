import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Entry-path picker (2026-07-22 onboarding redesign, replacing spec §2.1's
 * career exam entirely): "Fill out my info" (new default -- tag picker +
 * vault collection) or "Connect LinkedIn instead" (unchanged).
 */
export function OnboardingEntryScreen({
  onPickFillInfo,
  onPickLinkedIn,
}: {
  onPickFillInfo: () => void;
  onPickLinkedIn: () => void;
}) {
  const theme = useTheme();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Let&rsquo;s find your stack
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Tell us a bit about yourself, or connect LinkedIn to skip straight to your interests.
        </ThemedText>

        <Pressable style={[styles.button, { backgroundColor: theme.accent }]} onPress={onPickFillInfo}>
          <ThemedText type="smallBold" style={styles.buttonText}>
            Fill out my info
          </ThemedText>
        </Pressable>

        <Pressable
          style={[styles.button, styles.secondaryButton, { borderColor: theme.accent }]}
          onPress={onPickLinkedIn}>
          <ThemedText type="smallBold" themeColor="accent">
            Connect LinkedIn instead
          </ThemedText>
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
    fontSize: 34,
    lineHeight: 40,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  button: {
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  buttonText: {
    color: '#ffffff',
  },
});
