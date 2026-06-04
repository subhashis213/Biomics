import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { FreeStudyCourseGroup } from '@/src/api/freeStudyResources';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { Card, Eyebrow } from '@/src/components/ui';

type Props = {
  courses: FreeStudyCourseGroup[];
  totalCount: number;
};

function buildSummary(courses: FreeStudyCourseGroup[], totalCount: number) {
  const courseCount = courses.length;
  if (!courseCount) return `${totalCount} free file${totalCount === 1 ? '' : 's'}`;

  const names = courses.slice(0, 2).map((c) => c.courseName);
  const extra = courseCount > 2 ? ` +${courseCount - 2} more` : '';
  return `${names.join(', ')}${extra} · ${totalCount} file${totalCount === 1 ? '' : 's'}`;
}

export default function FreeStudyLibrarySection({ courses, totalCount }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!totalCount) return null;

  const summary = buildSummary(courses, totalCount);

  return (
    <Pressable
      onPress={() => router.push('/study-library')}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open free study library"
    >
      <Card style={styles.wrap}>
        <View style={styles.iconWrap}>
          <Ionicons name="library-outline" size={22} color={colors.accent} />
        </View>
        <View style={styles.body}>
          <Eyebrow>Free library</Eyebrow>
          <Text style={styles.title}>Books & study materials</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </Card>
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    pressable: { marginBottom: 16 },
    pressed: { opacity: 0.92 },
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderColor: c.accentSoft,
      backgroundColor: c.card
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center'
    },
    body: { flex: 1, minWidth: 0 },
    title: { color: c.text, fontSize: 16, fontWeight: '800' },
    sub: { color: c.muted, fontSize: 12, marginTop: 3, fontWeight: '600' },
    chevronWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.cardAlt,
      alignItems: 'center',
      justifyContent: 'center'
    }
  });
}
