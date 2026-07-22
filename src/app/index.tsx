import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, SignInGate } from '@/components/empty-state';
import { OpportunityCard } from '@/components/opportunity-card';
import { PaywallModal } from '@/components/paywall-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { stackOpportunity } from '@/lib/stack-actions';
import { supabase } from '@/lib/supabase';
import type { Opportunity } from '@/lib/types';

/**
 * Vertical, full-screen, TikTok-style feed (spec §2.2). One opportunity per
 * screen, snap-scroll. Auto-removal of past-deadline opportunities happens
 * server-side (daily Edge Function flips is_active=false) — this screen
 * just filters on is_active = true.
 */
export default function FeedScreen() {
  const { height } = useWindowDimensions();
  const cardHeight = height - BottomTabInset;
  const { profile, userId } = useProfile();

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stackedIds, setStackedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [stackingId, setStackingId] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('opportunities')
      .select('*')
      .eq('is_active', true)
      .order('deadline', { ascending: true });
    setOpportunities((data as Opportunity[]) ?? []);
    setLoading(false);
  }, []);

  const loadStacked = useCallback(async () => {
    if (!userId) {
      setStackedIds(new Set());
      return;
    }
    const { data } = await supabase.from('stack_items').select('opportunity_id').eq('user_id', userId);
    setStackedIds(new Set((data ?? []).map((r) => r.opportunity_id as string)));
  }, [userId]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    loadStacked();
  }, [loadStacked]);

  async function handleStackIt(opportunity: Opportunity) {
    if (!userId) return;
    setStackingId(opportunity.id);
    const { error, paywalled } = await stackOpportunity(userId, opportunity, profile);
    setStackingId(null);
    if (paywalled) {
      // spec §3.1: 11th "Stack It" attempt on free tier -- paywall modal
      // instead of saving. No match-scoring/storage call happened for this
      // opportunity (stackOpportunity's RPC rejects before any insert).
      setPaywallVisible(true);
      return;
    }
    if (!error) {
      setStackedIds((prev) => new Set(prev).add(opportunity.id));
    }
  }

  if (!userId) {
    // Defensive fallback only -- the root layout (src/app/_layout.tsx) gates
    // unauthenticated users to AuthScreen before this screen ever mounts, so
    // this should be unreachable in normal navigation.
    return <SignInGate label="Sign in to see your feed" />;
  }

  if (loading && opportunities.length === 0) {
    return (
      <ThemedView style={styles.center}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator size="large" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            Finding opportunities for you…
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!loading && opportunities.length === 0) {
    return (
      <ThemedView style={styles.center}>
        <SafeAreaView style={styles.center}>
          <ThemedText type="subtitle" style={styles.centerText}>
            No active opportunities right now
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            Check back soon — new opportunities are added regularly.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={opportunities}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={cardHeight}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
        renderItem={({ item }) => (
          <OpportunityCard
            opportunity={item}
            profile={profile}
            isStacked={stackedIds.has(item.id)}
            onStackIt={() => handleStackIt(item)}
            cardHeight={cardHeight}
          />
        )}
        extraData={[stackedIds, stackingId]}
      />
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  link: {
    marginTop: Spacing.two,
  },
});
