import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/src/context/AuthContext';
import { useCart, makeCartKey } from '@/src/context/CartContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { PlanType } from '@/src/api/payments';
import {
  BatchCatalogItem,
  fetchBatchModules,
  fetchCourseBatches
} from '@/src/api/courses';
import { fetchMyCourseContent, VideoItem } from '@/src/api/learning';
import { resolveApiAssetUrl } from '@/src/api/client';
import CartButton from '@/src/components/CartButton';
import PosterImage from '@/src/components/PosterImage';
import {
  Badge,
  Card,
  ErrorBanner,
  LoadingBlock,
  PrimaryButton,
  Screen
} from '@/src/components/ui';
import { decodeRouteParam, formatInrFromPaise } from '@/src/utils/format';

function normBatch(value: string) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function batchProgressPercent(videos: VideoItem[], completedIds: string[], batchName: string) {
  const batchVideos = videos.filter((v) => normBatch(v.batch || 'General') === normBatch(batchName));
  if (!batchVideos.length) return null;
  const done = new Set(completedIds.map(String));
  const completed = batchVideos.filter((v) => done.has(String(v._id))).length;
  return Math.round((completed / batchVideos.length) * 100);
}

async function enrichBatchModuleCounts(
  token: string,
  courseName: string,
  batches: BatchCatalogItem[]
): Promise<BatchCatalogItem[]> {
  return Promise.all(
    batches.map(async (batch) => {
      if (batch.moduleCount && batch.moduleCount > 0) return batch;
      try {
        const res = await fetchBatchModules(token, courseName, batch.batchName);
        const count = res.modules?.length || 0;
        return count > 0 ? { ...batch, moduleCount: count } : batch;
      } catch {
        return batch;
      }
    })
  );
}

