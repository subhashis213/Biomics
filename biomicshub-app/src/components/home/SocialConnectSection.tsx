import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SOCIAL_LINKS } from '@/src/constants/socialLinks';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { openSocialLink } from '@/src/utils/openSocialLink';

export default function SocialConnectSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Connect With Us</Text>
      <View style={styles.row}>
        {SOCIAL_LINKS.map((item) => (
          <Pressable
            key={item.key}
            style={styles.item}
            onPress={() => openSocialLink(item.url, 'telegramInvite' in item ? item.telegramInvite : undefined)}
          >
            <View style={[styles.iconWrap, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon} size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.label}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    section: { marginBottom: 24 },
    heading: { color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    item: { flex: 1, alignItems: 'center', gap: 8 },
    iconWrap: {
      width: 68,
      height: 68,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center'
    },
    label: { color: c.text, fontSize: 13, fontWeight: '700', textAlign: 'center' }
  });
}
