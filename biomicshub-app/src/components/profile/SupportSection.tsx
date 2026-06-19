import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import EmojiIcon from '@/src/components/ui/EmojiIcon';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';

export const SUPPORT_EMAIL = 'biomicshub@gmail.com';

export default function SupportSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  function openEmail() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('BiomicsHub App Support')}`).catch(() => {});
  }

  return (
    <View style={styles.wrap}>
      <EmojiIcon name="support" size="lg" />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Support</Text>
        <Text style={styles.sub}>Questions, payments, or technical help — we&apos;re here for you.</Text>
        <Pressable onPress={openEmail} style={styles.emailRow}>
          <Text style={styles.mailEmoji}>📧</Text>
          <Text style={styles.email}>{SUPPORT_EMAIL}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      gap: 14,
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      alignItems: 'center'
    },
    title: { color: c.text, fontSize: 16, fontWeight: '800' },
    sub: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 10 },
    emailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    mailEmoji: { fontSize: 16 },
    email: { color: c.accent, fontWeight: '800', fontSize: 14 }
  });
}
