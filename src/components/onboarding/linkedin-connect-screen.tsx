import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { TagSelector } from '@/components/onboarding/tag-selector';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LockedInterestTag } from '@/lib/onboarding/career-exam';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * LinkedIn Connect (spec §2.1, build-plan §3 item 4 -- built after the
 * career exam flow, per explicit spec sequencing).
 *
 * IMPORTANT / KNOWN LIMITATION (documented rather than papered over):
 * Supabase's LinkedIn provider is `linkedin_oidc` ("Sign In with LinkedIn
 * using OpenID Connect"). That product only ever returns standard OIDC
 * claims -- name, email, profile picture. It does NOT expose work history,
 * skills, headline, or resume content; that data requires LinkedIn's
 * restricted Marketing/Talent partner APIs, which need a separate LinkedIn
 * partnership approval far beyond a standard OAuth app. So this flow cannot
 * literally "auto-populate interest_tags from LinkedIn profile data" the way
 * the spec's ideal description implies -- no vendor exposes that without
 * special partner access. What it *can* honestly do: authenticate the user
 * via LinkedIn (proving the connection happened, satisfying
 * `linkedin_imported = true`), then hand them a fast tag-confirmation step
 * (not the multi-question career exam) so onboarding still "skips the
 * manual quiz" as required.
 *
 * This flow is wired end-to-end in code but requires environment config
 * this sandbox doesn't have:
 *   1. A LinkedIn Developer app with "Sign In with LinkedIn using OpenID
 *      Connect" product enabled (Client ID + Client Secret).
 *   2. Supabase Dashboard -> Authentication -> Providers -> LinkedIn (OIDC)
 *      configured with that Client ID/Secret and the callback URL Supabase
 *      shows there.
 *   3. This app's redirect URI (Linking.createURL('auth-callback'), which
 *      resolves to the `stackdapp://` scheme already set in app.json)
 *      allow-listed in both the LinkedIn app's redirect URLs and Supabase
 *      Auth's "Redirect URLs" allow list.
 * Without those three, `linkIdentity` below will return an error from
 * Supabase (provider not enabled) -- that is the expected, reported blocker,
 * not a bug in this code.
 */
export function LinkedInConnectScreen({
  onComplete,
}: {
  onComplete: (tags: LockedInterestTag[]) => void;
}) {
  const theme = useTheme();
  const [phase, setPhase] = useState<'connect' | 'confirm_tags'>('connect');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  async function handleConnect() {
    setError('');
    setConnecting(true);
    try {
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error: linkError } = await supabase.auth.linkIdentity({
        provider: 'linkedin_oidc',
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (linkError || !data?.url) {
        setError(
          linkError?.message ??
            'LinkedIn sign-in is not configured yet in this environment (missing provider setup).'
        );
        setConnecting(false);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        setConnecting(false);
        return; // user cancelled -- not an error
      }

      // exchangeCodeForSession takes the PKCE `code` value itself, not the
      // full callback URL -- passing the whole URL always fails the
      // exchange regardless of provider config (found during Section 3
      // security review). Supabase's own auth-helpers extract it the same
      // way: parse the callback URL and pull the `code` query param.
      const code = new URL(result.url).searchParams.get('code');
      if (!code) {
        setError('LinkedIn did not return an authorization code.');
        setConnecting(false);
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setError(exchangeError.message);
        setConnecting(false);
        return;
      }

      setConnecting(false);
      setPhase('confirm_tags');
    } catch (e) {
      setConnecting(false);
      setError(e instanceof Error ? e.message : 'LinkedIn connect failed.');
    }
  }

  if (phase === 'confirm_tags') {
    return (
      <TagSelector
        title="Connected! Confirm your interests"
        subtitle="LinkedIn doesn't share detailed work history through standard sign-in, so pick a few areas that match your interests -- this powers your match score."
        onComplete={onComplete}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">Connect LinkedIn</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          We&rsquo;ll use your LinkedIn account to skip the manual career exam.
        </ThemedText>

        {!!error && (
          <ThemedText type="small" style={styles.errorText}>
            {error}
          </ThemedText>
        )}

        <Pressable
          disabled={connecting}
          style={[styles.button, { backgroundColor: theme.accent, opacity: connecting ? 0.6 : 1 }]}
          onPress={handleConnect}>
          <ThemedText type="smallBold" style={styles.buttonText}>
            {connecting ? 'Connecting…' : 'Connect with LinkedIn'}
          </ThemedText>
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  button: {
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonText: {
    color: '#ffffff',
  },
  errorText: {
    color: '#d92d20',
  },
});
