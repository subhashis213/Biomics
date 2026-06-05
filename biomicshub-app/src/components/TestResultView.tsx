import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { resolveApiAssetUrl } from '@/src/api/client';
import { TestReviewItem } from '@/src/api/testSeries';
import { DonutChart } from '@/src/components/Charts';
import { PrimaryButton } from '@/src/components/ui';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';

export type TestResultPayload = {
  score: number;
  total: number;
  percentage: number;
  review?: TestReviewItem[];
  note?: string;
  durationSeconds?: number;
};

type FilterKey = 'all' | 'correct' | 'wrong' | 'skipped';

type Props = {
  title: string;
  mode?: string;
  result: TestResultPayload;
};

function optionLabel(index: number) {
  return index >= 0 ? String.fromCharCode(65 + index) : '—';
}

function gradeFor(p: number, colors: ThemeColors) {
  if (p >= 80) return { label: 'Excellent', color: colors.success, icon: 'trophy' as const };
  if (p >= 60) return { label: 'Good job', color: colors.accent, icon: 'ribbon' as const };
  if (p >= 40) return { label: 'Keep going', color: colors.warn, icon: 'trending-up' as const };
  return { label: 'Needs practice', color: colors.danger, icon: 'fitness' as const };
}

function fmtDuration(secs?: number) {
  if (!secs || secs <= 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function reviewStatus(item: TestReviewItem): 'correct' | 'wrong' | 'skipped' {
  const selected = Number(item.selectedIndex);
  if (!Number.isInteger(selected) || selected < 0) return 'skipped';
  return item.isCorrect ? 'correct' : 'wrong';
}

function selectedText(item: TestReviewItem) {
  const idx = Number(item.selectedIndex);
  if (!Number.isInteger(idx) || idx < 0) return 'Not attempted';
  const opt = item.options?.[idx];
  return opt ? `${optionLabel(idx)}. ${opt}` : optionLabel(idx);
}

function correctText(item: TestReviewItem) {
  if (item.correctAnswer) return item.correctAnswer;
  const idx = Number(item.correctIndex);
  if (Number.isInteger(idx) && idx >= 0 && item.options?.[idx]) {
    return `${optionLabel(idx)}. ${item.options[idx]}`;
  }
  return '—';
}

export default function TestResultView({ title, mode = 'Test', result }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [filter, setFilter] = useState<FilterKey>('all');

  const review = result.review || [];
  const correctCount = review.length
    ? review.filter((row) => reviewStatus(row) === 'correct').length
    : result.score;
  const wrongCount = review.length
    ? review.filter((row) => reviewStatus(row) === 'wrong').length
    : Math.max(0, result.total - result.score);
  const skippedCount = review.length
    ? review.filter((row) => reviewStatus(row) === 'skipped').length
    : 0;

  const grade = gradeFor(result.percentage, colors);
  const filtered = review.filter((row) => {
    const status = reviewStatus(row);
    if (filter === 'all') return true;
    return status === filter;
  });

  const donutSegments = [
    { value: correctCount, color: colors.success, label: 'Correct' },
    { value: wrongCount, color: colors.danger, label: 'Wrong' },
    { value: skippedCount, color: colors.muted, label: 'Skipped' }
  ].filter((seg) => seg.value > 0);

  const filters: { key: FilterKey; label: string; count: number; tone: string }[] = [
    { key: 'all', label: 'All', count: review.length, tone: colors.text },
    { key: 'correct', label: 'Correct', count: correctCount, tone: colors.success },
    { key: 'wrong', label: 'Wrong', count: wrongCount, tone: colors.danger },
    { key: 'skipped', label: 'Skipped', count: skippedCount, tone: colors.muted }
  ];

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={styles.modePill}>
            <Ionicons name="sparkles" size={12} color={colors.accent} />
            <Text style={styles.modePillText}>{mode} complete</Text>
          </View>
          <View style={[styles.gradeBadge, { backgroundColor: `${grade.color}22`, borderColor: grade.color }]}>
            <Ionicons name={grade.icon} size={14} color={grade.color} />
            <Text style={[styles.gradeBadgeText, { color: grade.color }]}>{grade.label}</Text>
          </View>
        </View>

        <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>

        <View style={styles.heroBody}>
          <DonutChart
            segments={donutSegments.length ? donutSegments : [{ value: 1, color: colors.cardAlt, label: 'Empty' }]}
            centerLabel={`${result.percentage}%`}
            centerCaption="Score"
          />
          <View style={styles.heroStats}>
            <HeroStat label="Correct" value={String(correctCount)} color={colors.success} colors={colors} />
            <HeroStat label="Wrong" value={String(wrongCount)} color={colors.danger} colors={colors} />
            <HeroStat label="Skipped" value={String(skippedCount)} color={colors.muted} colors={colors} />
            <View style={styles.scoreBlock}>
              <Text style={styles.scoreFraction}>{result.score}/{result.total}</Text>
              <Text style={styles.scoreHint}>marks obtained</Text>
            </View>
          </View>
        </View>

        <View style={styles.metaRow}>
          <MetaChip icon="time-outline" label={`Time ${fmtDuration(result.durationSeconds)}`} colors={colors} />
          <MetaChip icon="help-circle-outline" label={`${result.total} questions`} colors={colors} />
          <MetaChip icon="analytics-outline" label={`${result.percentage}% accuracy`} colors={colors} />
        </View>
      </View>

      {result.note ? (
        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warn} />
          <Text style={styles.noteText}>{result.note}</Text>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Answer review</Text>
        <Text style={styles.sectionSub}>Tap a filter to focus on specific questions</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {filters.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[styles.filterChip, active && styles.filterChipOn, active && { borderColor: item.tone }]}
            >
              <Text style={[styles.filterChipText, active && { color: item.tone, fontWeight: '800' }]}>
                {item.label} · {item.count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="file-tray-outline" size={28} color={colors.muted} />
          <Text style={styles.emptyText}>No questions in this filter.</Text>
        </View>
      ) : (
        filtered.map((row) => {
          const originalIndex = review.indexOf(row);
          const status = reviewStatus(row);
          const statusColor = status === 'correct' ? colors.success : status === 'wrong' ? colors.danger : colors.muted;
          const statusLabel = status === 'correct' ? 'Correct' : status === 'wrong' ? 'Wrong' : 'Skipped';
          const statusIcon = status === 'correct' ? 'checkmark-circle' : status === 'wrong' ? 'close-circle' : 'remove-circle';

          return (
            <View key={`q-${originalIndex}`} style={[styles.questionCard, { borderColor: `${statusColor}55` }]}>
              <View style={styles.questionTop}>
                <View style={[styles.qBadge, { backgroundColor: `${statusColor}18` }]}>
                  <Text style={[styles.qBadgeText, { color: statusColor }]}>Q{originalIndex + 1}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
                  <Ionicons name={statusIcon} size={14} color={statusColor} />
                  <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>

              <Text style={styles.questionText}>{row.question}</Text>
              {row.imageUrl ? (
                <Image
                  source={{ uri: resolveApiAssetUrl(row.imageUrl) }}
                  style={styles.questionImage}
                  resizeMode="contain"
                />
              ) : null}

              <View style={styles.answerStack}>
                <AnswerRow
                  label="Your answer"
                  value={selectedText(row)}
                  tone={status === 'correct' ? 'success' : status === 'wrong' ? 'danger' : 'muted'}
                  colors={colors}
                />
                {status !== 'correct' ? (
                  <AnswerRow label="Correct answer" value={correctText(row)} tone="success" colors={colors} />
                ) : null}
              </View>

              {row.explanation && status !== 'correct' ? (
                <View style={styles.explanationBox}>
                  <Ionicons name="bulb-outline" size={16} color={colors.accent} />
                  <Text style={styles.explanationText}>{row.explanation}</Text>
                </View>
              ) : null}

              {Array.isArray(row.options) && row.options.length > 0 ? (
                <View style={styles.optionsGrid}>
                  {row.options.map((opt, oi) => {
                    const isSelected = Number(row.selectedIndex) === oi;
                    const isCorrectOpt = Number(row.correctIndex) === oi;
                    const optTone = isCorrectOpt
                      ? colors.success
                      : isSelected
                        ? colors.danger
                        : colors.border;
                    return (
                      <View
                        key={`${originalIndex}-opt-${oi}`}
                        style={[
                          styles.optionChip,
                          (isSelected || isCorrectOpt) && { borderColor: optTone, backgroundColor: `${optTone}12` }
                        ]}
                      >
                        <Text style={[styles.optionChipLabel, { color: optTone }]}>{optionLabel(oi)}</Text>
                        <Text style={styles.optionChipText} numberOfLines={2}>{opt}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      <PrimaryButton label="Back to tests" onPress={() => router.back()} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function HeroStat({ label, value, color, colors }: { label: string; value: string; color: string; colors: ThemeColors }) {
  return (
    <View style={stylesInline.heroStat}>
      <Text style={[stylesInline.heroStatValue, { color }]}>{value}</Text>
      <Text style={[stylesInline.heroStatLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function MetaChip({ icon, label, colors }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; colors: ThemeColors }) {
  return (
    <View style={[stylesInline.metaChip, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      <Ionicons name={icon} size={13} color={colors.accent} />
      <Text style={[stylesInline.metaChipText, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function AnswerRow({
  label,
  value,
  tone,
  colors
}: {
  label: string;
  value: string;
  tone: 'success' | 'danger' | 'muted';
  colors: ThemeColors;
}) {
  const toneColor = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.muted;
  const bg = tone === 'success' ? colors.successBg : tone === 'danger' ? colors.errorBg : colors.cardAlt;
  return (
    <View style={[stylesInline.answerRow, { backgroundColor: bg, borderColor: `${toneColor}44` }]}>
      <Text style={[stylesInline.answerLabel, { color: toneColor }]}>{label}</Text>
      <Text style={[stylesInline.answerValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const stylesInline = StyleSheet.create({
  heroStat: { minWidth: 68 },
  heroStatValue: { fontSize: 22, fontWeight: '900' },
  heroStatLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  metaChipText: { fontSize: 11, fontWeight: '700' },
  answerRow: { borderWidth: 1, borderRadius: 12, padding: 12 },
  answerLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  answerValue: { fontSize: 14, lineHeight: 20, fontWeight: '600' }
});

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    hero: {
      backgroundColor: c.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.border,
      padding: 18,
      marginBottom: 16,
      overflow: 'hidden'
    },
    heroGlow: {
      position: 'absolute',
      top: -40,
      right: -30,
      width: 140,
      height: 140,
      borderRadius: 999,
      backgroundColor: c.accentSoft,
      opacity: 0.85
    },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    modePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999
    },
    modePillText: { color: c.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
    gradeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6
    },
    gradeBadgeText: { fontSize: 11, fontWeight: '800' },
    heroTitle: { color: c.text, fontSize: 20, fontWeight: '900', lineHeight: 26, marginBottom: 14 },
    heroBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    heroStats: { flex: 1, gap: 10 },
    scoreBlock: {
      backgroundColor: c.cardAlt,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border
    },
    scoreFraction: { color: c.text, fontSize: 24, fontWeight: '900' },
    scoreHint: { color: c.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    noteBox: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      backgroundColor: c.badgeWarnBg,
      borderRadius: 14,
      padding: 12,
      marginBottom: 16
    },
    noteText: { color: c.text, flex: 1, fontSize: 13, lineHeight: 18 },
    sectionHead: { marginBottom: 10 },
    sectionTitle: { color: c.text, fontSize: 18, fontWeight: '900' },
    sectionSub: { color: c.muted, fontSize: 12, marginTop: 4 },
    filterRow: { gap: 8, paddingBottom: 14 },
    filterChip: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9
    },
    filterChipOn: { backgroundColor: c.accentSoft },
    filterChipText: { color: c.muted, fontSize: 12, fontWeight: '700' },
    emptyCard: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      padding: 24,
      marginBottom: 16
    },
    emptyText: { color: c.muted, marginTop: 8, fontWeight: '600' },
    questionCard: {
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1.5,
      padding: 14,
      marginBottom: 12
    },
    questionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    qBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    qBadgeText: { fontSize: 12, fontWeight: '900' },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    statusPillText: { fontSize: 11, fontWeight: '800' },
    questionText: { color: c.text, fontSize: 15, lineHeight: 22, fontWeight: '700', marginBottom: 10 },
    questionImage: { width: '100%', height: 160, borderRadius: 12, backgroundColor: c.cardAlt, marginBottom: 10 },
    answerStack: { gap: 8, marginBottom: 10 },
    explanationBox: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      backgroundColor: c.accentSoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10
    },
    explanationText: { color: c.text, flex: 1, fontSize: 13, lineHeight: 19 },
    optionsGrid: { gap: 8 },
    optionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 10,
      backgroundColor: c.cardAlt
    },
    optionChipLabel: { width: 24, fontWeight: '900', fontSize: 13 },
    optionChipText: { flex: 1, color: c.text, fontSize: 13, lineHeight: 18 }
  });
}
