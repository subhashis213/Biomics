import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_ICONS, AppIconKey } from '@/src/constants/appIcons';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';

type Props = {
  label: string;
  icon: AppIconKey;
  onPress: () => void;
};

export default function FeatureTile({ label, icon, onPress }: Props) {
  const { colors, mode } = useTheme();
  const def = APP_ICONS[icon];
  const styles = useMemo(() => createStyles(colors, mode === 'dark' ? def.darkBg : def.lightBg), [colors, def, mode]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.emojiWrap}>
        <Text style={styles.emoji}>{def.emoji}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.shine} />
    </Pressable>
  );
}

function createStyles(c: ThemeColors, tint: string) {
  return StyleSheet.create({
    tile: {
      width: '100%',
      minHeight: 118,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    },
    pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
    emojiWrap: {
      width: 62,
      height: 62,
      borderRadius: 20,
      backgroundColor: tint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)'
    },
    emoji: { fontSize: 32, lineHeight: 36 },
    label: { color: c.text, fontWeight: '800', fontSize: 14, textAlign: 'center' },
    shine: {
      position: 'absolute',
      top: -20,
      right: -20,
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: tint,
      opacity: 0.35
    }
  });
}
