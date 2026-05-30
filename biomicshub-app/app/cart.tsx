import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { Stack, router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/src/context/AuthContext';
import { useCart } from '@/src/context/CartContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { PlanType, previewOrder } from '@/src/api/payments';
import { ErrorBanner, Eyebrow, Screen, Subtitle, SuccessBanner, Title } from '@/src/components/ui';
import { formatInrFromPaise } from '@/src/utils/format';
import { readTestSeriesCart, removeTestSeriesCartItem, TestSeriesCartItem } from '@/src/utils/testSeriesCart';

export default function CartScreen() {
  const { token, username } = useAuth();
  const { items, removeItem, setPlan, setVoucher, clearVoucher, subtotalInPaise, itemPrice } = useCart();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draftCodes, setDraftCodes] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');
  const [tsItems, setTsItems] = useState<TestSeriesCartItem[]>([]);

  const loadTsCart = useCallback(async () => {
    if (!username) return;
    setTsItems(await readTestSeriesCart(username));
  }, [username]);

  useFocusEffect(useCallback(() => { loadTsCart(); }, [loadTsCart]));

  function priceFor(planType: PlanType, pro: number, elite: number) {
    return planType === 'elite' ? elite : pro;
  }

  async function applyCoupon(itemKey: string) {
    const item = items.find((i) => i.key === itemKey);
    if (!item || !token) return;
    const code = String(draftCodes[itemKey] || '').trim().toUpperCase();
    if (!code) {
      setCouponError('Enter a coupon code.');
      return;
    }
    setApplying(itemKey);
    setCouponError('');
    setCouponSuccess('');
    try {
      const res = await previewOrder(token, {
        course: item.course,
        batch: item.batch,
        moduleName: item.moduleName,
        planType: item.planType,
        voucherCode: code
      });
      if (res.unlocked) {
        setCouponSuccess('Already unlocked — no payment needed.');
        setVoucher(itemKey, code, { originalAmountInPaise: 0, discountInPaise: 0, finalAmountInPaise: 0 });
        return;
      }
      const pricing = res.pricing;
      if (!pricing) throw new Error('Invalid coupon response.');
      if (pricing.discountInPaise <= 0 && pricing.finalAmountInPaise >= pricing.originalAmountInPaise) {
        throw new Error('This coupon is not valid for this item.');
      }
      setVoucher(itemKey, code, {
        originalAmountInPaise: pricing.originalAmountInPaise,
        discountInPaise: pricing.discountInPaise,
        finalAmountInPaise: pricing.finalAmountInPaise
      });
      setCouponSuccess(`Coupon ${code} applied — saved ${formatInrFromPaise(pricing.discountInPaise)}`);
    } catch (err) {
      clearVoucher(itemKey);
      setCouponError(err instanceof Error ? err.message : 'Could not apply coupon.');
    } finally {
      setApplying(null);
    }
  }

  function buyTestSeries(item: TestSeriesCartItem) {
    router.push({
      pathname: '/test-series-checkout',
      params: {
        course: item.course,
        seriesType: item.seriesType,
        title: item.label,
        cartKey: item.key
      }
    });
  }

  async function removeTsItem(key: string) {
    if (!username) return;
    setTsItems(await removeTestSeriesCartItem(username, key));
  }

  const hasAny = items.length > 0 || tsItems.length > 0;

  function buy(
    key: string,
    course: string,
    batch: string,
    moduleName: string,
    planType: PlanType,
    label: string,
    voucherCode?: string
  ) {
    router.push({
      pathname: '/checkout',
      params: {
        course,
        batch,
        moduleName,
        planType,
        title: label,
        cartKey: key,
        ...(voucherCode ? { voucherCode } : {})
      }
    });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'My cart' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Eyebrow>Cart</Eyebrow>
        <Title>Your selections</Title>
        <Subtitle>
          {hasAny
            ? `${items.length + tsItems.length} item${items.length + tsItems.length > 1 ? 's' : ''} ready to purchase`
            : 'Your cart is empty'}
        </Subtitle>
        <View style={{ height: 12 }} />
        <ErrorBanner message={couponError} />
        <SuccessBanner message={couponSuccess} />

        {!hasAny ? (
          <Animated.View entering={FadeInDown} style={styles.emptyWrap}>
            <Ionicons name="cart-outline" size={48} color={colors.muted} />
            <Text style={styles.empty}>Browse courses or test series and add items to your cart.</Text>
            <Pressable style={styles.browseBtn} onPress={() => router.replace('/student/learn')}>
              <Text style={styles.browseText}>Browse courses</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {tsItems.length ? (
          <>
            <Text style={styles.sectionTitle}>Test series</Text>
            {tsItems.map((item, i) => (
              <Animated.View key={item.key} entering={FadeInDown.delay(i * 60)} layout={Layout} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseName}>{item.course}</Text>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    <Text style={styles.itemLabel}>{item.validityDays} days access</Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => removeTsItem(item.key)}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.price}>{formatInrFromPaise(item.priceInPaise)}</Text>
                  <Pressable style={styles.buyBtn} onPress={() => buyTestSeries(item)}>
                    <Ionicons name="flash" size={16} color={colors.accentText} />
                    <Text style={styles.buyText}>Buy now</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ))}
          </>
        ) : null}

        {items.length ? <Text style={styles.sectionTitle}>Course batches</Text> : null}

        {items.map((item, i) => {
          const base = priceFor(item.planType, item.proPriceInPaise, item.elitePriceInPaise);
          const final = itemPrice(item);
          const hasDiscount = Boolean(item.appliedPricing && item.appliedPricing.discountInPaise > 0);
          return (
            <Animated.View key={item.key} entering={FadeInDown.delay(i * 60)} layout={Layout} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courseName}>{item.courseDisplay || item.course}</Text>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => removeItem(item.key)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>

              <View style={styles.planRow}>
                {(['pro', 'elite'] as PlanType[]).map((p) => {
                  const selected = item.planType === p;
                  const pPrice = priceFor(p, item.proPriceInPaise, item.elitePriceInPaise);
                  return (
                    <Pressable key={p} onPress={() => setPlan(item.key, p)} style={[styles.planChip, selected && styles.planChipOn]}>
                      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={15} color={selected ? colors.accent : colors.muted} />
                      <Text style={[styles.planChipText, selected && styles.planChipTextOn]}>
                        {p === 'pro' ? 'Pro' : 'Elite'} · {formatInrFromPaise(pPrice)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.couponBox}>
                <Ionicons name="pricetag-outline" size={16} color={colors.accent} />
                <TextInput
                  value={draftCodes[item.key] ?? item.voucherCode ?? ''}
                  onChangeText={(v) => setDraftCodes((prev) => ({ ...prev, [item.key]: v.toUpperCase() }))}
                  placeholder="Coupon code"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  style={styles.couponInput}
                />
                <Pressable style={styles.applyBtn} onPress={() => applyCoupon(item.key)} disabled={applying === item.key}>
                  {applying === item.key ? (
                    <ActivityIndicator size="small" color={colors.accentText} />
                  ) : (
                    <Text style={styles.applyText}>Apply</Text>
                  )}
                </Pressable>
              </View>
              {item.voucherCode ? (
                <View style={styles.appliedRow}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.appliedText}>{item.voucherCode} applied</Text>
                  <Pressable onPress={() => { clearVoucher(item.key); setDraftCodes((p) => ({ ...p, [item.key]: '' })); }}>
                    <Text style={styles.removeCoupon}>Remove</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.cardBottom}>
                <View>
                  {hasDiscount ? <Text style={styles.mrp}>{formatInrFromPaise(base)}</Text> : null}
                  <Text style={styles.price}>{formatInrFromPaise(final)}</Text>
                  {hasDiscount ? (
                    <Text style={styles.saved}>You save {formatInrFromPaise(item.appliedPricing!.discountInPaise)}</Text>
                  ) : null}
                </View>
                <Pressable
                  style={styles.buyBtn}
                  onPress={() => buy(item.key, item.course, item.batch, item.moduleName, item.planType, item.label, item.voucherCode)}
                >
                  <Ionicons name="flash" size={16} color={colors.accentText} />
                  <Text style={styles.buyText}>Buy now</Text>
                </Pressable>
              </View>
            </Animated.View>
          );
        })}

        {items.length ? (
          <Animated.View entering={FadeInDown} style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatInrFromPaise(subtotalInPaise)}</Text>
            </View>
            <Text style={styles.note}>Coupons are validated against your course. Each item checks out separately via Razorpay.</Text>
          </Animated.View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 40 },
    emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 14 },
    empty: { color: c.muted, textAlign: 'center' },
    browseBtn: { backgroundColor: c.accent, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
    browseText: { color: c.accentText, fontWeight: '800' },
    card: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 12 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    courseName: { color: c.text, fontSize: 16, fontWeight: '800' },
    itemLabel: { color: c.muted, marginTop: 3, fontSize: 13 },
    planRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    planChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: c.cardAlt },
    planChipOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
    planChipText: { color: c.muted, fontWeight: '600', fontSize: 12 },
    planChipTextOn: { color: c.text },
    couponBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: c.cardAlt, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 4 },
    couponInput: { flex: 1, color: c.text, fontSize: 14, paddingVertical: 10 },
    applyBtn: { backgroundColor: c.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minWidth: 72, alignItems: 'center' },
    applyText: { color: c.accentText, fontWeight: '800', fontSize: 13 },
    appliedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    appliedText: { color: c.success, fontWeight: '700', fontSize: 12, flex: 1 },
    removeCoupon: { color: c.danger, fontWeight: '700', fontSize: 12 },
    cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    mrp: { color: c.muted, fontSize: 13, textDecorationLine: 'line-through' },
    price: { color: c.text, fontSize: 20, fontWeight: '900' },
    saved: { color: c.success, fontSize: 12, marginTop: 2, fontWeight: '700' },
    buyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 12 },
    buyText: { color: c.accentText, fontWeight: '800' },
    summary: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, marginTop: 4 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    summaryLabel: { color: c.muted, fontSize: 15 },
    summaryValue: { color: c.text, fontSize: 20, fontWeight: '900' },
    note: { color: c.muted, fontSize: 12, marginTop: 10, lineHeight: 18 },
    sectionTitle: { color: c.text, fontWeight: '800', fontSize: 16, marginBottom: 10, marginTop: 4 }
  });
}
