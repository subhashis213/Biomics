import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { uploadAvatar } from '@/src/api/auth';
import { resolveApiAssetUrl } from '@/src/api/client';
import { fetchLearners, fetchPaymentHistory, fetchPushStatus } from '@/src/api/admin';
import { Badge, Card, ErrorBanner, Eyebrow, LoadingBlock, Screen, Subtitle, Title } from '@/src/components/ui';
import { formatInrFromPaise } from '@/src/utils/format';

const ACTIONS = [
  { icon: 'videocam-outline', label: 'Conduct & schedule live classes', route: '/admin/live' },
  { icon: 'images-outline', label: 'Manage home banners', route: '/admin/banners' },
  { icon: 'library-outline', label: 'Free books & study materials', route: '/admin/study-library' },
  { icon: 'notifications-outline', label: 'Send a push notification', route: '/admin/notify' },
  { icon: 'people-outline', label: 'View registered learners', route: '/admin/learners' },
  { icon: 'film-outline', label: 'Manage content & test series', route: '/admin/content' },
  { icon: 'cash-outline', label: 'Revenue & payments', route: '/admin/revenue' }
] as const;

export default function AdminDashboard() {
  const { admin, logout, token, role, refreshProfile } = useAuth();
  const { colors, mode, toggle } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [learnerCount, setLearnerCount] = useState(0);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [studentDevices, setStudentDevices] = useState(0);
  const [revenuePaise, setRevenuePaise] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [learners, status, payments] = await Promise.all([
        fetchLearners(token, 1).catch(() => ({ total: 0 })),
        fetchPushStatus(token).catch(() => ({ pushConfigured: false, studentDevices: 0, adminDevices: 0 })),
        fetchPaymentHistory(token, 1).catch(() => ({ payments: [] }))
      ]);
      setLearnerCount((learners as any).total || 0);
      setPushConfigured(status.pushConfigured);
      setStudentDevices(status.studentDevices);
      const captured = (payments.payments || [])
        .filter((p) => ['paid', 'captured'].includes(String(p.status).toLowerCase()))
        .reduce((sum, p) => sum + (p.amountInPaise || 0), 0);
      setRevenuePaise(captured);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function changeAvatar() {
    setError('');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError('Photo permission is required.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7
      });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      await uploadAvatar(token!, role, result.assets[0].uri);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update photo.');
    } finally {
      setUploading(false);
    }
  }

  const avatarUrl = resolveApiAssetUrl(admin?.avatarUrl);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={changeAvatar} style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="shield-checkmark" size={26} color={colors.muted} />
              </View>
            )}
            <View style={styles.editBadge}>
              {uploading ? <ActivityIndicator size="small" color={colors.accentText} /> : <Ionicons name="camera" size={12} color={colors.accentText} />}
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Eyebrow>Admin</Eyebrow>
            <Title>{admin?.username || 'Admin'}</Title>
          </View>
          <Pressable onPress={toggle} style={styles.iconBtn}>
            <Ionicons name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={logout} style={styles.iconBtn}>
            <Ionicons name="log-out-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        <ErrorBanner message={error} />

        <Card>
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Ionicons name="rocket-outline" size={18} color={colors.accent} />
              <Text style={styles.statusLabel}>Push notifications</Text>
            </View>
            {pushConfigured ? <Badge label="LIVE (FCM)" tone="success" /> : <Badge label="NOT CONFIGURED" tone="warn" />}
          </View>
          <Text style={styles.hint}>
            {pushConfigured
              ? studentDevices > 0
                ? `${studentDevices} student phone(s) ready to receive alerts (lock screen & banner).`
                : 'FCM is live but no student phones registered yet. Students must install the app, allow notifications, and log in as student.'
              : 'Add Firebase credentials on the backend to enable real pushes (see README).'}
          </Text>
        </Card>

        {loading ? <LoadingBlock /> : null}

        <View style={styles.metrics}>
          <Metric icon="people-outline" value={String(learnerCount)} label="Learners" colors={colors} />
          <Metric icon="phone-portrait-outline" value={String(studentDevices)} label="Devices" colors={colors} />
          <Metric icon="cash-outline" value={formatInrFromPaise(revenuePaise)} label="Revenue" colors={colors} />
        </View>

        <Card>
          <Eyebrow>Quick actions</Eyebrow>
          {ACTIONS.map((a) => (
            <Pressable key={a.route} style={styles.action} onPress={() => router.push(a.route as never)}>
              <View style={styles.actionIcon}>
                <Ionicons name={a.icon as never} size={18} color={colors.accent} />
              </View>
              <Text style={styles.actionText}>{a.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Metric({ icon, value, label, colors }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: 'center' }}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginTop: 6 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    avatarWrap: {},
    avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: c.accent },
    avatarPlaceholder: { backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center' },
    editBadge: { position: 'absolute', right: -2, bottom: -2, backgroundColor: c.accent, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.bg },
    iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusLabel: { color: c.text, fontWeight: '700', fontSize: 15 },
    hint: { color: c.muted, fontSize: 13, marginTop: 8, lineHeight: 18 },
    metrics: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border },
    actionIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: c.text, fontSize: 15, fontWeight: '600', flex: 1 }
  });
}
