import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors, ThemeMode } from '@/src/theme/theme';

export default function ThemeToggle() {
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        <Text style={styles.title}>Appearance</Text>
        <Text style={styles.sub}>Switch between light and dark mode</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.thumb, mode === 'dark' && styles.thumbDark]} />
        <ModeOption
          mode="light"
          active={mode === 'light'}
          icon="sunny"
          label="Light"
          onPress={() => setMode('light')}
          styles={styles}
          colors={colors}
        />
        <ModeOption
          mode="dark"
          active={mode === 'dark'}
          icon="moon"
          label="Dark"
          onPress={() => setMode('dark')}
          styles={styles}
          colors={colors}
        />
      </View>
    </View>
  );
}

function ModeOption({
  active,
  icon,
  label,
  onPress,
  styles,
  colors
}: {
  mode: ThemeMode;
  active: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.option, active && styles.optionOn]}>
      <Ionicons name={icon} size={16} color={active ? colors.accentText : colors.muted} />
      <Text style={[styles.optionText, active && styles.optionTextOn]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 14
    },
    copy: { gap: 4 },
    title: { color: c.text, fontSize: 16, fontWeight: '800' },
    sub: { color: c.muted, fontSize: 12, lineHeight: 17 },
    track: {
      flexDirection: 'row',
      backgroundColor: c.cardAlt,
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      borderColor: c.border,
      position: 'relative'
    },
    thumb: {
      position: 'absolute',
      top: 4,
      left: 4,
      width: '50%',
      height: '100%',
      borderRadius: 11,
      backgroundColor: c.accent
    },
    thumbDark: { left: '50%' },
    option: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      zIndex: 1
    },
    optionOn: {},
    optionText: { color: c.muted, fontWeight: '700', fontSize: 14 },
    optionTextOn: { color: c.accentText, fontWeight: '800' }
  });
}
