import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';
import { fetchLearners, Learner } from '@/src/api/admin';
import { Card, ErrorBanner, Eyebrow, LoadingBlock, Screen, Subtitle, Title } from '@/src/components/ui';

export default function AdminLearners() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (query: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchLearners(token, 1, query);
      setLearners(res.users || []);
      setTotal(res.total || 0);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load learners.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const handle = setTimeout(() => load(search), 350);
    return () => clearTimeout(handle);
  }, [search, load]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Eyebrow>Learners</Eyebrow>
        <Title>Registered students ({total})</Title>
        <Subtitle>Search by name, city or email.</Subtitle>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search learners…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
          />
        </View>
        <ErrorBanner message={error} />
        {loading ? <LoadingBlock /> : null}
        {!loading && learners.map((u) => (
          <Card key={u.username}>
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(u.username || '?').slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{u.username}</Text>
                  {u.class ? <Text style={styles.class}>{u.class}</Text> : null}
                </View>
                <Text style={styles.meta}>{[u.phone, u.city, u.email].filter(Boolean).join(' · ') || 'No contact info'}</Text>
              </View>
            </View>
          </Card>
        ))}
        {!loading && !learners.length ? <Text style={styles.empty}>No learners found.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 32 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      marginVertical: 12
    },
    input: { flex: 1, color: c.text, paddingVertical: 12, fontSize: 15 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: c.accent, fontWeight: '800', fontSize: 16 },
    nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    name: { color: c.text, fontWeight: '700', fontSize: 15, flex: 1 },
    class: { color: c.accent, fontWeight: '700', fontSize: 12 },
    meta: { color: c.muted, fontSize: 13, marginTop: 4 },
    empty: { color: c.muted }
  });
}
