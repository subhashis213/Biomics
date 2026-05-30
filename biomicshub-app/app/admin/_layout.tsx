import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { usePushRegistration } from '@/src/hooks/usePushRegistration';

export default function AdminTabsLayout() {
  const { colors } = useTheme();
  usePushRegistration();
  const icon = (name: React.ComponentProps<typeof Ionicons>['name']) =>
    ({ color, size }: { color: string; size: number }) => <Ionicons name={name} size={size ?? 22} color={color} />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, height: 60, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' }
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="live" options={{ title: 'Live', tabBarIcon: icon('videocam-outline') }} />
      <Tabs.Screen name="notify" options={{ title: 'Notify', tabBarIcon: icon('notifications-outline') }} />
      <Tabs.Screen name="learners" options={{ title: 'Learners', tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="content" options={{ title: 'Content', tabBarIcon: icon('film-outline') }} />
      <Tabs.Screen name="banners" options={{ href: null, title: 'Home banners' }} />
      <Tabs.Screen name="revenue" options={{ href: null, title: 'Revenue' }} />
    </Tabs>
  );
}
