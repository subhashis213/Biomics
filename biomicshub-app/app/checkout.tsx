import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/src/context/AuthContext';
import { useCart } from '@/src/context/CartContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { createOrder, CreateOrderResponse, PlanType, verifyPayment } from '@/src/api/payments';
import { getApiBase } from '@/src/api/client';
import { ErrorBanner, PrimaryButton, Screen } from '@/src/components/ui';
import { decodeRouteParam, formatInrFromPaise } from '@/src/utils/format';

type Phase = 'loading' | 'pay' | 'verifying' | 'success' | 'error';

function buildCheckoutHtml(order: NonNullable<CreateOrderResponse['order']>, keyId: string, title: string, contact: string) {
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

export default function CheckoutScreen() {
  const params = useLocalSearchParams<{
    course: string; batch?: string; moduleName?: string; planType?: string; title?: string; cartKey?: string; voucherCode?: string;
  }>();
  const course = decodeRouteParam(params.course);
  const batch = decodeRouteParam(params.batch) || 'General';
  const moduleName = decodeRouteParam(params.moduleName) || 'ALL_MODULES';
  const planType = (decodeRouteParam(params.planType) || 'pro') as PlanType;
  const title = decodeRouteParam(params.title) || 'Course purchase';
  const cartKey = decodeRouteParam(params.cartKey);
  const voucherCode = decodeRouteParam(params.voucherCode).toUpperCase();

  const { token, student, refreshProfile } = useAuth();
  const { removeItem } = useCart();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [order, setOrder] = useState<CreateOrderResponse | null>(null);

  const start = useCallback(async () => {
    setPhase('loading');
    setError('');
    try {
      const res = await createOrder(token!, {
        course,
        batch,
        moduleName,
        planType,
        ...(voucherCode ? { voucherCode } : {})
      });
      setOrder(res);
      if (res.unlocked || !res.order) {
        await refreshProfile();
        if (cartKey) removeItem(cartKey);
        setPhase('success');
        return;
      }
      setPhase('pay');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setPhase('error');
    }
  }, [token, course, batch, moduleName, planType, voucherCode, cartKey, refreshProfile, removeItem]);

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
        await verifyPayment(token!, {
          razorpay_order_id: msg.data.razorpay_order_id,
          razorpay_payment_id: msg.data.razorpay_payment_id,
          razorpay_signature: msg.data.razorpay_signature
        });
        await refreshProfile();
        if (cartKey) removeItem(cartKey);
        setPhase('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Payment verification failed.');
        setPhase('error');
      }
    }
  }, [token, cartKey, refreshProfile, removeItem]);

  const amount = order?.pricing?.finalAmountInPaise ?? order?.order?.amount ?? 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Checkout' }} />
      {phase === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Preparing your order…</Text>
        </View>
      ) : null}

      {phase === 'pay' && order?.order ? (
        <WebView
          source={{
            html: buildCheckoutHtml(order.order, order.razorpayKeyId || '', title, student?.phone || ''),
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
          <Text style={styles.muted}>{title} is now unlocked. Open the Learn tab to access content.</Text>
          <View style={{ height: 18 }} />
          <PrimaryButton label="Go to my courses" onPress={() => router.replace('/student/learn')} />
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
