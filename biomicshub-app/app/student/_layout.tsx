import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';

export default function StudentTabsLayout() {
  const { colors } = useTheme();
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
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="live" options={{ title: 'Live', tabBarIcon: icon('videocam-outline') }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: icon('play-circle-outline') }} />
      <Tabs.Screen name="tests" options={{ title: 'Tests', tabBarIcon: icon('document-text-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline') }} />
      <Tabs.Screen name="exams" options={{ href: null, title: 'Exams' }} />
      <Tabs.Screen name="alerts" options={{ href: null, title: 'Notifications' }} />
    </Tabs>
  );
}
