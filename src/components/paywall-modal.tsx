import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FREE_TIER_STACK_CAP } from '@/lib/stack-actions';
import { presentPaywall } from '@/lib/subscription';

/**
 * spec §3.1: tapping "Stack It" on an 11th opportunity shows this upsell
 * instead of saving it. Triggered by stackOpportunity()'s `paywalled: true`
 * result (see src/lib/stack-actions.ts) — the server-side RPC is the real
 * gate, this modal is purely the upsell UI on top of that rejection.
 */
export function PaywallModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const [processing, setProcessing] = useState(false);

  async function handleUpgrade() {
    setProcessing(true);
    const result = await presentPaywall();
    setProcessing(false);
    if (!result.completed) {
      // Graceful payment-failure state (build-plan §7 item 4): a clear
      // user-facing message rather than a hang or a silently-ignored tap.
      Alert.alert(
        'Payments not configured',
        result.reason ?? 'Upgrading is not available in this environment yet.'
      );
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView type="background" style={styles.sheet}>
          <ThemedText type="title" style={styles.title}>
            You’ve stacked {FREE_TIER_STACK_CAP} opportunities
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
            Free accounts can stack up to {FREE_TIER_STACK_CAP} opportunities at a time. Remove one to
            free up a slot, or go premium for unlimited stacking plus:
          </ThemedText>
          <View style={styles.list}>
            <ThemedText type="small">• Unlimited &ldquo;Stack It&rdquo;</ThemedText>
            <ThemedText type="small">• AI application strategy suggestions</ThemedText>
            <ThemedText type="small">• Essay reuse suggestions</ThemedText>
            <ThemedText type="small">• Priority alerts for high-match opportunities</ThemedText>
          </View>
          <Pressable
            disabled={processing}
            style={[styles.upgradeButton, { backgroundColor: theme.accent }, processing && styles.disabled]}
            onPress={handleUpgrade}>
            <ThemedText type="smallBold">{processing ? 'Processing…' : 'Upgrade to Premium — $5.99/mo'}</ThemedText>
          </Pressable>
          <Pressable disabled={processing} style={styles.closeButton} onPress={onClose}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Not now
            </ThemedText>
          </Pressable>
        </ThemedView>
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
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  body: {
    lineHeight: 20,
  },
  list: {
    gap: Spacing.one,
  },
  upgradeButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  closeButton: {
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
});
