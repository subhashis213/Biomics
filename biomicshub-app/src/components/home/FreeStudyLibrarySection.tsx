import { useMemo } from 'react';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FreeStudyCourseGroup } from '@/src/api/freeStudyResources';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { Badge, Card, Eyebrow } from '@/src/components/ui';

type Props = {
  courses: FreeStudyCourseGroup[];
  totalCount: number;
};

function typeIcon(type: string): ComponentProps<typeof Ionicons>['name'] {
  if (type === 'book') return 'book-outline';
  if (type === 'job-notes') return 'briefcase-outline';
  return 'document-text-outline';
}

function typeLabel(type: string) {
  if (type === 'book') return 'Book';
  if (type === 'job-notes') return 'Job notes';
  return 'Material';
}

export default function FreeStudyLibrarySection({ courses, totalCount }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!totalCount) return null;

  return (
    <Card style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Free library</Eyebrow>
          <Text style={styles.title}>Books & study materials</Text>
          <Text style={styles.sub}>100% free for all students · course-wise</Text>
        </View>
        <Badge label={`${totalCount} files`} tone="success" />
      </View>

      {courses.slice(0, 3).map((group) => (
        <View key={group.courseName} style={styles.courseBlock}>
          <View style={styles.courseHead}>
            <Ionicons name="school-outline" size={16} color={colors.accent} />
            <Text style={styles.courseName}>{group.courseName}</Text>
            <Text style={styles.courseCount}>{group.totalCount ?? group.items?.length ?? 0}</Text>
          </View>
          {(group.previewItems || group.items || []).slice(0, 2).map((item) => (
            <View key={item._id} style={styles.itemRow}>
              <View style={styles.itemIcon}>
                <Ionicons name={typeIcon(item.resourceType)} size={16} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemMeta}>{typeLabel(item.resourceType)} · Free</Text>
              </View>
            </View>
          ))}
        </View>
      ))}

      <Pressable style={styles.cta} onPress={() => router.push('/study-library')}>
        <Text style={styles.ctaText}>Browse all free materials</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.accentText} />
      </Pressable>
    </Card>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginBottom: 16, padding: 0, overflow: 'hidden' },
    header: { flexDirection: 'row', gap: 10, padding: 14, paddingBottom: 10, alignItems: 'flex-start' },
    title: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
    sub: { color: c.muted, fontSize: 12, marginTop: 4 },
    courseBlock: { borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 14, paddingVertical: 10 },
    courseHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    courseName: { color: c.text, fontWeight: '800', flex: 1, fontSize: 14 },
    courseCount: { color: c.muted, fontWeight: '700', fontSize: 12 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    itemIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center'
    },
    itemTitle: { color: c.text, fontWeight: '700', fontSize: 13 },
    itemMeta: { color: c.muted, fontSize: 11, marginTop: 2 },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.accent,
      paddingVertical: 13
    },
    ctaText: { color: c.accentText, fontWeight: '800', fontSize: 14 }
  });
}
