import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithPassword, signUpWithPassword } from '@/lib/auth';

/**
 * Real sign-up / sign-in screen (replaces the /supabase-test dev-only flow
 * as the entry point into the app now that Section 3 exists).
 *
 * Password minimum is 10 characters (raised from Supabase's default 6 given
 * the user base includes 14-year-olds — see Section 2 handoff notes).
 */
const MIN_PASSWORD_LENGTH = 10;

export function AuthScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSubmit() {
    setError('');
    setNotice('');

    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }
    if (mode === 'sign_up' && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (mode === 'sign_up' && password !== confirmPassword) {
      setError('Passwords don’t match.');
      return;
    }

    setSubmitting(true);
    if (mode === 'sign_up') {
      const { error, needsEmailConfirmation } = await signUpWithPassword(email, password);
      setSubmitting(false);
      if (error) {
        setError(error);
        return;
      }
      if (needsEmailConfirmation) {
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('sign_in');
      }
    } else {
      const { error } = await signInWithPassword(email, password);
      setSubmitting(false);
      if (error) setError(error);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <ThemedView style={styles.container}>
          <ThemedText type="title" style={styles.title}>
            stackd.
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
            {mode === 'sign_up' ? 'Create an account to get started.' : 'Welcome back.'}
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <TextInput
              placeholder="Email"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
            />
            {mode === 'sign_up' && (
              <TextInput
                placeholder="Confirm password"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={[styles.input, { color: theme.text, borderColor: theme.textSecondary }]}
              />
            )}
            {mode === 'sign_up' && (
              <ThemedText type="small" themeColor="textSecondary">
                Password must be at least {MIN_PASSWORD_LENGTH} characters.
              </ThemedText>
            )}

            {!!error && (
              <ThemedText type="small" style={styles.errorText}>
                {error}
              </ThemedText>
            )}
            {!!notice && (
              <ThemedText type="small" themeColor="textSecondary">
                {notice}
              </ThemedText>
            )}

            <Pressable
              style={[styles.button, { backgroundColor: theme.accent }]}
              disabled={submitting}
              onPress={handleSubmit}>
              <ThemedText type="smallBold" style={styles.buttonText}>
                {submitting ? 'Please wait…' : mode === 'sign_up' ? 'Sign Up' : 'Sign In'}
              </ThemedText>
            </Pressable>
          </ThemedView>

          <Pressable
            onPress={() => {
              setError('');
              setNotice('');
              setConfirmPassword('');
              setMode(mode === 'sign_up' ? 'sign_in' : 'sign_up');
            }}>
            <ThemedText type="linkPrimary" style={styles.switchLink}>
              {mode === 'sign_up' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </ThemedText>
          </Pressable>
        </ThemedView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: Spacing.three,
    fontSize: 16,
  },
  button: {
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  buttonText: {
    color: '#ffffff',
  },
  errorText: {
    color: '#d92d20',
  },
  switchLink: {
    textAlign: 'center',
  },
});
