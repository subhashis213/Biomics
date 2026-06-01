import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
  ViewToken
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { resolveApiAssetUrl } from '@/src/api/client';
import { StudentVoice } from '@/src/api/landing';
import { useTheme } from '@/src/theme/ThemeContext';
import { ThemeColors } from '@/src/theme/theme';

const SLIDE_INTERVAL_MS = 5000;
const HORIZONTAL_PADDING = 16;

type Props = {
  voices: StudentVoice[];
};

function Stars({ rating, color }: { rating: number; color: string }) {
  const filled = Math.max(0, Math.min(5, Math.round(rating || 5)));
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons key={i} name={i < filled ? 'star' : 'star-outline'} size={14} color={color} />
      ))}
    </View>
  );
}

export default function StudentVoiceCarousel({ voices }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const listRef = useRef<FlatList<StudentVoice>>(null);
  const [index, setIndex] = useState(0);
  const slideWidth = Dimensions.get('window').width - HORIZONTAL_PADDING * 2;

  useEffect(() => {
    if (voices.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % voices.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [voices.length]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const active = viewableItems[0]?.index;
    if (typeof active === 'number') setIndex(active);
  }).current;

  if (!voices.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Student voices</Text>
          <Text style={styles.heading}>What our students say</Text>
        </View>
        <View style={styles.badge}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accent} />
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={voices}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item._id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
        onScrollToIndexFailed={() => {}}
        getItemLayout={(_, i) => ({ length: slideWidth, offset: slideWidth * i, index: i })}
        onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
          if (Number.isFinite(next)) setIndex(next);
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: slideWidth }]}>
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Ionicons name="format-quote" size={26} color={colors.accent} />
                <Stars rating={item.rating || 5} color={colors.warn} />
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.message}>{item.message}</Text>

                <View style={styles.profileRow}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: resolveApiAssetUrl(item.avatarUrl) }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarLetter}>{String(item.name || 'S').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.role ? <Text style={styles.role}>{item.role}</Text> : null}
                  </View>
                  <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                </View>
              </View>
            </View>
          </View>
        )}
      />

      {voices.length > 1 ? (
        <View style={styles.dots}>
          {voices.map((voice, dotIndex) => (
            <View key={voice._id} style={[styles.dot, dotIndex === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    section: { marginBottom: 22 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    eyebrow: { color: c.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
    heading: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
    badge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center'
    },
    slide: { paddingRight: 0 },
    card: {
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: c.accentSoft,
      borderBottomWidth: 1,
      borderBottomColor: c.border
    },
    cardBody: { padding: 16, paddingTop: 14 },
    message: {
      color: c.text,
      fontSize: 15,
      lineHeight: 23,
      fontWeight: '500',
      marginBottom: 16
    },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarImage: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.cardAlt,
      borderWidth: 2,
      borderColor: c.accentSoft
    },
    avatarFallback: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.accent
    },
    avatarLetter: { color: c.accent, fontWeight: '800', fontSize: 18 },
    name: { color: c.text, fontWeight: '800', fontSize: 15 },
    role: { color: c.muted, fontSize: 13, marginTop: 2 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border },
    dotActive: { width: 18, backgroundColor: c.accent }
  });
}
