import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * Renders an opportunity's logo/image, or — per spec §2.2 and build-plan's
 * explicit instruction — a NEUTRAL PLACEHOLDER graphic when logo_url is
 * null. Deliberately not a generic-initials avatar: this renders a plain
 * abstract "document" glyph on a neutral grey field, carrying no per-item
 * identity, so nobody mistakes it for real branding.
 */
export function OpportunityLogo({ uri, size = 64 }: { uri: string | null; size?: number }) {
  const theme = useTheme();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.image,
          { width: size, height: size, borderRadius: size * 0.22, backgroundColor: theme.backgroundElement },
        ]}
        contentFit="cover"
        transition={150}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: theme.backgroundElement,
        },
      ]}>
      <View
        style={{
          width: size * 0.46,
          height: size * 0.34,
          borderRadius: size * 0.05,
          borderWidth: 2,
          borderColor: theme.textSecondary,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {},
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
