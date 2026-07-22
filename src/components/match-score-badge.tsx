import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { MatchBreakdown } from '@/lib/types';

/**
 * Renders the "98% Match / ✓ Business / ✓ US Citizen / ..." block from spec
 * §2.3's example. On the feed (opportunity-card.tsx) this is always
 * Stage-1 only, per spec -- Stage-2 only ever applies to stacked items.
 * `estimatedAcceptance` is optional and only ever passed by callers
 * displaying a stacked item's cached Stage-2 result to a premium user
 * (spec §2.3's "Estimated acceptance: High" line) -- free-tier callers and
 * the feed never pass it, so this stays Stage-1-shaped by default.
 */
export function MatchScoreBadge({
  score,
  breakdown,
  compact = false,
  estimatedAcceptance,
}: {
  score: number;
  breakdown: MatchBreakdown;
  compact?: boolean;
  estimatedAcceptance?: 'High' | 'Medium' | 'Low' | null;
}) {
  const allChecks = [...breakdown.tags, ...breakdown.eligibility];

  return (
    <View style={styles.container}>
      <ThemedText type={compact ? 'smallBold' : 'subtitle'} themeColor="text">
        {score}% Match
      </ThemedText>
      {!compact && (
        <View style={styles.checklist}>
          {allChecks.map((check, i) => (
            <ThemedText
              key={`${check.label}-${i}`}
              type="small"
              themeColor={check.met ? 'text' : 'textSecondary'}
              style={styles.checkLine}>
              {check.met ? '✓' : '✗'} {check.label}
            </ThemedText>
          ))}
          {allChecks.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              No stated criteria to match against
            </ThemedText>
          )}
        </View>
      )}
      {!compact && estimatedAcceptance && (
        <ThemedText type="smallBold" style={styles.acceptance}>
          Estimated acceptance: {estimatedAcceptance}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  checklist: {
    gap: 2,
  },
  checkLine: {
    lineHeight: 18,
  },
  acceptance: {
    marginTop: Spacing.one,
  },
});
