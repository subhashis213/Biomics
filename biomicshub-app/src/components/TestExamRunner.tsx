import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ExamQuestion } from '@/src/api/testSeries';
import { resolveApiAssetUrl } from '@/src/api/client';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { ErrorBanner, PrimaryButton } from './ui';

const REVIEW_COLOR = '#8b5cf6';
const REVIEW_SOFT = 'rgba(139, 92, 246, 0.14)';

type Result = {
  score: number;
  total: number;
  percentage: number;
  review?: Array<{ question: string; isCorrect: boolean; explanation?: string }>;
  note?: string;
};

type Props = {
  title: string;
  questions: ExamQuestion[];
  durationMinutes?: number;
  proctored?: boolean;
  mode?: string;
  onSubmit: (answers: number[], durationSeconds: number, autoSubmitted?: boolean) => Promise<Result>;
};

function gradeFor(p: number, c: ThemeColors) {
  if (p >= 80) return { label: 'Excellent', color: c.success };
  if (p >= 60) return { label: 'Good', color: c.accent };
  if (p >= 40) return { label: 'Average', color: c.warn };
  return { label: 'Needs work', color: c.danger };
}

function fmtClock(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function optionLabel(index: number) {
  return String.fromCharCode(65 + index);
}

export default function TestExamRunner({
  title,
  questions,
  durationMinutes,
  proctored = false,
  mode = 'Test',
  onSubmit
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const safeQuestions = useMemo(() => (Array.isArray(questions) ? questions : []), [questions]);
  const total = safeQuestions.length;

  const [phase, setPhase] = useState<'instructions' | 'running' | 'result'>(proctored ? 'instructions' : 'running');
  const [acknowledged, setAcknowledged] = useState(false);
  const [answers, setAnswers] = useState<number[]>(() => safeQuestions.map(() => -1));
  const [markedForReview, setMarkedForReview] = useState<boolean[]>(() => safeQuestions.map(() => false));
  const [currentQ, setCurrentQ] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes ? durationMinutes * 60 : 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const submittedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const answeredCount = answers.filter((a) => a >= 0).length;
  const markedCount = markedForReview.filter(Boolean).length;
  const skippedCount = total - answeredCount;
  const urgent = durationMinutes ? secondsLeft <= 120 : false;

  const doSubmit = useCallback(async (autoSubmitted: boolean) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setShowSubmitConfirm(false);
    setShowGrid(false);
    setError('');
    try {
      const durationSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
      const res = await onSubmit(answersRef.current, durationSeconds, autoSubmitted);
      if (autoSubmitted && !res.note) res.note = 'Auto-submitted because you left the test.';
      setResult(res);
      setPhase('result');
    } catch (err) {
      submittedRef.current = false;
      setError(err instanceof Error ? err.message : 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit, startedAt]);

  useEffect(() => {
    if (phase !== 'running' || !proctored) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && !submittedRef.current) doSubmit(true);
    });
    return () => sub.remove();
  }, [phase, proctored, doSubmit]);

  useEffect(() => {
    if (phase !== 'running' || !durationMinutes) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (!submittedRef.current) doSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, durationMinutes, doSubmit]);

  function startTest() {
    setStartedAt(Date.now());
    setSecondsLeft(durationMinutes ? durationMinutes * 60 : 0);
    setCurrentQ(0);
    setPhase('running');
  }

  function pickOption(optionIndex: number) {
    setAnswers((prev) => {
      const next = [...prev];
      next[currentQ] = next[currentQ] === optionIndex ? -1 : optionIndex;
      return next;
    });
  }

  function toggleReview() {
    setMarkedForReview((prev) => {
      const next = [...prev];
      next[currentQ] = !next[currentQ];
      return next;
    });
  }

  function jumpToQuestion(index: number) {
    setCurrentQ(index);
    setShowGrid(false);
  }

  function gridStatus(index: number): 'answered' | 'marked' | 'blank' {
    if (markedForReview[index]) return 'marked';
    if (answers[index] >= 0) return 'answered';
    return 'blank';
  }

  if (phase === 'instructions') {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.instrHero}>
          <Text style={styles.instrEyebrow}>Exam instructions</Text>
          <Text style={styles.instrTitle}>{title}</Text>
        </View>
        <View style={styles.statGrid}>
          <Stat icon="help-circle-outline" value={String(total)} label="Questions" colors={colors} />
          <Stat icon="time-outline" value={durationMinutes ? `${durationMinutes}m` : '—'} label="Time" colors={colors} />
          <Stat icon="ribbon-outline" value={mode} label="Mode" colors={colors} />
        </View>
        <View style={styles.rules}>
          <Rule text="Use the question grid to jump to any question anytime." colors={colors} />
          <Rule text="Mark questions for review and submit when ready — unanswered questions are allowed." colors={colors} />
          {durationMinutes ? <Rule text={`Timer auto-submits when ${durationMinutes} minutes elapse.`} colors={colors} /> : null}
          {proctored ? <Rule text="Do not switch apps — the test will auto-submit." colors={colors} warn /> : null}
        </View>
        <Pressable onPress={() => setAcknowledged((v) => !v)} style={styles.ack}>
          <Ionicons name={acknowledged ? 'checkbox' : 'square-outline'} size={22} color={acknowledged ? colors.accent : colors.muted} />
          <Text style={styles.ackText}>I have read and understood the instructions.</Text>
        </Pressable>
        <PrimaryButton label={`Start ${mode}`} onPress={startTest} disabled={!acknowledged} />
        <View style={{ height: 16 }} />
      </ScrollView>
    );
  }

  if (phase === 'result' && result) {
    const g = gradeFor(result.percentage, colors);
    const wrong = result.review ? result.review.filter((r) => !r.isCorrect).length : Math.max(0, result.total - result.score);
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.resultHero, { borderColor: g.color }]}>
          <Ionicons name={result.percentage >= 50 ? 'trophy' : 'analytics-outline'} size={40} color={g.color} />
          <Text style={styles.score}>{result.score}/{result.total}</Text>
          <Text style={[styles.pct, { color: g.color }]}>{result.percentage}% · {g.label}</Text>
        </View>
        <View style={styles.resultStats}>
          <Mini label="Correct" value={String(result.score)} color={colors.success} colors={colors} />
          <Mini label="Wrong" value={String(wrong)} color={colors.danger} colors={colors} />
          <Mini label="Total" value={String(result.total)} color={colors.text} colors={colors} />
        </View>
        {result.note ? (
          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warn} />
            <Text style={styles.noteText}>{result.note}</Text>
          </View>
        ) : null}
        {(result.review || []).map((row, i) => (
          <View key={`rev-${i}`} style={[styles.card, { borderColor: row.isCorrect ? colors.success : colors.danger }]}>
            <View style={styles.reviewHead}>
              <Ionicons name={row.isCorrect ? 'checkmark-circle' : 'close-circle'} size={18} color={row.isCorrect ? colors.success : colors.danger} />
              <Text style={styles.q}>{i + 1}. {row.question}</Text>
            </View>
            {!row.isCorrect && row.explanation ? <Text style={styles.exp}>{row.explanation}</Text> : null}
          </View>
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>
    );
  }

  const q = safeQuestions[currentQ];
  const isMarked = markedForReview[currentQ];
  const selected = answers[currentQ];

  return (
    <View style={styles.runner}>
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <Text style={styles.runTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.countRow}>
            <Text style={[styles.countChip, styles.chipAnswered]}>{answeredCount} answered</Text>
            <Text style={styles.countSep}>·</Text>
            <Text style={styles.countChip}>{skippedCount} skipped</Text>
            {markedCount > 0 ? (
              <>
                <Text style={styles.countSep}>·</Text>
                <Text style={[styles.countChip, styles.chipMarked]}>{markedCount} review</Text>
              </>
            ) : null}
          </View>
        </View>
        {durationMinutes ? (
          <View style={[styles.timer, urgent && styles.timerUrgent]}>
            <Ionicons name="time-outline" size={14} color={urgent ? colors.danger : colors.accent} />
            <Text style={[styles.timerText, urgent && { color: colors.danger }]}>{fmtClock(secondsLeft)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.progressWrap}>
        <View style={[styles.progressBar, { width: `${total ? (answeredCount / total) * 100 : 0}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.questionScroll} showsVerticalScrollIndicator={false}>
        <ErrorBanner message={error} />

        <View style={styles.qHead}>
          <View style={styles.qCounterWrap}>
            <Text style={styles.qCounterLabel}>Question</Text>
            <Text style={styles.qCounter}>
              <Text style={styles.qCounterStrong}>{currentQ + 1}</Text>
              <Text style={styles.qCounterTotal}> / {total}</Text>
            </Text>
          </View>
          {isMarked ? (
            <View style={styles.reviewPill}>
              <Ionicons name="bookmark" size={12} color={REVIEW_COLOR} />
              <Text style={styles.reviewPillText}>Marked for review</Text>
            </View>
          ) : null}
        </View>

        {q ? (
          <>
            <View style={styles.questionCard}>
              <Text style={styles.questionText}>{q.question}</Text>
              {q.imageUrl ? (
                <Image
                  source={{ uri: resolveApiAssetUrl(q.imageUrl) }}
                  style={styles.questionImage}
                  resizeMode="contain"
                />
              ) : null}
            </View>

            <View style={styles.optionsList}>
              {(q.options || []).map((opt, oi) => {
                const isSelected = selected === oi;
                return (
                  <Pressable
                    key={`${currentQ}-${oi}`}
                    onPress={() => pickOption(oi)}
                    style={[styles.optionBtn, isSelected && styles.optionBtnOn]}
                  >
                    <View style={[styles.optionLabel, isSelected && styles.optionLabelOn]}>
                      <Text style={[styles.optionLabelText, isSelected && styles.optionLabelTextOn]}>{optionLabel(oi)}</Text>
                    </View>
                    <Text style={[styles.optionText, isSelected && styles.optionTextOn]}>{opt}</Text>
                    {isSelected ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={toggleReview} style={[styles.reviewBtn, isMarked && styles.reviewBtnOn]}>
              <Ionicons name={isMarked ? 'bookmark' : 'bookmark-outline'} size={18} color={isMarked ? REVIEW_COLOR : colors.muted} />
              <Text style={[styles.reviewBtnText, isMarked && styles.reviewBtnTextOn]}>
                {isMarked ? 'Unmark review' : 'Mark for review'}
              </Text>
            </Pressable>

            <View style={styles.navRow}>
              <Pressable
                onPress={() => setCurrentQ((v) => Math.max(0, v - 1))}
                disabled={currentQ === 0}
                style={[styles.navBtn, currentQ === 0 && styles.navBtnDisabled]}
              >
                <Ionicons name="chevron-back" size={18} color={currentQ === 0 ? colors.muted : colors.text} />
                <Text style={[styles.navBtnText, currentQ === 0 && styles.navBtnTextDisabled]}>Previous</Text>
              </Pressable>
              {currentQ < total - 1 ? (
                <Pressable onPress={() => setCurrentQ((v) => v + 1)} style={[styles.navBtn, styles.navBtnPrimary]}>
                  <Text style={styles.navBtnPrimaryText}>Next</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.accentText} />
                </Pressable>
              ) : (
                <Pressable onPress={() => setShowSubmitConfirm(true)} style={[styles.navBtn, styles.navBtnPrimary]}>
                  <Text style={styles.navBtnPrimaryText}>Submit</Text>
                  <Ionicons name="checkmark-done" size={18} color={colors.accentText} />
                </Pressable>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={() => setShowGrid(true)} style={styles.gridFab}>
          <Ionicons name="grid-outline" size={18} color={colors.accent} />
          <Text style={styles.gridFabText}>Question grid</Text>
        </Pressable>
        <Pressable onPress={() => setShowSubmitConfirm(true)} style={styles.submitFab} disabled={submitting}>
          <Ionicons name="paper-plane" size={16} color={colors.accentText} />
          <Text style={styles.submitFabText}>{submitting ? 'Submitting…' : `Submit (${answeredCount}/${total})`}</Text>
        </Pressable>
      </View>

      <Modal visible={showGrid} animationType="slide" transparent onRequestClose={() => setShowGrid(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowGrid(false)}>
          <Pressable style={styles.gridSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Question navigator</Text>
            <View style={styles.legendRow}>
              <LegendDot color={colors.accent} label="Answered" />
              <LegendDot color={REVIEW_COLOR} label="Review" />
              <LegendDot color={colors.border} label="Skipped" />
            </View>
            <ScrollView contentContainerStyle={styles.gridWrap}>
              {safeQuestions.map((_, qi) => {
                const status = gridStatus(qi);
                const isCurrent = qi === currentQ;
                return (
                  <Pressable
                    key={`nav-${qi}`}
                    onPress={() => jumpToQuestion(qi)}
                    style={[
                      styles.gridDot,
                      status === 'answered' && styles.gridDotAnswered,
                      status === 'marked' && styles.gridDotMarked,
                      status === 'blank' && styles.gridDotBlank,
                      isCurrent && styles.gridDotCurrent
                    ]}
                  >
                    <Text
                      style={[
                        styles.gridDotText,
                        (status === 'answered' || status === 'marked') && styles.gridDotTextOn,
                        isCurrent && styles.gridDotTextCurrent
                      ]}
                    >
                      {qi + 1}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.gridSummary}>
              <SummaryPill label="Answered" value={answeredCount} color={colors.accent} />
              <SummaryPill label="Review" value={markedCount} color={REVIEW_COLOR} />
              <SummaryPill label="Skipped" value={skippedCount} color={colors.muted} />
            </View>
            <PrimaryButton label="Close navigator" variant="outline" onPress={() => setShowGrid(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showSubmitConfirm} animationType="fade" transparent onRequestClose={() => setShowSubmitConfirm(false)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="document-text-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.confirmTitle}>Ready to submit?</Text>
            <Text style={styles.confirmBody}>
              You have answered {answeredCount} of {total} questions.
              {skippedCount > 0
                ? ` ${skippedCount} question${skippedCount === 1 ? ' is' : 's are'} still skipped.`
                : ' All questions are answered.'}
              {markedCount > 0 ? ` ${markedCount} marked for review.` : ''}
            </Text>
            <View style={styles.confirmStats}>
              <ConfirmStat label="Answered" value={answeredCount} tone="answered" colors={colors} />
              <ConfirmStat label="Skipped" value={skippedCount} tone="skipped" colors={colors} />
              <ConfirmStat label="Review" value={markedCount} tone="review" colors={colors} />
            </View>
            <View style={styles.confirmNote}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.warn} />
              <Text style={styles.confirmNoteText}>Once submitted, this attempt is locked and scored immediately.</Text>
            </View>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setShowSubmitConfirm(false)} style={styles.confirmSecondary} disabled={submitting}>
                <Text style={styles.confirmSecondaryText}>Review again</Text>
              </Pressable>
              <Pressable onPress={() => doSubmit(false)} style={styles.confirmPrimary} disabled={submitting}>
                <Text style={styles.confirmPrimaryText}>{submitting ? 'Submitting…' : 'Yes, submit test'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ icon, value, label, colors }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, alignItems: 'center' }}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 6 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Rule({ text, colors, warn }: { text: string; colors: ThemeColors; warn?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
      <Ionicons name={warn ? 'alert-circle' : 'checkmark-circle'} size={18} color={warn ? colors.warn : colors.success} />
      <Text style={{ color: colors.text, flex: 1, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

function Mini({ label, value, color, colors }: { label: string; value: string; color: string; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color, fontWeight: '900', fontSize: 20 }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.03)' }}>
      <Text style={{ color, fontWeight: '900', fontSize: 18 }}>{value}</Text>
      <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function ConfirmStat({ label, value, tone, colors }: { label: string; value: number; tone: 'answered' | 'skipped' | 'review'; colors: ThemeColors }) {
  const toneColor = tone === 'answered' ? colors.accent : tone === 'review' ? REVIEW_COLOR : colors.muted;
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: toneColor, fontWeight: '900', fontSize: 24 }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    runner: { flex: 1 },
    instrHero: { marginBottom: 16 },
    instrEyebrow: { color: c.accent, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', fontSize: 12, marginBottom: 6 },
    instrTitle: { color: c.text, fontSize: 22, fontWeight: '800' },
    statGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    rules: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14, marginBottom: 16 },
    ack: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: c.accent, backgroundColor: c.accentSoft, borderRadius: 12, marginBottom: 16 },
    ackText: { color: c.text, flex: 1, fontWeight: '600' },
    topBar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: c.bg },
    topLeft: { flex: 1 },
    runTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    countRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4, gap: 2 },
    countChip: { color: c.muted, fontSize: 11, fontWeight: '700' },
    chipAnswered: { color: c.accent },
    chipMarked: { color: REVIEW_COLOR },
    countSep: { color: c.muted, fontSize: 11, marginHorizontal: 2 },
    timer: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: c.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.accentSoft },
    timerUrgent: { borderColor: c.danger, backgroundColor: c.errorBg },
    timerText: { color: c.accent, fontWeight: '800', fontSize: 13 },
    progressWrap: { height: 4, backgroundColor: c.cardAlt, marginHorizontal: 16 },
    progressBar: { height: 4, backgroundColor: c.accent },
    questionScroll: { padding: 16, paddingBottom: 24 },
    qHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 },
    qCounterWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    qCounterLabel: { color: c.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    qCounter: { color: c.text },
    qCounterStrong: { fontSize: 22, fontWeight: '900', color: c.text },
    qCounterTotal: { fontSize: 14, fontWeight: '600', color: c.muted },
    reviewPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: REVIEW_SOFT, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    reviewPillText: { color: REVIEW_COLOR, fontSize: 11, fontWeight: '800' },
    questionCard: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16, marginBottom: 14 },
    questionText: { color: c.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
    questionImage: { width: '100%', height: 180, marginTop: 12, borderRadius: 12, backgroundColor: c.cardAlt },
    optionsList: { gap: 10, marginBottom: 14 },
    optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: c.border, borderRadius: 14, padding: 14, backgroundColor: c.card },
    optionBtnOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    optionLabel: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    optionLabelOn: { backgroundColor: c.accent, borderColor: c.accent },
    optionLabelText: { color: c.muted, fontWeight: '800', fontSize: 13 },
    optionLabelTextOn: { color: c.accentText },
    optionText: { color: c.text, flex: 1, fontSize: 15, lineHeight: 21 },
    optionTextOn: { fontWeight: '700' },
    reviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 12, marginBottom: 14, backgroundColor: c.card },
    reviewBtnOn: { borderColor: REVIEW_COLOR, backgroundColor: REVIEW_SOFT },
    reviewBtnText: { color: c.muted, fontWeight: '700', fontSize: 14 },
    reviewBtnTextOn: { color: REVIEW_COLOR },
    navRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 12, backgroundColor: c.card },
    navBtnDisabled: { opacity: 0.45 },
    navBtnText: { color: c.text, fontWeight: '700' },
    navBtnTextDisabled: { color: c.muted },
    navBtnPrimary: { backgroundColor: c.accent, borderColor: c.accent },
    navBtnPrimaryText: { color: c.accentText, fontWeight: '800' },
    footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card },
    gridFab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: c.accent, borderRadius: 12, paddingVertical: 12, backgroundColor: c.accentSoft },
    gridFabText: { color: c.accent, fontWeight: '800', fontSize: 13 },
    submitFab: { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12, backgroundColor: c.accent },
    submitFabText: { color: c.accentText, fontWeight: '800', fontSize: 13 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    confirmBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
    gridSheet: { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 28, maxHeight: '82%' },
    sheetHandle: { width: 42, height: 4, borderRadius: 999, backgroundColor: c.border, alignSelf: 'center', marginBottom: 12 },
    sheetTitle: { color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 10 },
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 14 },
    gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 12 },
    gridDot: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    gridDotAnswered: { backgroundColor: c.accentSoft, borderColor: c.accent },
    gridDotMarked: { backgroundColor: REVIEW_SOFT, borderColor: REVIEW_COLOR },
    gridDotBlank: { backgroundColor: c.cardAlt, borderColor: c.border },
    gridDotCurrent: { transform: [{ scale: 1.06 }], shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
    gridDotText: { color: c.muted, fontWeight: '800', fontSize: 14 },
    gridDotTextOn: { color: c.text },
    gridDotTextCurrent: { color: c.accent },
    gridSummary: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    confirmCard: { backgroundColor: c.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: c.border },
    confirmIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
    confirmTitle: { color: c.text, fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
    confirmBody: { color: c.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 16 },
    confirmStats: { flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 14, paddingVertical: 14, marginBottom: 14 },
    confirmNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: c.badgeWarnBg, borderRadius: 12, padding: 12, marginBottom: 16 },
    confirmNoteText: { color: c.text, flex: 1, fontSize: 12, lineHeight: 18 },
    confirmActions: { flexDirection: 'row', gap: 10 },
    confirmSecondary: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 13 },
    confirmSecondaryText: { color: c.text, fontWeight: '800' },
    confirmPrimary: { flex: 1.2, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 13, backgroundColor: c.accent },
    confirmPrimaryText: { color: c.accentText, fontWeight: '800' },
    resultHero: { alignItems: 'center', borderWidth: 2, borderRadius: 16, padding: 20, marginBottom: 14, backgroundColor: c.card },
    score: { color: c.text, fontSize: 30, fontWeight: '900', marginTop: 8 },
    pct: { fontSize: 16, fontWeight: '800', marginTop: 2 },
    resultStats: { flexDirection: 'row', backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 16, marginBottom: 14 },
    noteBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.badgeWarnBg, borderRadius: 12, padding: 12, marginBottom: 14 },
    noteText: { color: c.text, flex: 1, fontSize: 13 },
    card: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, marginBottom: 12 },
    reviewHead: { flexDirection: 'row', gap: 8 },
    q: { color: c.text, fontWeight: '600', marginBottom: 8, flex: 1 },
    exp: { color: c.muted, fontSize: 13, marginTop: 6 }
  });
}
