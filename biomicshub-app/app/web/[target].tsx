import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { useTheme } from '@/src/theme/ThemeContext';
import { getApiBase } from '@/src/api/client';
import { Screen } from '@/src/components/ui';
import { decodeRouteParam } from '@/src/utils/format';

const ROUTES: Record<string, { user: string; admin: string; title: string }> = {
  'community-chat': {
    user: '/student/community-chat',
    admin: '/admin/community-chat',
    title: 'Community chat'
  }
};

export default function WebScreen() {
  const params = useLocalSearchParams<{ target: string }>();
  const target = decodeRouteParam(params.target);
  const { token, role, username } = useAuth();
  const { colors } = useTheme();

  const config = ROUTES[target] || { user: '/student', admin: '/admin', title: 'BiomicsHub' };
  const path = role === 'admin' ? config.admin : config.user;
  const url = `${getApiBase()}${path}`;

  const injectedSession = useMemo(() => {
    const session = JSON.stringify({ role, username, token });
    const safeRole = JSON.stringify(role);
    return `(function(){try{
      window.localStorage.setItem('biomics_session', ${JSON.stringify(session)});
      window.sessionStorage.setItem('biomics_session', ${JSON.stringify(session)});
      window.localStorage.setItem('sessionRole', ${safeRole});
      window.sessionStorage.setItem('sessionRole', ${safeRole});
    }catch(e){}})(); true;`;
  }, [role, username, token]);

  return (
    <Screen>
      <Stack.Screen options={{ title: config.title }} />
      <WebView
        source={{ uri: url }}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={injectedSession}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.center, { backgroundColor: colors.bg }]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.muted, marginTop: 10 }}>Loading {config.title.toLowerCase()}…</Text>
          </View>
        )}
        style={{ flex: 1, backgroundColor: colors.bg }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }
});
