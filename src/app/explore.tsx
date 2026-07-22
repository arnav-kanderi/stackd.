import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarView } from '@/components/calendar-view';
import { EmptyState, SignInGate } from '@/components/empty-state';
import { PrepModal } from '@/components/prep-modal';
import { StackItemRow } from '@/components/stack-item-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/hooks/use-profile';
import { supabase } from '@/lib/supabase';
import { STACK_STATUSES, type ChecklistItem, type StackItem, type StackStatus } from '@/lib/types';
import { effectiveStatus, isDueSoon } from '@/lib/stack-actions';

type ViewMode = 'list' | 'calendar';

/**
 * My Stack dashboard (spec §2.5): 5 statuses, list view ordered by
 * deadline, calendar view, and a due-this-week summary banner.
 */
export default function MyStackScreen() {
  const theme = useTheme();
  const { profile, userId } = useProfile();

  const [items, setItems] = useState<StackItem[]>([]);
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  // One-shot set of ids that transitioned to Stackd THIS session, so
  // StackItemRow's entering animation only plays for a genuine just-now
  // completion, not for every already-Stackd item on a fresh screen mount
  // (found during Section 7 review -- `status === 'Stackd'` alone can't
  // distinguish the two).
  const [recentlyStackdIds, setRecentlyStackdIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setChecklists({});
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('stack_items')
      .select('*, opportunity:opportunities(*), checklist_items(*)')
      .eq('user_id', userId);

    if (!error && data) {
      const nextChecklists: Record<string, ChecklistItem[]> = {};
      const stackItems: StackItem[] = data.map((row: any) => {
        nextChecklists[row.id] = row.checklist_items ?? [];
        const { checklist_items, ...rest } = row;
        return rest as StackItem;
      });
      setItems(stackItems);
      setChecklists(nextChecklists);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const dueThisWeekCount = useMemo(
    () => items.filter((i) => i.status !== 'Stackd' && isDueSoon(i.opportunity?.deadline)).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    if (viewMode === 'calendar' && selectedDate) {
      return items.filter((i) => i.opportunity?.deadline?.slice(0, 10) === selectedDate);
    }
    return items;
  }, [items, viewMode, selectedDate]);

  const grouped = useMemo(() => {
    const groups: Record<StackStatus, StackItem[]> = {
      Saved: [],
      'In Progress': [],
      'Ready to Submit': [],
      'Due Soon': [],
      Stackd: [],
    };
    for (const item of filteredItems) {
      groups[effectiveStatus(item)].push(item);
    }
    for (const status of STACK_STATUSES) {
      groups[status].sort((a, b) => {
        const da = a.opportunity?.deadline ?? '9999-12-31';
        const db = b.opportunity?.deadline ?? '9999-12-31';
        return da.localeCompare(db);
      });
    }
    return groups;
  }, [filteredItems]);

  const activeItem = items.find((i) => i.id === activeItemId) ?? null;

  async function handleModalChanged() {
    await load();
  }

  async function handleStackd() {
    if (activeItemId) {
      setRecentlyStackdIds((prev) => new Set(prev).add(activeItemId));
    }
    setActiveItemId(null);
    await load();
  }

  async function handleUnstacked() {
    setActiveItemId(null);
    await load();
  }

  if (!userId) {
    return <SignInGate label="Sign in to see My Stack" />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: BottomTabInset + Spacing.four }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
          <ThemedText type="title" style={styles.pageTitle}>
            My Stack
          </ThemedText>

          <ThemedView type="backgroundSelected" style={styles.banner}>
            <ThemedText type="smallBold">
              {dueThisWeekCount > 0
                ? `You have ${dueThisWeekCount} opportunit${dueThisWeekCount === 1 ? 'y' : 'ies'} due this week`
                : 'Nothing due in the next 7 days'}
            </ThemedText>
          </ThemedView>

          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleButton, viewMode === 'list' && { backgroundColor: theme.backgroundSelected }]}
              onPress={() => setViewMode('list')}>
              <ThemedText type="smallBold">List</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, viewMode === 'calendar' && { backgroundColor: theme.backgroundSelected }]}
              onPress={() => setViewMode('calendar')}>
              <ThemedText type="smallBold">Calendar</ThemedText>
            </Pressable>
          </View>

          {viewMode === 'calendar' && (
            <CalendarView items={items} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          )}

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <ThemedText type="small" themeColor="textSecondary">
                Loading your stack…
              </ThemedText>
            </View>
          )}

          {!loading && items.length === 0 && (
            <EmptyState
              title="Nothing stacked yet"
              subtitle="Head to the feed and tap “Stack It” on an opportunity — it'll show up here."
            />
          )}

          {STACK_STATUSES.map((status) => {
            const list = grouped[status];
            if (list.length === 0) return null;
            return (
              <View key={status} style={styles.group}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {status.toUpperCase()} ({list.length})
                </ThemedText>
                {list.map((item) => (
                  <StackItemRow
                    key={item.id}
                    item={item}
                    checklistItems={checklists[item.id] ?? []}
                    onPress={() => setActiveItemId(item.id)}
                    justStackd={recentlyStackdIds.has(item.id)}
                  />
                ))}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <PrepModal
        visible={!!activeItem}
        stackItem={activeItem}
        checklistItems={activeItem ? checklists[activeItem.id] ?? [] : []}
        profile={profile}
        onClose={() => setActiveItemId(null)}
        onChanged={handleModalChanged}
        onStackd={handleStackd}
        onUnstacked={handleUnstacked}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  pageTitle: {
    fontSize: 32,
    lineHeight: 38,
  },
  banner: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  toggleButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.five,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  group: {
    gap: Spacing.two,
  },
});
