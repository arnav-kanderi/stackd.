import { invokeEdgeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

/**
 * Chatbot (spec §2.6, build-plan 05-chatbot.md). All the real work -- rate
 * limiting, context assembly, the Claude call, and persistence -- happens
 * server-side in the `chat` Edge Function so the API key never ships to the
 * client and the rate limit can't be bypassed by a client that just stops
 * sending old messages. This module only reads history for display and
 * invokes that function per turn.
 */
export interface ChatMessageRow {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface SendChatMessageResult {
  reply: string | null;
  error: string | null;
  /** true when the error is specifically "daily cap hit" (HTTP 429) -- UI shows a distinct message, not a generic error. */
  rateLimited: boolean;
  /** true when the error is specifically "ANTHROPIC_API_KEY missing" (HTTP 501) -- UI shows a distinct message, not a crash. */
  notConfigured: boolean;
}

export async function fetchChatHistory(userId: string, limit = 50): Promise<ChatMessageRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data as ChatMessageRow[];
}

export async function sendChatMessage(message: string): Promise<SendChatMessageResult> {
  const { data, error, status } = await invokeEdgeFunction<{ reply: string }>('chat', { message });

  if (error) {
    return { reply: null, error, rateLimited: status === 429, notConfigured: status === 501 };
  }

  return { reply: data?.reply ?? null, error: null, rateLimited: false, notConfigured: false };
}
