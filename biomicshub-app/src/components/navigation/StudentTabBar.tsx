import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_ICONS } from '@/src/constants/appIcons';
import EmojiIcon from '@/src/components/ui/EmojiIcon';
import { useTheme } from '@/src/theme/ThemeContext';

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  live: 'Live',
  learn: 'Learn',
  tests: 'Tests',
  profile: 'Profile'
};

export default function StudentTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors, insets.bottom);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const iconKey = TAB_ICONS[route.name];
          if (!iconKey) return null;

          const { options } = descriptors[route.key];
          const label = options.title || TAB_LABELS[route.name] || route.name;
          const focused = state.index === index;

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[styles.item, focused && styles.itemFocused]}
            >
              <EmojiIcon name={iconKey} size="tab" style={focused ? styles.iconFocused : undefined} />
              <Text style={[styles.label, focused && styles.labelFocused]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(c: ReturnType<typeof useTheme>['colors'], bottomInset: number) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.tabBar,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingBottom: Math.max(bottomInset, 8),
      paddingTop: 8,
      paddingHorizontal: 6
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between'
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 4,
      borderRadius: 16
    },
    itemFocused: {
      backgroundColor: c.accentSoft
    },
    iconFocused: {
      transform: [{ scale: 1.06 }]
    },
    label: {
      color: c.muted,
      fontSize: 10,
      fontWeight: '700'
    },
    labelFocused: {
      color: c.accent,
      fontWeight: '800'
    }
  });
}
