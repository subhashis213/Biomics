import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { APP_ICONS } from '@/src/constants/appIcons';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { resolveApiAssetUrl } from '@/src/api/client';

export type CourseLearningRowProps = {
  title: string;
  subtitle?: string;
  thumbnailUrl?: string;
  /** When true, shows progress bar + completion text (use on batch rows only). */
  showProgress?: boolean;
  progressPercent?: number | null;
  unlocked?: boolean;
  enrolled?: boolean;
  onPress: () => void;
  style?: ViewStyle;
  showDivider?: boolean;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function CourseLearningRow({
  title,
  subtitle,
  thumbnailUrl,
  showProgress = false,
  progressPercent,
  unlocked,
  enrolled,
  onPress,
  style,
  showDivider = true
}: CourseLearningRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const thumb = resolveApiAssetUrl(thumbnailUrl);
  const canLearn = Boolean(unlocked || enrolled);
  const hasProgress = showProgress && typeof progressPercent === 'number';
  const pct = hasProgress ? clampPercent(progressPercent) : 0;
  const completed = hasProgress && pct >= 100;

  let statusLabel = 'View batches';
  let statusAccent = true;
  if (hasProgress) {
    if (completed) {
      statusLabel = 'Completed';
      statusAccent = false;
    } else if (pct > 0) {
      statusLabel = `${pct}% complete`;
      statusAccent = false;
    } else {
      statusLabel = 'Start learning';
      statusAccent = true;
    }
  } else if (canLearn) {
    statusLabel = 'Continue learning';
    statusAccent = true;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, showDivider && styles.rowDivider, pressed && styles.rowPressed, style]}
      accessibilityRole="button"
    >
      <View style={styles.thumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={styles.thumbFallback}>
            <Text style={styles.fallbackEmoji}>{APP_ICONS.books.emoji}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        {hasProgress && !completed ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }]} />
          </View>
        ) : null}

        <Text style={[styles.status, statusAccent ? styles.statusAccent : styles.statusMuted]}>{statusLabel}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      paddingVertical: 16,
      paddingHorizontal: 16,
      backgroundColor: c.card
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border
    },
    rowPressed: {
      backgroundColor: c.cardAlt
    },
    thumbWrap: {
      width: 96,
      height: 96,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: c.cardAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border
    },
    thumb: {
      width: '100%',
      height: '100%'
    },
    thumbFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentSoft
    },
    fallbackEmoji: { fontSize: 32 },
    body: {
      flex: 1,
      minHeight: 96,
      justifyContent: 'center',
      gap: 6
    },
    title: {
      color: c.text,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20
    },
    subtitle: {
      color: c.muted,
      fontSize: 13,
      lineHeight: 18
    },
    progressTrack: {
      height: 3,
      borderRadius: 999,
      backgroundColor: c.cardAlt,
      overflow: 'hidden',
      marginTop: 2
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: c.accent
    },
    status: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2
    },
    statusAccent: {
      color: c.accent,
      fontWeight: '700'
    },
    statusMuted: {
      color: c.muted,
      fontWeight: '500'
    }
  });
}
