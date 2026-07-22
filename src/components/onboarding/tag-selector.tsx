import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow } from '@/components/chip-selector';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LOCKED_INTEREST_TAGS, type LockedInterestTag } from '@/lib/onboarding/career-exam';

/**
 * Shared "pick from the locked tag vocabulary, require >=1" UI (post-review
 * fix, 2026-07-22 onboarding redesign) -- previously duplicated near-verbatim
 * between tag-picker-screen.tsx (the "Fill out my info" path) and
 * linkedin-connect-screen.tsx's confirm_tags phase. Both need the exact same
 * interaction, just different copy.
 */
export function TagSelector({
  title,
  subtitle,
  onComplete,
}: {
  title: string;
  subtitle: string;
  onComplete: (tags: LockedInterestTag[]) => void;
}) {
  const theme = useTheme();
  const [selectedTags, setSelectedTags] = useState<Set<LockedInterestTag>>(new Set());

  function toggleTag(tag: LockedInterestTag) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
        <ChipRow>
          {LOCKED_INTEREST_TAGS.map((tag) => (
            <Chip key={tag} label={tag} selected={selectedTags.has(tag)} onPress={() => toggleTag(tag)} theme={theme} />
          ))}
        </ChipRow>
        <Pressable
          disabled={selectedTags.size === 0}
          style={[styles.button, { backgroundColor: theme.accent, opacity: selectedTags.size === 0 ? 0.6 : 1 }]}
          onPress={() => onComplete(Array.from(selectedTags))}>
          <ThemedText type="smallBold" style={styles.buttonText}>
            Continue
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  button: {
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonText: {
    color: '#ffffff',
  },
});
