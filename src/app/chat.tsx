import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { fetchChatHistory, sendChatMessage, type ChatMessageRow } from '@/lib/chat';

/**
 * Chatbot screen (spec §2.6, build-plan 05-chatbot.md). A plain message
 * list + text input -- the actual intelligence (context assembly, rate
 * limiting, the Claude call, persistence) all lives server-side in the
 * `chat` Edge Function (src/lib/chat.ts wraps supabase.functions.invoke).
 * This screen never talks to Claude or holds an API key.
 */
export default function ChatScreen() {
  const theme = useTheme();
  const { userId } = useProfile();

  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessageRow>>(null);

  const loadHistory = useCallback(async () => {
    if (!userId) {
      setMessages([]);
      setLoadingHistory(false);
      return;
    }
    setLoadingHistory(true);
    const rows = await fetchChatHistory(userId);
    setMessages(rows);
    setLoadingHistory(false);
  }, [userId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || !userId) return;

    setSending(true);
    setBanner(null);

    // Optimistic local echo of the user's own turn -- the server is still
    // the source of truth (it persists the real row). On success we append
    // the reply locally (it's already in the response) rather than
    // refetching all of chat_messages -- a full reload on every send would
    // be an O(history-size) round trip per turn on a high-volume feature;
    // history is only ever refetched from the server on screen mount.
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, user_id: userId, role: 'user', content: text, created_at: new Date().toISOString() },
    ]);
    setDraft('');

    const result = await sendChatMessage(text);
    setSending(false);

    if (result.error) {
      // Drop the optimistic bubble on failure -- nothing was actually
      // persisted server-side (chat Edge Function only inserts on
      // success), so leaving it would misrepresent what's in chat_messages.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(text);
      setBanner(result.notConfigured ? 'The chatbot isn’t set up yet on this project — try again later.' : result.error);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-${Date.now()}`,
        user_id: userId,
        role: 'assistant',
        content: result.reply ?? '',
        created_at: new Date().toISOString(),
      },
    ]);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  if (!userId) {
    return (
      <ThemedView style={styles.center}>
        <SafeAreaView style={styles.center}>
          <ThemedText type="subtitle">Sign in to chat</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ThemedText type="title" style={styles.pageTitle}>
          Chat
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Ask about your stacked opportunities or get general application advice.
        </ThemedText>

        {loadingHistory ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                No messages yet — ask something like “What’s due soon in my stack?”
              </ThemedText>
            }
            renderItem={({ item }) => (
              <View style={[styles.bubbleRow, item.role === 'user' ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
                <ThemedView
                  type={item.role === 'user' ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.bubble}>
                  <ThemedText type="small">{item.content}</ThemedText>
                </ThemedView>
              </View>
            )}
          />
        )}

        {banner && (
          <ThemedView type="backgroundElement" style={styles.banner}>
            <ThemedText type="small">{banner}</ThemedText>
          </ThemedView>
        )}

        <View style={[styles.inputRow, { paddingBottom: BottomTabInset + Spacing.two, borderColor: theme.backgroundElement }]}>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
            placeholder="Ask stackd. anything…"
            placeholderTextColor={theme.textSecondary}
            value={draft}
            onChangeText={setDraft}
            editable={!sending}
            multiline
            onSubmitEditing={handleSend}
          />
          <Pressable
            disabled={sending || !draft.trim()}
            onPress={handleSend}
            style={[
              styles.sendButton,
              { backgroundColor: theme.backgroundSelected },
              (sending || !draft.trim()) && styles.disabled,
            ]}>
            <ThemedText type="smallBold">{sending ? '…' : 'Send'}</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 32, lineHeight: 38, paddingHorizontal: Spacing.four },
  subtitle: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two },
  listContent: { padding: Spacing.four, gap: Spacing.two, flexGrow: 1 },
  emptyText: { textAlign: 'center', paddingVertical: Spacing.five },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { borderRadius: Spacing.three, padding: Spacing.three, maxWidth: '80%' },
  banner: { marginHorizontal: Spacing.four, padding: Spacing.two, borderRadius: Spacing.two },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    maxHeight: 120,
  },
  sendButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
});
