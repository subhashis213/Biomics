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
    <View style={stylesStars.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons key={i} name={i < filled ? 'star' : 'star-outline'} size={13} color={color} />
      ))}
    </View>
  );
}

const stylesStars = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 }
});

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
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}>
          <View style={styles.sectionIcon}>
            <Ionicons name="people" size={18} color={colors.accentText} />
          </View>
          <View>
            <Text style={styles.eyebrow}>Student voices</Text>
            <Text style={styles.heading}>Real stories from learners</Text>
          </View>
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
            <View style={styles.poster}>
              {/* Poster header band */}
              <View style={styles.posterHeader}>
                <View style={styles.posterHeaderGlow} />
                <Text style={styles.posterLabel}>STUDENT VOICE</Text>
                <Stars rating={item.rating || 5} color="#fde68a" />
              </View>

              {/* Decorative quote — text, not a missing icon */}
              <Text style={styles.quoteMark} accessibilityElementsHidden importantForAccessibility="no">
                “
              </Text>

              <View style={styles.posterBody}>
                <Text style={styles.message}>{item.message}</Text>

                <View style={styles.profileCard}>
                  {item.avatarUrl ? (
                    <Image
                      source={{ uri: resolveApiAssetUrl(item.avatarUrl) }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarLetter}>
                        {String(item.name || 'S').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.profileMeta}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                      <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                    </View>
                    {item.role ? (
                      <Text style={styles.role} numberOfLines={1}>{item.role}</Text>
                    ) : (
                      <Text style={styles.role}>BiomicsHub student</Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.posterFooter}>
                <Ionicons name="school-outline" size={14} color={colors.accent} />
                <Text style={styles.footerText}>Verified learner feedback</Text>
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
    sectionHeader: { marginBottom: 12 },
    sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sectionIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    eyebrow: {
      color: c.accent,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase'
    },
    heading: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
    slide: { paddingRight: 0 },
    poster: {
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4
    },
    posterHeader: {
      backgroundColor: c.accent,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      overflow: 'hidden'
    },
    posterHeaderGlow: {
      position: 'absolute',
      right: -20,
      top: -20,
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: 'rgba(255,255,255,0.15)'
    },
    posterLabel: {
      color: c.accentText,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.2
    },
    quoteMark: {
      position: 'absolute',
      top: 52,
      right: 14,
      fontSize: 72,
      lineHeight: 72,
      color: c.accentSoft,
      fontWeight: '900',
      opacity: 0.55
    },
    posterBody: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12 },
    message: {
      color: c.text,
      fontSize: 15,
      lineHeight: 24,
      fontWeight: '500',
      minHeight: 72,
      paddingRight: 36
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 16,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.cardAlt,
      borderWidth: 1,
      borderColor: c.border
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.card,
      borderWidth: 2,
      borderColor: c.accent
    },
    avatarFallback: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.accent
    },
    avatarLetter: { color: c.accent, fontWeight: '900', fontSize: 20 },
    profileMeta: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { color: c.text, fontWeight: '800', fontSize: 15, flexShrink: 1 },
    role: { color: c.muted, fontSize: 12, marginTop: 3, fontWeight: '600' },
    posterFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.cardAlt
    },
    footerText: { color: c.muted, fontSize: 11, fontWeight: '700' },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border },
    dotActive: { width: 18, backgroundColor: c.accent }
  });
}
