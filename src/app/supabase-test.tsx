import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithPassword, signUpWithPassword } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * Minimal Supabase auth + connectivity test screen for Section 1.
 * Not part of the tab navigation — reach it at /supabase-test.
 * Full onboarding/auth UI is a later section; this only proves the wiring works.
 *
 * __DEV__-gated (post-review security fix): this is a raw auth-debug screen
 * (sign-up/sign-in/sign-out) in an app that collects minors' data. It's
 * unlinked from tab nav but still reachable via direct deep link in a
 * production build without this guard.
 */
export default function SupabaseTestScreen() {
  const theme = useTheme();

  if (!__DEV__) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <ThemedText type="default">Not available in this build.</ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [opportunities, setOpportunities] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSignUp() {
    setStatus('Signing up...');
    const { error } = await signUpWithPassword(email, password);
    setStatus(error ?? 'Signed up — check email if confirmation is required.');
  }

  async function handleSignIn() {
    setStatus('Signing in...');
    const { error } = await signInWithPassword(email, password);
    setStatus(error ?? 'Signed in.');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setStatus('Signed out.');
  }

  async function handleFetchOpportunities() {
    setStatus('Fetching opportunities...');
    const { data, error } = await supabase
      .from('opportunities')
      .select('id, name, category, deadline, is_active')
      .order('deadline', { ascending: true });
    if (error) {
      setStatus(`Fetch error: ${error.message}`);
      return;
    }
    setOpportunities(data ?? []);
    setStatus(`Fetched ${data?.length ?? 0} opportunities.`);
  }

  async function handleWriteTest() {
    if (!session) {
      Alert.alert('Sign in first');
      return;
    }
    setStatus('Writing test profile row...');
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: session.user.id, grade: '12th', location: 'Test City' });
    setStatus(error ? `Write error: ${error.message}` : 'Wrote profile row for current user.');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title" style={styles.titleSmall}>
          Supabase Test
        </ThemedText>

        <ThemedText type="small">
          Session: {session ? `signed in as ${session.user.email}` : 'signed out'}
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <TextInput
            placeholder="email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={[styles.input, { borderColor: theme.textSecondary }]}
          />
          <TextInput
            placeholder="password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={[styles.input, { borderColor: theme.textSecondary }]}
          />

          <Pressable style={styles.button} onPress={handleSignUp}>
            <ThemedText type="smallBold">Sign Up</ThemedText>
          </Pressable>
          <Pressable style={styles.button} onPress={handleSignIn}>
            <ThemedText type="smallBold">Sign In</ThemedText>
          </Pressable>
          <Pressable style={styles.button} onPress={handleSignOut}>
            <ThemedText type="smallBold">Sign Out</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <Pressable style={styles.button} onPress={handleFetchOpportunities}>
            <ThemedText type="smallBold">Read: fetch opportunities</ThemedText>
          </Pressable>
          <Pressable style={styles.button} onPress={handleWriteTest}>
            <ThemedText type="smallBold">Write: upsert my profile</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedText type="small">{status}</ThemedText>

        {opportunities.map((o) => (
          <ThemedText key={o.id} type="small">
            {o.name} — {o.category} — due {o.deadline} — active: {String(o.is_active)}
          </ThemedText>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  titleSmall: {
    fontSize: 28,
    lineHeight: 34,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: Spacing.two,
  },
  button: {
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
});
