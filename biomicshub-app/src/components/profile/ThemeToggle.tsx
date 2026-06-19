import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APP_ICONS } from '@/src/constants/appIcons';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';

export default function ThemeToggle() {
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const light = APP_ICONS.themeLight;
  const dark = APP_ICONS.themeDark;
  const isDark = mode === 'dark';

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.sparkle}>✨</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Appearance</Text>
          <Text style={styles.sub}>Pick a vibe — light & bright or calm dark mode</Text>
        </View>
        <Text style={styles.modeBadge}>{mode === 'light' ? '☀️ Light' : '🌙 Dark'}</Text>
      </View>

      <View style={styles.selector}>
        <ModeCard
          active={mode === 'light'}
          emoji={light.emoji}
          tint={isDark ? light.darkBg : light.lightBg}
          label="Light"
          hint="Day mode"
          onPress={() => setMode('light')}
          styles={styles}
          colors={colors}
        />
        <ModeCard
          active={mode === 'dark'}
          emoji={dark.emoji}
          tint={isDark ? dark.darkBg : dark.lightBg}
          label="Dark"
          hint="Night mode"
          onPress={() => setMode('dark')}
          styles={styles}
          colors={colors}
        />
      </View>
    </View>
  );
}

function ModeCard({
  active,
  emoji,
  tint,
  label,
  hint,
  onPress,
  styles,
  colors
}: {
  active: boolean;
  emoji: string;
  tint: string;
  label: string;
  hint: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, active && styles.cardActive, { backgroundColor: active ? tint : colors.cardAlt }]}
    >
      {active ? <View style={[styles.glow, { backgroundColor: tint }]} /> : null}
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <Text style={[styles.cardLabel, active && styles.cardLabelActive]}>{label}</Text>
      <Text style={styles.cardHint}>{hint}</Text>
      {active ? <View style={styles.check}><Text style={styles.checkText}>✓</Text></View> : null}
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 14,
      overflow: 'hidden'
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    sparkle: { fontSize: 22, marginTop: 2 },
    title: { color: c.text, fontSize: 16, fontWeight: '800' },
    sub: { color: c.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
    modeBadge: {
      color: c.accent,
      fontWeight: '800',
      fontSize: 11,
      backgroundColor: c.accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      overflow: 'hidden'
    },
    selector: { flexDirection: 'row', gap: 10 },
    card: {
      flex: 1,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: c.border,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: 'center',
      overflow: 'hidden',
      position: 'relative'
    },
    cardActive: {
      borderColor: c.accent,
      transform: [{ scale: 1.02 }]
    },
    glow: {
      position: 'absolute',
      top: -30,
      right: -30,
      width: 80,
      height: 80,
      borderRadius: 40,
      opacity: 0.55
    },
    cardEmoji: { fontSize: 36, lineHeight: 42, marginBottom: 8 },
    cardLabel: { color: c.muted, fontWeight: '800', fontSize: 15 },
    cardLabelActive: { color: c.text },
    cardHint: { color: c.muted, fontSize: 11, marginTop: 2, fontWeight: '600' },
    check: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    checkText: { color: c.accentText, fontWeight: '900', fontSize: 12 }
  });
}
