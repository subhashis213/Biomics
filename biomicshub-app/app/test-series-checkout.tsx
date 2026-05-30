import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { createTestSeriesOrder, TestSeriesOrderResponse, verifyTestSeriesPayment } from '@/src/api/testSeries';
import { getApiBase } from '@/src/api/client';
import { ErrorBanner, PrimaryButton, Screen } from '@/src/components/ui';
import { decodeRouteParam, formatInrFromPaise } from '@/src/utils/format';
import { removeTestSeriesCartItem } from '@/src/utils/testSeriesCart';

type Phase = 'loading' | 'pay' | 'verifying' | 'success' | 'error';

function buildCheckoutHtml(order: NonNullable<TestSeriesOrderResponse['razorpayOrder']>, keyId: string, title: string, contact: string) {
  const opts = {
    key: keyId,
    amount: order.amount,
    currency: order.currency || 'INR',
    name: 'BiomicsHub',
    description: title,
    order_id: order.id,
    prefill: { contact },
    theme: { color: '#0d9488' }
  };
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>html,body{margin:0;height:100%;background:#0b1220;color:#fff;font-family:-apple-system,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center}</style>
  </head>
  <body>
    <div><p>Opening secure payment…</p></div>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      function post(o){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
      var options = ${JSON.stringify(opts)};
      options.handler = function(res){ post({ status:'success', data: res }); };
      options.modal = { ondismiss: function(){ post({ status:'cancelled' }); } };
      try { var rzp = new Razorpay(options); rzp.on('payment.failed', function(r){ post({ status:'failed', error: (r && r.error && r.error.description) || 'Payment failed' }); }); rzp.open(); }
      catch(e){ post({ status:'failed', error: String(e) }); }
    </script>
  </body>
</html>`;
}

export default function TestSeriesCheckoutScreen() {
  const params = useLocalSearchParams<{
    course: string;
    seriesType?: string;
    title?: string;
    cartKey?: string;
    voucherCode?: string;
  }>();
  const course = decodeRouteParam(params.course);
  const seriesType = (decodeRouteParam(params.seriesType) || 'topic_test') as 'topic_test' | 'full_mock';
  const title = decodeRouteParam(params.title) || (seriesType === 'full_mock' ? 'Full mock series' : 'Topic test series');
  const cartKey = decodeRouteParam(params.cartKey);
  const voucherCode = decodeRouteParam(params.voucherCode).toUpperCase();

  const { token, student, username, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [order, setOrder] = useState<TestSeriesOrderResponse | null>(null);

  const start = useCallback(async () => {
    setPhase('loading');
    setError('');
    try {
      const res = await createTestSeriesOrder(token!, {
        course,
        seriesType,
        ...(voucherCode ? { voucherCode } : {})
      });
      setOrder(res);
      if (res.alreadyOwned || res.free) {
        await refreshProfile();
        if (cartKey && username) await removeTestSeriesCartItem(username, cartKey);
        setPhase('success');
        return;
      }
      if (!res.razorpayOrder) throw new Error('Payment could not be started.');
      setPhase('pay');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setPhase('error');
    }
  }, [token, course, seriesType, voucherCode, cartKey, username, refreshProfile]);

  useEffect(() => { start(); }, [start]);

  const onMessage = useCallback(async (raw: string) => {
    let msg: { status?: string; data?: Record<string, string>; error?: string } = {};
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.status === 'cancelled') {
      setError('Payment cancelled.');
      setPhase('error');
      return;
    }
    if (msg.status === 'failed') {
      setError(msg.error || 'Payment failed.');
      setPhase('error');
      return;
    }
    if (msg.status === 'success' && msg.data) {
      setPhase('verifying');
      try {
        await verifyTestSeriesPayment(token!, {
          razorpayOrderId: msg.data.razorpay_order_id,
          razorpayPaymentId: msg.data.razorpay_payment_id,
          razorpaySignature: msg.data.razorpay_signature
        });
        await refreshProfile();
        if (cartKey && username) await removeTestSeriesCartItem(username, cartKey);
        setPhase('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Payment verification failed.');
        setPhase('error');
      }
    }
  }, [token, cartKey, username, refreshProfile]);

  const amount = order?.amountInPaise ?? order?.razorpayOrder?.amount ?? 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Test series checkout' }} />
      {phase === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Preparing your order…</Text>
        </View>
      ) : null}

      {phase === 'pay' && order?.razorpayOrder ? (
        <WebView
          source={{
            html: buildCheckoutHtml(order.razorpayOrder, order.keyId || '', title, student?.phone || ''),
            baseUrl: getApiBase()
          }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(e) => onMessage(e.nativeEvent.data)}
          style={{ flex: 1, backgroundColor: colors.bg }}
        />
      ) : null}

      {phase === 'verifying' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Confirming your payment…</Text>
        </View>
      ) : null}

      {phase === 'success' ? (
        <View style={styles.center}>
          <View style={[styles.iconCircle, { backgroundColor: colors.successBg }]}>
            <Ionicons name="checkmark-done" size={42} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>Purchase complete</Text>
          <Text style={styles.muted}>{title} is now active. Open the Tests tab to start practicing.</Text>
          <View style={{ height: 18 }} />
          <PrimaryButton label="Go to tests" onPress={() => router.replace('/student/tests')} />
          <View style={{ height: 10 }} />
          <PrimaryButton label="Back" variant="outline" onPress={() => router.back()} />
        </View>
      ) : null}

      {phase === 'error' ? (
        <ScrollView contentContainerStyle={styles.center}>
          <View style={[styles.iconCircle, { backgroundColor: colors.errorBg }]}>
            <Ionicons name="alert" size={42} color={colors.danger} />
          </View>
          <Text style={styles.successTitle}>Checkout stopped</Text>
          <View style={{ width: '100%', marginTop: 8 }}>
            <ErrorBanner message={error} />
          </View>
          {amount ? <Text style={styles.muted}>Amount: {formatInrFromPaise(amount)}</Text> : null}
          <View style={{ height: 18 }} />
          <PrimaryButton label="Try again" onPress={start} />
          <View style={{ height: 10 }} />
          <PrimaryButton label="Back" variant="outline" onPress={() => router.back()} />
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    muted: { color: c.muted, marginTop: 10, textAlign: 'center' },
    iconCircle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    successTitle: { color: c.text, fontSize: 20, fontWeight: '800' }
  });
}
