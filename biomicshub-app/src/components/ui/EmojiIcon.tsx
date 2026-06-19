import { useMemo } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { APP_ICONS, AppIconKey } from '@/src/constants/appIcons';
import { useTheme } from '@/src/theme/ThemeContext';

type Props = {
  name: AppIconKey;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'tab';
  style?: ViewStyle;
  showBubble?: boolean;
};

const SIZE_MAP = {
  sm: { box: 36, emoji: 18, radius: 11 },
  md: { box: 48, emoji: 24, radius: 14 },
  lg: { box: 58, emoji: 30, radius: 18 },
  xl: { box: 72, emoji: 38, radius: 22 },
  tab: { box: 34, emoji: 20, radius: 12 }
};

export default function EmojiIcon({ name, size = 'md', style, showBubble = true }: Props) {
  const { mode } = useTheme();
  const def = APP_ICONS[name];
  const dim = SIZE_MAP[size];
  const styles = useMemo(() => createStyles(dim.box, dim.radius, mode === 'dark' ? def.darkBg : def.lightBg), [dim, def, mode]);

  if (!showBubble) {
    return <Text style={{ fontSize: dim.emoji, lineHeight: dim.emoji + 4 }}>{def.emoji}</Text>;
  }

  return (
    <View style={[styles.bubble, style]}>
      <Text style={styles.emoji}>{def.emoji}</Text>
    </View>
  );
}

function createStyles(box: number, radius: number, bg: string) {
  return StyleSheet.create({
    bubble: {
      width: box,
      height: box,
      borderRadius: radius,
      backgroundColor: bg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.35)'
    },
    emoji: {
      fontSize: Math.round(box * 0.52),
      lineHeight: Math.round(box * 0.58),
      textAlign: 'center'
    }
  });
}