export default function CourseDetailScreen() {
  const { courseName: courseParam } = useLocalSearchParams<{ courseName: string }>();
  const courseName = decodeRouteParam(courseParam);
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [batches, setBatches] = useState<BatchCatalogItem[]>([]);
  const [batchProgress, setBatchProgress] = useState<Record<string, number>>({});
  const [batchPlans, setBatchPlans] = useState<Record<string, PlanType>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addItem, has } = useCart();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token || !courseName) return;
      setLoading(true);
      setError('');
      try {
        const [batchesRes, content] = await Promise.all([
          fetchCourseBatches(token, courseName),
          fetchMyCourseContent(token, courseName).catch(() => ({
            videos: [] as VideoItem[],
            completedVideos: [] as string[]
          }))
        ]);
        const active = (batchesRes.batches || []).filter((b) => b.active !== false);
        const enriched = await enrichBatchModuleCounts(token, courseName, active);
        const progressMap = Object.fromEntries(
          enriched.map((batch) => {
            const pct = batchProgressPercent(
              content.videos || [],
              content.completedVideos || [],
              batch.batchName
            );
            return [batch.batchName, pct ?? 0];
          })
        );
        if (!cancelled) {
          setBatches(enriched);
          setBatchProgress(progressMap);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load course.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token, courseName]);

  const planFor = (batchName: string): PlanType => batchPlans[batchName] || 'pro';

  function batchPrice(batch: BatchCatalogItem) {
    const plan = planFor(batch.batchName);
    return plan === 'elite' ? batch.elitePriceInPaise : batch.proPriceInPaise;
  }

  function addBatchToCart(batch: BatchCatalogItem) {
    const plan = planFor(batch.batchName);
    addItem({
      key: makeCartKey(courseName, batch.batchName, batch.batchName),
      course: courseName,
      courseDisplay: courseName,
      batch: batch.batchName,
      moduleName: batch.batchName,
      label: `${batch.batchName} · Full batch`,
      planType: plan,
      proPriceInPaise: batch.proPriceInPaise,
      elitePriceInPaise: batch.elitePriceInPaise
    });
  }

  function buyBatch(batch: BatchCatalogItem) {
    router.push({
      pathname: '/checkout',
      params: {
        course: courseName,
        batch: batch.batchName,
        moduleName: batch.batchName,
        planType: planFor(batch.batchName),
        title: `${courseName} · ${batch.batchName}`
      }
    });
  }

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: courseName || 'Course', headerRight: () => <CartButton /> }} />
        <LoadingBlock label="Loading batches…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: courseName, headerRight: () => <CartButton /> }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ErrorBanner message={error} />
        <Text style={styles.sectionTitle}>Choose a batch</Text>

        {batches.length === 0 ? (
          <Card>
            <Text style={styles.empty}>No active batches for this course yet.</Text>
          </Card>
        ) : (
          batches.map((batch, index) => {
            const owned = batch.hasProAccess || batch.hasEliteAccess;
            const thumb = resolveApiAssetUrl(batch.thumbnailUrl);
            const modules = batch.moduleCount ?? 0;
            const price = batchPrice(batch);
            const cartKey = makeCartKey(courseName, batch.batchName, batch.batchName);

            return (
              <Animated.View key={batch.batchName} entering={FadeInDown.delay(index * 50)}>
                <Card style={styles.batchCard}>
                  <PosterImage uri={thumb || undefined} rounded="top" fallbackIcon="layers-outline" />

                  <View style={styles.batchBody}>
                    <View style={styles.batchTopRow}>
                      <Text style={styles.batchName}>{batch.batchName}</Text>
                      {owned ? <Badge label="OWNED" tone="success" /> : null}
                    </View>
                    <Text style={styles.batchMeta}>
                      {modules} module{modules === 1 ? '' : 's'}
                      {!owned && price > 0 ? ` · from ${formatInrFromPaise(price)}` : ''}
                    </Text>

                    {owned && typeof batchProgress[batch.batchName] === 'number' ? (
                      <>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.max(batchProgress[batch.batchName], batchProgress[batch.batchName] > 0 ? 4 : 0)}%`
                              }
                            ]}
                          />
                        </View>
                        <Text style={styles.progressLabel}>
                          {batchProgress[batch.batchName] >= 100
                            ? 'Completed'
                            : batchProgress[batch.batchName] > 0
                              ? `${batchProgress[batch.batchName]}% complete`
                              : 'Start learning'}
                        </Text>
                      </>
                    ) : null}

                    {owned ? (
                      <PrimaryButton
                        label="Open lectures"
                        onPress={() => router.push(`/learn/${encodeURIComponent(courseName)}`)}
                      />
                    ) : (
                      <>
                        <View style={styles.planToggle}>
                          {(['pro', 'elite'] as PlanType[]).map((plan) => {
                            const selected = planFor(batch.batchName) === plan;
                            return (
                              <Pressable
                                key={plan}
                                onPress={() => setBatchPlans((prev) => ({ ...prev, [batch.batchName]: plan }))}
                                style={[styles.planBtn, selected && styles.planBtnOn]}
                              >
                                <Text style={[styles.planBtnText, selected && styles.planBtnTextOn]}>
                                  {plan === 'pro' ? 'Pro' : 'Elite'}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <View style={styles.actionRow}>
                          <Pressable
                            style={[styles.secondaryBtn, has(cartKey) && styles.secondaryBtnOn]}
                            onPress={() => addBatchToCart(batch)}
                          >
                            <Ionicons name={has(cartKey) ? 'checkmark' : 'cart-outline'} size={16} color={colors.accent} />
                            <Text style={styles.secondaryBtnText}>{has(cartKey) ? 'In cart' : 'Add to cart'}</Text>
                          </Pressable>
                          <Pressable style={styles.buyBtn} onPress={() => buyBatch(batch)}>
                            <Text style={styles.buyBtnText}>Buy now</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                </Card>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    sectionTitle: { color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
    empty: { color: c.muted, fontSize: 14 },
    batchCard: { overflow: 'hidden', padding: 0, marginBottom: 14 },
    batchBody: { padding: 14, gap: 10 },
    batchTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    batchName: { color: c.text, fontSize: 18, fontWeight: '800', flex: 1 },
    batchMeta: { color: c.muted, fontSize: 14 },
    progressTrack: {
      height: 4,
      borderRadius: 999,
      backgroundColor: c.cardAlt,
      overflow: 'hidden'
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: c.accent
    },
    progressLabel: {
      color: c.muted,
      fontSize: 13,
      fontWeight: '600'
    },
    planToggle: { flexDirection: 'row', gap: 8 },
    planBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg
    },
    planBtnOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    planBtnText: { color: c.muted, fontWeight: '700', fontSize: 13 },
    planBtnTextOn: { color: c.text },
    actionRow: { flexDirection: 'row', gap: 10 },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: 10,
      paddingVertical: 12
    },
    secondaryBtnOn: { backgroundColor: c.accentSoft },
    secondaryBtnText: { color: c.accent, fontWeight: '800', fontSize: 13 },
    buyBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 12
    },
    buyBtnText: { color: c.accentText, fontWeight: '800', fontSize: 13 }
  });
}
