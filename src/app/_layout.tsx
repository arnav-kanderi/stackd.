import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '@/components/auth/auth-screen';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';
import { ThemedView } from '@/components/themed-view';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { isOnboardingComplete } from '@/lib/onboarding/actions';
import { registerForPushNotificationsAsync } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

/**
 * Root gate (Section 3): unauthenticated -> AuthScreen; authenticated but
 * onboarding incomplete (no grade/location/interest_tags yet) ->
 * OnboardingFlow; otherwise -> the real app tabs (Section 2's feed/My Stack).
 *
 * Deliberately component-based rather than expo-router route groups --
 * index.tsx/explore.tsx already exist as the tab screens and don't need to
 * move for this; AppTabs/AuthScreen/OnboardingFlow are just conditionally
 * rendered subtrees of this one layout.
 */
export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading, refresh, userId } = useProfile();

  useEffect(() => {
    if (session?.user.id) {
      registerForPushNotificationsAsync(session.user.id);
    }
  }, [session?.user.id]);

  let content;
  if (sessionLoading || (session && profileLoading)) {
    content = (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  } else if (!session) {
    content = <AuthScreen />;
  } else if (!isOnboardingComplete(profile)) {
    content = <OnboardingFlow userId={userId!} onFinished={refresh} />;
  } else {
    content = <AppTabs />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {content}
    </ThemeProvider>
  );
}
