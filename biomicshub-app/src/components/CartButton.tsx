import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useCart } from '@/src/context/CartContext';
import EmojiIcon from '@/src/components/ui/EmojiIcon';
import { useTheme } from '@/src/theme/ThemeContext';

export default function CartButton({ bordered = false }: { bordered?: boolean }) {
  const { count } = useCart();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/cart')}
      hitSlop={8}
      style={[
        styles.btn,
        bordered && { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }
      ]}
    >
      <EmojiIcon name="cart" size="sm" />
      {count > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.bg }]}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, overflow: 'visible' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' }
});
