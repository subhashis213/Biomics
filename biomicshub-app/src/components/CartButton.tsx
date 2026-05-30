import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCart } from '@/src/context/CartContext';
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
      <Ionicons name="cart-outline" size={22} color={colors.text} />
      {count > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.bg }]}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' }
});
