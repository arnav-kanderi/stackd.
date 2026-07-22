import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';

import { OpportunityLogo } from '@/components/opportunity-logo';
import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { checklistPercent } from '@/lib/checklist';
import { formatDeadline } from '@/lib/format';
import type { ChecklistItem, StackItem } from '@/lib/types';

// Second half of the Stackd completion animation (spec §2.5 step 6 — see
// prep-modal.tsx's handleStackd for the first half). When a row moves into
// the "Stackd" group it genuinely mounts fresh in that group's <View> (it
// unmounts from whatever status group it was in before), so Reanimated's
// `entering` prop fires exactly once, at the moment it "lands" — a small
// drop-and-settle that reads as the card joining the completed pile.
const stackdLandingKeyframe = new Keyframe({
  0: {
    opacity: 0,
    transform: [{ translateY: -22 }, { scale: 0.92 }],
  },
  55: {
    opacity: 1,
    transform: [{ translateY: 6 }, { scale: 1.03 }],
    easing: Easing.out(Easing.cubic),
  },
  100: {
    transform: [{ translateY: 0 }, { scale: 1 }],
    easing: Easing.out(Easing.quad),
  },
}).duration(420);

export function StackItemRow({
  item,
  checklistItems,
  onPress,
  justStackd = false,
}: {
  item: StackItem;
  checklistItems: ChecklistItem[];
  onPress: () => void;
  /** True when this row is rendered inside the "Stackd" group -- plays the
   * pile-landing entrance animation. Passed by the caller (explore.tsx)
   * rather than derived from item.status here, since "which group is this
   * being rendered in" is a layout concern the parent already owns. */
  justStackd?: boolean;
}) {
  const percent = checklistPercent(checklistItems);

  return (
    <Animated.View entering={justStackd ? stackdLandingKeyframe : undefined}>
      <Pressable onPress={onPress}>
        <ThemedView type="backgroundElement" style={styles.row}>
          <OpportunityLogo uri={item.opportunity?.logo_url ?? null} size={48} />
          <View style={styles.info}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {item.opportunity?.name ?? 'Unknown opportunity'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Due {formatDeadline(item.opportunity?.deadline ?? null)}
              {item.match_score != null ? ` · ${item.match_score}% match` : ''}
            </ThemedText>
            {checklistItems.length > 0 && (
              <View style={styles.progressRow}>
                <ProgressBar percent={percent} />
                <ThemedText type="small" themeColor="textSecondary">
                  {percent}%
                </ThemedText>
              </View>
            )}
          </View>
        </ThemedView>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: Spacing.half,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
