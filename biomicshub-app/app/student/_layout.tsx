import React from 'react';
import { Tabs } from 'expo-router';
import StudentTabBar from '@/src/components/navigation/StudentTabBar';
import { useTheme } from '@/src/theme/ThemeContext';
import { usePushRegistration } from '@/src/hooks/usePushRegistration';

export default function StudentTabsLayout() {
  const { colors } = useTheme();
  usePushRegistration();

  return (
    <Tabs
      tabBar={(props) => <StudentTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' }
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="live" options={{ title: 'Live' }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', headerShown: false }} />
      <Tabs.Screen name="tests" options={{ title: 'Tests' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="performance" options={{ href: null, title: 'Performance' }} />
      <Tabs.Screen name="exams" options={{ href: null, title: 'Exams' }} />
      <Tabs.Screen name="alerts" options={{ href: null, title: 'Notifications' }} />
    </Tabs>
  );
}
