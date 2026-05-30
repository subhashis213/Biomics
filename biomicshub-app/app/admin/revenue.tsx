import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchAllPaymentHistory, PaymentRow } from '@/src/api/admin';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, Screen, Subtitle, Title } from '@/src/components/ui';
import { formatInrFromPaise } from '@/src/utils/format';

function formatDate(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  } catch {
    return '';
  }
}


export default function AdminRevenue() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const rows = await fetchAllPaymentHistory(token, { status: 'paid' });
      setPayments(rows);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load revenue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalRevenue = payments.reduce((sum, payment) => sum + (payment.amountInPaise || 0), 0);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <Eyebrow>Revenue</Eyebrow>
        <Title>Payments</Title>
        <Subtitle>Exact amounts paid by students across all successful transactions.</Subtitle>
        <View style={{ height: 12 }} />

        <Card>
          <Text style={styles.totalLabel}>Total revenue</Text>
          <Text style={styles.total}>{formatInrFromPaise(totalRevenue)}</Text>
          <Text style={styles.count}>{payments.length} paid transaction{payments.length === 1 ? '' : 's'}</Text>
        </Card>

        <ErrorBanner message={error} />
        {loading ? <LoadingBlock /> : null}
        {!loading && payments.map((p) => (
          <Card key={p._id}>
            <View style={styles.row}>
              <Text style={styles.user}>{p.username}</Text>
              <Badge label="PAID" tone="success" />
            </View>
            <Text style={styles.meta}>
              {p.course}{p.moduleName ? ` · ${p.moduleName}` : ''}{p.planType ? ` · ${p.planType}` : ''}
            </Text>
            <View style={styles.row}>
              <Text style={styles.amount}>{formatInrFromPaise(p.amountInPaise)}</Text>
              <Text style={styles.date}>{formatDate(p.createdAt)}</Text>
            </View>
          </Card>
        ))}
        {!loading && !payments.length ? <Text style={styles.empty}>No paid transactions yet.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    totalLabel: { color: c.muted, fontSize: 13 },
    total: { color: c.accent, fontSize: 26, fontWeight: '800', marginTop: 4 },
    count: { color: c.muted, fontSize: 12, marginTop: 6 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    user: { color: c.text, fontWeight: '700', fontSize: 15, flex: 1 },
    meta: { color: c.muted, fontSize: 13, marginTop: 6 },
    amount: { color: c.text, fontWeight: '700', marginTop: 8 },
    date: { color: c.muted, fontSize: 12, marginTop: 8 },
    empty: { color: c.muted }
  });
}
