import { useMemo } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MatchScoreBadge } from '@/components/match-score-badge';
import { OpportunityLogo } from '@/components/opportunity-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { applicationRequirementLabels, eligibilityLines, formatDeadline, isSafeHttpUrl } from '@/lib/format';
import { estimatedCompletionTimeFor } from '@/lib/completion-time';
import { computeMatchScore } from '@/lib/match-score';
import type { Opportunity, Profile } from '@/lib/types';

/**
 * One full-screen feed card (spec §2.2). Every required field is visible
 * without a click-through: name, logo/placeholder, due date, eligibility,
 * application requirements, match score. "Stack It" and "Apply" actions.
 */
export function OpportunityCard({
  opportunity,
  profile,
  isStacked,
  onStackIt,
  cardHeight,
}: {
  opportunity: Opportunity;
  profile: Profile | null;
  isStacked: boolean;
  onStackIt: () => void;
  cardHeight: number;
}) {
  const { score, breakdown } = useMemo(() => computeMatchScore(profile, opportunity), [profile, opportunity]);
  const reqLabels = useMemo(() => applicationRequirementLabels(opportunity), [opportunity]);
  const completionTime = useMemo(() => estimatedCompletionTimeFor(opportunity), [opportunity]);

  async function handleApply() {
    if (!isSafeHttpUrl(opportunity.link)) {
      Alert.alert('No application link', 'This opportunity doesn’t have a valid link on file yet.');
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(opportunity.link);
    } catch {
      Alert.alert('Couldn’t open link', opportunity.link);
    }
  }

  return (
    <View style={[styles.page, { height: cardHeight }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <OpportunityLogo uri={opportunity.logo_url} size={72} />
          <View style={styles.headerText}>
            <ThemedText type="title" style={styles.name}>
              {opportunity.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {opportunity.category}
            </ThemedText>
          </View>
        </View>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Due date</ThemedText>
          <ThemedText type="default">{formatDeadline(opportunity.deadline)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Est. time to complete: {completionTime}
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Eligibility</ThemedText>
          {eligibilityLines(opportunity).map((line, i) => (
            <ThemedText key={i} type="small">
              {line}
            </ThemedText>
          ))}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Application requirements</ThemedText>
          {reqLabels.length > 0 ? (
            reqLabels.map((label, i) => (
              <ThemedText key={i} type="small">
                • {label}
              </ThemedText>
            ))
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No stated requirements
            </ThemedText>
          )}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.section}>
          <MatchScoreBadge score={score} breakdown={breakdown} />
        </ThemedView>

        {opportunity.description && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
            {opportunity.description}
          </ThemedText>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          disabled={isStacked}
          onPress={onStackIt}
          style={({ pressed }) => [
            styles.actionButtonWrapper,
            pressed && !isStacked && styles.actionButtonPressed,
          ]}>
          <ThemedView type="backgroundSelected" style={[styles.actionButton, isStacked && styles.actionButtonDisabled]}>
            <ThemedText type="smallBold">{isStacked ? 'Stacked ✓' : 'Stack It'}</ThemedText>
          </ThemedView>
        </Pressable>
        <Pressable
          onPress={handleApply}
          style={({ pressed }) => [styles.actionButtonWrapper, pressed && styles.actionButtonPressed]}>
          <ThemedView type="backgroundSelected" style={styles.actionButton}>
            <ThemedText type="smallBold">Apply</ThemedText>
          </ThemedView>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    justifyContent: 'space-between',
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  name: {
    fontSize: 26,
    lineHeight: 30,
  },
  section: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  description: {
    paddingHorizontal: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  actionButtonWrapper: {
    flex: 1,
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
});
