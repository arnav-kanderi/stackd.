import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MatchScoreBadge } from '@/components/match-score-badge';
import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVault } from '@/hooks/use-vault';
import { checklistPercent } from '@/lib/checklist';
import { essayReuseCandidates } from '@/lib/essay-reuse';
import { vaultContentForRequirement } from '@/lib/vault-content';
import { formatDeadline, isSafeHttpUrl } from '@/lib/format';
import { isPremium, requestStage2Score } from '@/lib/match-score-stage2';
import { markStackd, toggleChecklistItem, unstackOpportunity } from '@/lib/stack-actions';
import { requestStrategySuggestions, type StrategySuggestions } from '@/lib/strategy';
import type { ChecklistItem, Profile, StackItem } from '@/lib/types';

/**
 * Prep -> Go to Application -> checklist -> Stackd flow (spec §2.5 steps
 * 2-6). Vault content is the real user_documents/recommendation_contacts
 * data (Section 4) surfaced only for this opportunity's stated
 * requirements; the checklist/progress-bar/Stackd transition logic is
 * unchanged from Section 2.
 */
export function PrepModal({
  visible,
  stackItem,
  checklistItems,
  profile,
  onClose,
  onChanged,
  onStackd,
  onUnstacked,
}: {
  visible: boolean;
  stackItem: StackItem | null;
  checklistItems: ChecklistItem[];
  profile: Profile | null;
  onClose: () => void;
  onChanged: () => void;
  onStackd: () => void;
  onUnstacked?: () => void;
}) {
  const theme = useTheme();
  const [items, setItems] = useState<ChecklistItem[]>(checklistItems);
  const [busy, setBusy] = useState(false);
  const [unstacking, setUnstacking] = useState(false);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [stage2Loading, setStage2Loading] = useState(false);
  const [stage2Error, setStage2Error] = useState<string | null>(null);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const { documents, contacts, signedUrls } = useVault(stackItem?.user_id ?? null);

  useEffect(() => {
    setItems(checklistItems);
  }, [checklistItems, stackItem?.id]);

  // Reset the completion animation's shared values whenever a *different*
  // card is opened, so a sheet that just animated itself off-screen for a
  // prior "Stackd" tap doesn't reopen shrunk/faded for the next item.
  useEffect(() => {
    if (!visible) return;
    scale.value = 1;
    translateY.value = 0;
    opacity.value = 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stackItem?.id]);

  // Stage-2 AI score (spec §2.3 Stage 2): premium-only, and only fired here
  // -- opening the Prep view for an already-stacked item -- never on feed
  // scroll. score-match's own cache check (match_inputs_hash) makes this a
  // no-op server-side if nothing changed since the last computation, so
  // it's safe to call every time the modal opens.
  useEffect(() => {
    if (!visible || !stackItem || !isPremium(profile)) {
      setStage2Loading(false);
      setStage2Error(null);
      return;
    }
    setStage2Loading(true);
    setStage2Error(null);
    requestStage2Score(stackItem.id).then(({ result, error }) => {
      setStage2Loading(false);
      if (result) {
        onChanged();
      } else if (error) {
        // Graceful AI-failure degraded state (build-plan §7 item 4): the
        // badge below already renders Stage-1-shaped (no estimatedAcceptance)
        // whenever match_stage isn't 'stage2', so the score itself never goes
        // blank -- this just makes the "why" explicit instead of silent.
        setStage2Error(error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stackItem?.id, profile?.subscription_tier]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!stackItem?.opportunity) return null;
  const opportunity = stackItem.opportunity;

  const percent = checklistPercent(items);
  const requiresEssay = (opportunity.application_requirements ?? []).includes('essay');
  const essayCandidates =
    isPremium(profile) && requiresEssay ? essayReuseCandidates(documents, opportunity) : [];
  // Derived straight from the prop, same as percent/essayCandidates above --
  // no local mirror needed. handleGetStrategy calls onChanged() on success,
  // which re-fetches stackItem in the parent, so this stays in sync the same
  // way Stage-2 scoring's result already does (see the useEffect above).
  const strategy = (stackItem.strategy_suggestions as StrategySuggestions | null) ?? null;

  async function handleToggle(item: ChecklistItem) {
    if (!stackItem) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_complete: !i.is_complete } : i)));
    const { error } = await toggleChecklistItem(item, stackItem.id);
    if (error) {
      Alert.alert('Couldn’t update checklist', error);
    }
    onChanged();
  }

  async function handleUnstack() {
    if (!stackItem) return;
    const message =
      stackItem.status === 'Stackd'
        ? 'This removes a completed application from My Stack and frees up a slot against your free-tier stack cap.'
        : 'This frees up a slot against your free-tier stack cap.';
    Alert.alert('Remove from Stack?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setUnstacking(true);
          const { error } = await unstackOpportunity(stackItem.user_id, stackItem.id);
          setUnstacking(false);
          if (error) {
            Alert.alert('Couldn’t remove', error);
            return;
          }
          onClose();
          onUnstacked?.();
        },
      },
    ]);
  }

  async function handleGetStrategy() {
    if (!stackItem) return;
    setStrategyLoading(true);
    setStrategyError(null);
    const { result, error } = await requestStrategySuggestions(stackItem.id);
    setStrategyLoading(false);
    if (error) {
      setStrategyError(error);
      return;
    }
    if (result) {
      onChanged();
    }
  }

  async function handleGoToApplication() {
    if (!isSafeHttpUrl(opportunity.link)) {
      Alert.alert('No application link', 'This opportunity doesn’t have a valid link on file yet.');
      return;
    }
    await WebBrowser.openBrowserAsync(opportunity.link);
  }

  // spec §2.5 step 6 / master-spec §2.5: "the card visually joins a
  // pile/stack" once the checklist hits 100% and the student taps "Stackd."
  // This is a real, timed, triggered sequence (not the Section 2 scale-pulse
  // stub): the whole Prep sheet pops, then shrinks and drops down off the
  // bottom of the screen while fading out, as if it's sliding into the
  // completed pile the My Stack screen's "STACKD" group represents. The
  // modal only actually closes (onStackd, which reloads My Stack and lets
  // the newly-Stackd row play its own entrance animation there — see
  // stack-item-row.tsx) once this animation has genuinely finished playing,
  // driven by withTiming's own finished callback, not a guessed setTimeout.
  const POP_MS = 140;
  const DROP_MS = 340;

  function finishStackdAnimation() {
    setBusy(false);
    onStackd();
  }

  async function handleStackd() {
    if (!stackItem) return;
    setBusy(true);
    const { error } = await markStackd(stackItem.id);
    if (error) {
      setBusy(false);
      Alert.alert('Couldn’t complete', error);
      return;
    }

    scale.value = withSequence(
      withTiming(1.08, { duration: POP_MS, easing: Easing.out(Easing.quad) }),
      withTiming(0.8, { duration: DROP_MS, easing: Easing.in(Easing.cubic) })
    );
    translateY.value = withSequence(
      withTiming(-16, { duration: POP_MS, easing: Easing.out(Easing.quad) }),
      withTiming(480, { duration: DROP_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(finishStackdAnimation);
      })
    );
    opacity.value = withDelay(POP_MS + DROP_MS * 0.4, withTiming(0, { duration: DROP_MS * 0.6 }));
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <Animated.View style={[animatedStyle, { width: '100%' }]}>
          <ThemedView type="background" style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={styles.headerRow}>
                <ThemedText type="subtitle" style={styles.flexShrink}>
                  {opportunity.name}
                </ThemedText>
                <Pressable onPress={onClose}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Close
                  </ThemedText>
                </Pressable>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Due {formatDeadline(opportunity.deadline)}
              </ThemedText>

              <Pressable disabled={unstacking} onPress={handleUnstack}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.unstackLink}>
                  {unstacking ? 'Removing…' : 'Remove from Stack'}
                </ThemedText>
              </Pressable>

              {stackItem.match_score != null && stackItem.match_breakdown && (
                <ThemedView type="backgroundElement" style={styles.section}>
                  <MatchScoreBadge
                    score={stackItem.match_score}
                    breakdown={stackItem.match_breakdown}
                    estimatedAcceptance={
                      isPremium(profile) && stackItem.match_stage === 'stage2'
                        ? (stackItem.estimated_acceptance ?? undefined)
                        : undefined
                    }
                  />
                  {isPremium(profile) && stage2Loading && (
                    <View style={styles.stage2Row}>
                      <ActivityIndicator size="small" />
                      <ThemedText type="small" themeColor="textSecondary">
                        Computing full match analysis…
                      </ThemedText>
                    </View>
                  )}
                  {isPremium(profile) && !stage2Loading && stackItem.match_stage !== 'stage2' && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.stage2Note}>
                      Full match analysis unavailable right now{stage2Error ? ` (${stage2Error})` : ''} — showing the
                      basic match score instead.
                    </ThemedText>
                  )}
                </ThemedView>
              )}

              <ThemedView type="backgroundElement" style={styles.section}>
                <ThemedText type="smallBold">Your info for this application</ThemedText>
                {(opportunity.application_requirements ?? []).flatMap((req) =>
                  vaultContentForRequirement(req, documents, contacts, signedUrls).map((content, i) => {
                    const key = `${req}-${i}`;
                    switch (content.type) {
                      case 'file':
                        return (
                          <ThemedText key={key} type="small" style={styles.vaultLine}>
                            📄 {content.filename}
                          </ThemedText>
                        );
                      case 'contact':
                        return (
                          <ThemedText key={key} type="small" style={styles.vaultLine}>
                            {content.name} ({content.relationship}) — {content.email} · {content.status.replace('_', ' ')}
                          </ThemedText>
                        );
                      case 'text':
                      default:
                        return (
                          <ThemedText key={key} type="small" style={styles.vaultLine}>
                            {content.value}
                          </ThemedText>
                        );
                    }
                  })
                )}
                {(opportunity.application_requirements ?? []).length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    No stated requirements for this opportunity.
                  </ThemedText>
                )}
                <ThemedText type="small" themeColor="textSecondary" style={styles.copyAssistNote}>
                  Copy-paste this into the real application — stackd doesn’t auto-fill
                  third-party forms.
                </ThemedText>
              </ThemedView>

              {isPremium(profile) && (
                <ThemedView type="backgroundElement" style={styles.section}>
                  <ThemedText type="smallBold">Application strategy suggestions ✨ Premium</ThemedText>
                  {strategy ? (
                    <>
                      {strategy.strengths?.length > 0 && (
                        <>
                          <ThemedText type="small" themeColor="textSecondary">Strengths</ThemedText>
                          {strategy.strengths.map((s, i) => (
                            <ThemedText key={`s-${i}`} type="small" style={styles.vaultLine}>• {s}</ThemedText>
                          ))}
                        </>
                      )}
                      {strategy.gaps?.length > 0 && (
                        <>
                          <ThemedText type="small" themeColor="textSecondary">Gaps</ThemedText>
                          {strategy.gaps.map((g, i) => (
                            <ThemedText key={`g-${i}`} type="small" style={styles.vaultLine}>• {g}</ThemedText>
                          ))}
                        </>
                      )}
                      {strategy.suggestions?.length > 0 && (
                        <>
                          <ThemedText type="small" themeColor="textSecondary">Suggestions</ThemedText>
                          {strategy.suggestions.map((s, i) => (
                            <ThemedText key={`sg-${i}`} type="small" style={styles.vaultLine}>• {s}</ThemedText>
                          ))}
                        </>
                      )}
                    </>
                  ) : (
                    <Pressable disabled={strategyLoading} onPress={handleGetStrategy}>
                      <ThemedText type="smallBold" themeColor="accent">
                        {strategyLoading ? 'Thinking…' : 'Get strategy suggestions'}
                      </ThemedText>
                    </Pressable>
                  )}
                  {strategyError && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {strategyError}
                    </ThemedText>
                  )}
                </ThemedView>
              )}

              {isPremium(profile) && requiresEssay && (
                <ThemedView type="backgroundElement" style={styles.section}>
                  <ThemedText type="smallBold">Essay reuse suggestions ✨ Premium</ThemedText>
                  {essayCandidates.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      No essays in your vault yet to suggest reusing.
                    </ThemedText>
                  ) : (
                    essayCandidates.map((c) => (
                      <ThemedText key={c.documentId} type="small" style={styles.vaultLine}>
                        📄 {c.storagePath.split('/').pop()} — {Math.round(c.overlapScore * 100)}% topic overlap
                      </ThemedText>
                    ))
                  )}
                </ThemedView>
              )}

              <Pressable style={[styles.applyButton, { backgroundColor: theme.backgroundSelected }]} onPress={handleGoToApplication}>
                <ThemedText type="smallBold">Go to Application ↗</ThemedText>
              </Pressable>

              <ThemedView type="backgroundElement" style={styles.section}>
                <View style={styles.progressHeaderRow}>
                  <ThemedText type="smallBold">Progress</ThemedText>
                  <ThemedText type="smallBold">{percent}%</ThemedText>
                </View>
                <ProgressBar percent={percent} />

                <View style={styles.checklist}>
                  {items.map((item) => (
                    <Pressable key={item.id} style={styles.checklistRow} onPress={() => handleToggle(item)}>
                      <View
                        style={[
                          styles.checkbox,
                          { borderColor: theme.textSecondary },
                          item.is_complete && { backgroundColor: theme.accent, borderColor: theme.accent },
                        ]}>
                        {item.is_complete && <ThemedText style={styles.checkmark}>✓</ThemedText>}
                      </View>
                      <ThemedText type="default">{item.task_name}</ThemedText>
                    </Pressable>
                  ))}
                  {items.length === 0 && (
                    <ThemedText type="small" themeColor="textSecondary">
                      No checklist items for this opportunity.
                    </ThemedText>
                  )}
                </View>
              </ThemedView>

              <Pressable
                disabled={percent < 100 || busy || stackItem.status === 'Stackd'}
                style={[
                  styles.stackdButton,
                  { backgroundColor: theme.backgroundSelected },
                  (percent < 100 || stackItem.status === 'Stackd') && styles.stackdButtonDisabled,
                ]}
                onPress={handleStackd}>
                <ThemedText type="smallBold">
                  {stackItem.status === 'Stackd' ? 'Stackd ✓' : 'Stackd'}
                </ThemedText>
              </Pressable>
            </ScrollView>
          </ThemedView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    maxHeight: '88%',
    paddingTop: Spacing.four,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  flexShrink: {
    flexShrink: 1,
  },
  unstackLink: {
    textDecorationLine: 'underline',
  },
  section: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  vaultLine: {
    lineHeight: 20,
  },
  stage2Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  stage2Note: {
    marginTop: Spacing.one,
    lineHeight: 18,
  },
  copyAssistNote: {
    marginTop: Spacing.one,
  },
  applyButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  checklist: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  stackdButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  stackdButtonDisabled: {
    opacity: 0.4,
  },
});
